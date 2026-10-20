export type AttendanceOperatorOption = {
  email: string; name: string | null; role: string | null; status: string | null;
  staffType: string | null; staffFunction: string | null;
  active: boolean; configured: boolean; eligible: boolean;
};

// Include pending staff from the last valid Sheets snapshot without creating users.
export const attendanceOperatorListQuery = `
  WITH snapshot AS (SELECT detail FROM attendance_audit WHERE action='staff_sync_snapshot' ORDER BY id DESC LIMIT 1),
  roster AS (SELECT s.* FROM snapshot, jsonb_to_recordset(snapshot.detail->'staff')
    AS s(email text,name text,id text,active boolean,status text,"staffType" text,"staffFunction" text))
  SELECT lower(p.email) AS email, COALESCE(NULLIF(r.name,''),p.name) AS name, p.role,
    CASE WHEN r.email IS NOT NULL AND (r.id IS DISTINCT FROM p.id OR r.status IS DISTINCT FROM 'Confirmado')
      THEN 'Revisar registro' ELSE p.status END AS status,
    COALESCE(r."staffType",p.staff_type) AS staff_type,
    COALESCE(r."staffFunction",p.staff_function) AS staff_function,
    COALESCE(o.active,FALSE) AS active, o.email IS NOT NULL AS configured,
    attendance_staff_can_register(p.email) AS eligible
  FROM participants p
  LEFT JOIN roster r ON r.email=lower(p.email)
  LEFT JOIN attendance_operators o ON o.email=lower(p.email)
  WHERE (r.active AND r."staffFunction"='Registro de asistencia') OR o.email IS NOT NULL
    OR (NOT EXISTS(SELECT 1 FROM snapshot) AND p.role='Staff' AND p.staff_function='Registro de asistencia')
  UNION ALL
  SELECT r.email,r.name,NULL AS role,'Registro general pendiente' AS status,r."staffType",r."staffFunction",
    COALESCE(o.active,FALSE),o.email IS NOT NULL,FALSE
  FROM roster r LEFT JOIN attendance_operators o ON o.email=r.email
  WHERE r.active AND r."staffFunction"='Registro de asistencia'
    AND NOT EXISTS(SELECT 1 FROM participants p WHERE lower(p.email)=r.email)
  UNION ALL
  SELECT o.email,NULL,NULL,'Registro general pendiente',NULL,NULL,o.active,TRUE,FALSE
  FROM attendance_operators o
  WHERE NOT EXISTS(SELECT 1 FROM participants p WHERE lower(p.email)=o.email)
    AND NOT EXISTS(SELECT 1 FROM roster r WHERE r.email=o.email AND r.active AND r."staffFunction"='Registro de asistencia')
  ORDER BY name NULLS LAST,email`;

export function operatorCanScan(operator: AttendanceOperatorOption) {
  return operator.active && operator.eligible && operator.role === "Staff"
    && operator.status === "Confirmado" && operator.staffFunction === "Registro de asistencia";
}
