import "server-only";

import { getSql } from "@/lib/db";
import { getProgramFromSheets } from "@/lib/sheets";
import { attendanceMessages, buildAttendanceSessions, normalizedEmailList, validScanReference,
  type AttendanceResult, type AttendanceSession } from "@/lib/attendance-rules";

export function isAttendanceAdmin(email: string | null | undefined) {
  const allowed = new Set(["cdquim@cucei.udg.mx", "jorge.lopezarce@academicos.udg.mx"]);
  const normalized = email?.trim().toLowerCase();
  return Boolean(normalized && allowed.has(normalized)
    && normalizedEmailList(process.env.ATTENDANCE_ADMIN_EMAILS).has(normalized));
}

export function simulationEnabled() {
  return process.env.ATTENDANCE_SIMULATION_ENABLED === "true" && process.env.VERCEL_ENV !== "production";
}

export async function attendanceAccess(email: string | null | undefined) {
  if (!email || !process.env.ATTENDANCE_ADMIN_EMAILS?.trim()) return { admin: false, operator: false };
  const admin = isAttendanceAdmin(email);
  try {
    const rows = await getSql().query(`SELECT 1 FROM attendance_operators o JOIN participants p ON lower(p.email) = o.email
      WHERE o.email = lower($1) AND o.active AND p.status = 'Confirmado' AND p.role = 'Staff'`, [email]);
    return { admin, operator: rows.length > 0 };
  } catch {
    // Una migración pendiente no debe impedir abrir Mi cuenta.
    return { admin, operator: false };
  }
}

function sessionFromRow(row: Record<string, unknown>): AttendanceSession {
  return {
    id: String(row.id), activityId: row.activity_id == null ? null : Number(row.activity_id),
    title: String(row.title), type: row.type as AttendanceSession["type"], venue: String(row.venue),
    startsAt: new Date(String(row.starts_at)).toISOString(), endsAt: new Date(String(row.ends_at)).toISOString(),
    isSimulation: Boolean(row.is_simulation), active: Boolean(row.active),
    entries: Number(row.entries ?? 0), exits: Number(row.exits ?? 0),
    operators: (row.operators ?? []) as string[],
  };
}

export async function listAttendanceSessions(operatorEmail?: string) {
  const sql = getSql();
  const rows = await sql.query(`SELECT s.*,
      (SELECT count(*) FROM attendance_events e WHERE e.session_id = s.id AND e.direction = 'entry') AS entries,
      (SELECT count(*) FROM attendance_events e WHERE e.session_id = s.id AND e.direction = 'exit') AS exits,
      ARRAY(SELECT a.operator_email FROM attendance_assignments a WHERE a.session_id = s.id ORDER BY a.operator_email) AS operators
    FROM attendance_sessions s WHERE (NOT s.is_simulation OR $2::boolean)
      AND ($1::text IS NULL OR (s.active
        AND (s.starts_at AT TIME ZONE 'America/Mexico_City')::date = (NOW() AT TIME ZONE 'America/Mexico_City')::date AND EXISTS (
        SELECT 1 FROM attendance_assignments a WHERE a.session_id = s.id AND a.operator_email = lower($1))))
    ORDER BY s.starts_at, s.title`, [operatorEmail ?? null, simulationEnabled()]);
  return rows.map((r) => sessionFromRow(r as Record<string, unknown>));
}

export async function listAttendanceOperators() {
  return getSql().query(`SELECT o.email, o.active, p.name, p.role, p.status FROM attendance_operators o
    LEFT JOIN participants p ON lower(p.email) = o.email ORDER BY o.email`);
}

export async function scanAttendance(input: {
  sessionId: string; operatorEmail: string; reference: string; direction: string; source: string; reason: string;
}): Promise<AttendanceResult> {
  if (!validScanReference(input.reference, input.source) || !["entry", "exit"].includes(input.direction)) {
    return { outcome: "invalid_request", message: attendanceMessages.invalid_request };
  }
  const rows = await getSql().query("SELECT * FROM record_attendance($1,$2,$3,$4,$5,$6,$7)", [
    input.sessionId, input.operatorEmail, input.reference, input.direction, input.source, input.reason, simulationEnabled(),
  ]);
  const row = rows[0];
  return {
    outcome: row.outcome as string, message: attendanceMessages[row.outcome as string] ?? "No fue posible registrar.",
    participantId: row.participant_id as string | undefined,
    participantName: row.participant_name as string | undefined,
    recordedAt: row.recorded_at ? new Date(String(row.recorded_at)).toISOString() : undefined,
  };
}

export async function syncAttendanceSessions(actor: string) {
  // No usar contenido de respaldo para una operación de control de asistencia.
  const program = await getProgramFromSheets({ fresh: true, allowFallback: false });
  const sessions = buildAttendanceSessions(program);
  if (!sessions.length) throw new Error("No hay sesiones con fecha y horario válidos. Revisa la hoja.");
  const sql = getSql();
  await sql.transaction([
    sql.query("UPDATE attendance_sessions SET active = FALSE, updated_at = NOW(), updated_by = $1 WHERE NOT is_simulation", [actor]),
    ...sessions.map((s) => sql.query(`INSERT INTO attendance_sessions
      (id, activity_id, title, type, venue, starts_at, ends_at, updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title, type = EXCLUDED.type, venue = EXCLUDED.venue,
        starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, active = TRUE, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [s.id, s.activityId, s.title, s.type, s.venue, s.startsAt, s.endsAt, actor])),
    sql.query("INSERT INTO attendance_audit (actor_email, action, detail) VALUES ($1,'sync_sessions',$2::jsonb)",
      [actor, JSON.stringify({ count: sessions.length })]),
  ]);
  return sessions.length;
}

export async function attendanceReport(sessionId?: string) {
  return getSql().query(`SELECT s.id AS session_id, s.title, s.type, s.starts_at, s.ends_at, s.is_simulation,
      p.id AS participant_id, p.name, p.email,
      max(e.recorded_at) FILTER (WHERE e.direction = 'entry') AS entered_at,
      max(e.recorded_at) FILTER (WHERE e.direction = 'exit') AS exited_at,
      max(e.operator_email) FILTER (WHERE e.direction = 'entry') AS entry_operator,
      max(e.operator_email) FILTER (WHERE e.direction = 'exit') AS exit_operator,
      max(e.manual_reason) FILTER (WHERE e.direction = 'entry') AS entry_reason,
      max(e.manual_reason) FILTER (WHERE e.direction = 'exit') AS exit_reason
    FROM attendance_events e JOIN attendance_sessions s ON s.id = e.session_id
    JOIN participants p ON p.id = e.participant_id
    WHERE ($1::text IS NULL OR s.id = $1) AND (NOT s.is_simulation OR $2::boolean)
    GROUP BY s.id, p.id ORDER BY s.starts_at, p.name`, [sessionId ?? null, simulationEnabled()]);
}
