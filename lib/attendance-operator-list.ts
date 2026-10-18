export type AttendanceOperatorOption = {
  email: string;
  name: string | null;
  role: string | null;
  status: string | null;
  staffType: string | null;
  active: boolean;
  configured: boolean;
};

// Include eligible staff without an operator row, and retain revoked accounts so
// coordination can see and disable stale grants. Being listed never grants access.
export const attendanceOperatorListQuery = `
  SELECT lower(p.email) AS email, p.name, p.role, p.status, p.staff_type,
    COALESCE(o.active, FALSE) AS active, o.email IS NOT NULL AS configured
  FROM participants p
  LEFT JOIN attendance_operators o ON o.email = lower(p.email)
  WHERE (p.role = 'Staff' AND p.status = 'Confirmado') OR o.email IS NOT NULL
  UNION ALL
  SELECT o.email, NULL AS name, NULL AS role, NULL AS status, NULL AS staff_type,
    o.active, TRUE AS configured
  FROM attendance_operators o
  WHERE NOT EXISTS (SELECT 1 FROM participants p WHERE lower(p.email) = o.email)
  ORDER BY name NULLS LAST, email`;

export function operatorCanScan(operator: AttendanceOperatorOption) {
  return operator.active && operator.role === "Staff" && operator.status === "Confirmado";
}
