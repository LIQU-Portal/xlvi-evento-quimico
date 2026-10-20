import "server-only";
import { getSql } from "@/lib/db";
import { parseStaffDirectory, revokeDirectoryOperatorsQuery, syncDirectoryParticipantsQuery } from "./attendance-staff-data";

async function fetchStaffDirectory() {
  const rawUrl = process.env.REGISTRATION_API_URL?.trim();
  const secret = process.env.REGISTRATION_API_SECRET?.trim();
  if (!rawUrl || !secret) throw new Error("Falta configurar el servicio privado de registros.");
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.hostname !== "script.google.com" || !url.pathname.endsWith("/exec")) throw new Error("Revisa la URL /exec del servicio de registros.");
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    let body: string;
    try {
      response = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "listStaffRegistrations", secret }), cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(45_000) });
      body = await response.text();
    } catch {
      if (attempt < 2) { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); continue; }
      throw new Error("No hubo conexión con Google tras tres intentos. La lista anterior se conserva; vuelve a intentar.");
    }
    if ([408,429,500,502,503,504].includes(response.status) && attempt < 2) {
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); continue;
    }
    let result;
    try { result = JSON.parse(body); } catch { throw new Error("Google devolvió una página en lugar de datos. Revisa la implementación /exec y sus permisos."); }
    if (!response.ok || !result.ok || !Array.isArray(result.staff)) throw new Error("No se recibió la lista de Staff. Revisa los datos y publica Code.gs actualizado en la implementación existente.");
    return parseStaffDirectory(result.staff);
  }
  throw new Error("No se actualizó Staff. La lista anterior se conserva.");
}

export async function syncAttendanceStaff(actor: string) {
  // Called only after the coordinator authorization in the server action.
  const requestedAt = new Date().toISOString();
  const staff = await fetchStaffDirectory();
  const data = JSON.stringify(staff);
  const sql = getSql();
  const result = await sql.transaction([
    sql.query("SELECT pg_advisory_xact_lock(hashtext('attendance-staff-sync'))"),
    // A slow older request must never replace a newer successful snapshot.
    sql.query(`SELECT 1 / CASE WHEN NOT EXISTS (SELECT 1 FROM attendance_audit
      WHERE action='staff_sync_snapshot' AND detail->>'requestedAt' > $1) THEN 1 ELSE 0 END`, [requestedAt]),
    sql.query(syncDirectoryParticipantsQuery, [data]),
    sql.query(revokeDirectoryOperatorsQuery, [data, actor]),
    sql.query("INSERT INTO attendance_audit(actor_email,action,detail) VALUES($1,'staff_sync_snapshot',$2::jsonb)", [actor, JSON.stringify({ requestedAt, staff })]),
  ]);
  const updated = result[2].length;
  const revoked = result[3].length;
  return { total: staff.length, updated, pending: staff.length - updated, revoked };
}
