export type StaffDirectoryEntry = {
  email: string; name: string; active: boolean; id: string | null;
  status: string | null; role: string | null; staffType: string; staffFunction: string;
};

export function parseStaffDirectory(input: unknown): StaffDirectoryEntry[] {
  if (!Array.isArray(input) || !input.length || input.length > 500) throw new Error("La lista de Staff está vacía o excede el límite. No se cambió nada.");
  const seen = new Set<string>();
  return input.map(value => {
    if (!value || typeof value !== "object") throw new Error("Respuesta de Staff inválida.");
    const r = value as Record<string, unknown>;
    const email = String(r.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200 || seen.has(email)) throw new Error("Hay correos inválidos o duplicados en Staff. No se cambió nada.");
    seen.add(email);
    if (typeof r.active !== "boolean" || typeof r.name !== "string") throw new Error("Publica la versión actualizada de Code.gs para sincronizar Staff desde el panel.");
    if (r.active && !["Alumno", "Académico"].includes(String(r.staffType))) throw new Error("Revisa staffType en la hoja Staff.");
    if (!["", "Apoyo operativo", "Registro de asistencia"].includes(String(r.staffFunction ?? ""))) throw new Error("Revisa staffFunction en la hoja Staff.");
    if (r.id !== null && !/^EQ26-[A-F0-9]{10}$/.test(String(r.id))) throw new Error("La hoja contiene un ID no válido. No se cambió nada.");
    if (r.status !== null && !["Confirmado", "Cancelado", "Pendiente"].includes(String(r.status))) throw new Error("Estado de registro desconocido. No se cambió nada.");
    return { email, name: r.name.trim().slice(0, 200), active: r.active, id: r.id as string | null,
      status: r.status as string | null, role: r.active ? "Staff" : null,
      staffType: r.active ? String(r.staffType) : "", staffFunction: r.active ? String(r.staffFunction ?? "") : "" };
  });
}

// Update only classification. Missing/mismatched identities remain pending, never recreated.
export const syncDirectoryParticipantsQuery = `UPDATE participants p SET
  role = CASE WHEN s.active THEN 'Staff' ELSE p.account_type END,
  staff_type = CASE WHEN s.active THEN NULLIF(s."staffType", '') ELSE NULL END,
  staff_function = CASE WHEN s.active THEN NULLIF(s."staffFunction", '') ELSE NULL END,
  updated_at = NOW()
  FROM jsonb_to_recordset($1::jsonb) AS s(email text, id text, active boolean, status text, "staffType" text, "staffFunction" text)
  WHERE lower(p.email)=s.email AND p.id=s.id AND p.status='Confirmado' AND s.status='Confirmado'
  RETURNING p.email`;

export const revokeDirectoryOperatorsQuery = `UPDATE attendance_operators o SET active=FALSE, updated_at=NOW(), updated_by=$2
  WHERE o.active AND NOT EXISTS (
    SELECT 1 FROM jsonb_to_recordset($1::jsonb) AS s(email text,id text,active boolean,status text,"staffFunction" text)
    JOIN participants p ON lower(p.email)=s.email AND p.id=s.id
    WHERE s.email=o.email AND s.active AND s.status='Confirmado' AND p.status='Confirmado'
      AND p.role='Staff' AND s."staffFunction"='Registro de asistencia'
  ) RETURNING o.email`;
