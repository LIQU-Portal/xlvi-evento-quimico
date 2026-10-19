import "server-only";

import { getSql } from "@/lib/db";
import { attendanceOperatorListQuery, type AttendanceOperatorOption } from "@/lib/attendance-operator-list";
import { getProgramFromSheets } from "@/lib/sheets";
import { buildAuditoriumBlocks } from "./attendance-auditorium";
import { conferenceReportQuery, visitReportQuery } from "./attendance-conference-report";
import { withAttendanceRetry } from "./attendance-retry";
import { localEventTime } from "./program-agenda";
import { attendanceMessages, inspectAttendanceSchedule, isAuthorizedCoordinator, areSimulationsEnabled, validScanReference,
  type AttendanceResult, type AttendanceSession } from "@/lib/attendance-rules";

export function isAttendanceAdmin(email: string | null | undefined) {
  return isAuthorizedCoordinator(email, process.env.ATTENDANCE_ADMIN_EMAILS);
}

export function simulationEnabled() {
  return areSimulationsEnabled(process.env.ATTENDANCE_SIMULATION_ENABLED, process.env.VERCEL_ENV);
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
    isAuditorium: Boolean(row.is_auditorium),
    entries: Number(row.entries ?? 0), exits: Number(row.exits ?? 0),
    operators: (row.operators ?? []) as string[],
  };
}

export async function listAttendanceSessions(operatorEmail?: string) {
  const sql = getSql();
  const rows = await sql.query(`SELECT s.*, EXISTS(SELECT 1 FROM attendance_auditorium_blocks b WHERE b.block_id=s.id) AS is_auditorium,
      (SELECT count(*) FROM attendance_events e WHERE e.session_id = s.id AND e.direction = 'entry') +
        (SELECT count(*) FROM attendance_visits v WHERE v.block_id=s.id) AS entries,
      (SELECT count(*) FROM attendance_events e WHERE e.session_id = s.id AND e.direction = 'exit') +
        (SELECT count(*) FROM attendance_visits v WHERE v.block_id=s.id AND v.exited_at IS NOT NULL) AS exits,
      ARRAY(SELECT a.operator_email FROM attendance_assignments a WHERE a.session_id = s.id ORDER BY a.operator_email) AS operators
    FROM attendance_sessions s WHERE (NOT s.is_simulation OR $2::boolean)
      AND (s.type<>'Conferencia' OR EXISTS(SELECT 1 FROM attendance_auditorium_blocks b WHERE b.block_id=s.id))
      AND ($1::text IS NULL OR (s.active
        AND (s.starts_at AT TIME ZONE 'America/Mexico_City')::date = (NOW() AT TIME ZONE 'America/Mexico_City')::date AND EXISTS (
        SELECT 1 FROM attendance_assignments a WHERE a.session_id = s.id AND a.operator_email = lower($1))))
    ORDER BY s.starts_at, s.title`, [operatorEmail ?? null, simulationEnabled()]);
  return rows.map((r) => sessionFromRow(r as Record<string, unknown>));
}

export async function listAttendanceOperators(): Promise<AttendanceOperatorOption[]> {
  const rows = await getSql().query(attendanceOperatorListQuery);
  return rows.map((row) => ({
    email: String(row.email), name: row.name == null ? null : String(row.name),
    role: row.role == null ? null : String(row.role), status: row.status == null ? null : String(row.status),
    staffType: row.staff_type == null ? null : String(row.staff_type),
    active: Boolean(row.active), configured: Boolean(row.configured),
  }));
}

export async function scanAttendance(input: {
  sessionId: string; operatorEmail: string; reference: string; direction: string; source: string; reason: string; requestId?: string;
}): Promise<AttendanceResult> {
  if (!validScanReference(input.reference, input.source) || !["entry", "exit"].includes(input.direction)) {
    return { outcome: "invalid_request", message: attendanceMessages.invalid_request };
  }
  const rows = await withAttendanceRetry(() => getSql().query("SELECT * FROM record_attendance_v2($1,$2,$3,$4,$5,$6,$7,$8)", [
    input.sessionId, input.operatorEmail, input.reference, input.direction, input.source, input.reason, simulationEnabled(), input.requestId ?? "",
  ]));
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
  const { sessions, skipped } = inspectAttendanceSchedule(program);
  if (!sessions.length) throw new Error("No hay sesiones con fecha y horario válidos. Revisa la hoja.");
  const result = await saveAttendanceSessions(sessions, actor, false);
  return { ...result, skipped };
}

export async function saveAttendanceSessions(sessions: AttendanceSession[], actor: string, simulation: boolean) {
  if (!sessions.length || sessions.some(s => s.isSimulation !== simulation)) throw new Error("Sesiones vacías o entorno de simulación inconsistente.");
  const groups = buildAuditoriumBlocks(sessions);
  const simulationDate = simulation ? localEventTime(new Date(sessions[0].startsAt)).date : null;
  const all = [...sessions, ...groups.map(g => g.block)];
  const plan = groups.flatMap(g => g.members.map(m => ({ block_id: g.block.id, session_id: m.id, starts_at: m.startsAt, ends_at: m.endsAt })));
  const sql = getSql();
  await sql.transaction([
    sql.query("SELECT attendance_assert_schedule($1::jsonb,$2,$3)", [JSON.stringify(plan), simulation, simulationDate]),
    sql.query(`DELETE FROM attendance_auditorium_members m USING attendance_sessions b
      WHERE b.id=m.block_id AND b.is_simulation=$1 AND ($2::text IS NULL OR to_char(b.starts_at AT TIME ZONE 'America/Mexico_City','YYYY-MM-DD')=$2)
      AND NOT EXISTS(SELECT 1 FROM attendance_visits v WHERE v.block_id=m.block_id)`, [simulation, simulationDate]),
    ...(!simulation ? [sql.query("UPDATE attendance_sessions SET active = FALSE, updated_at = NOW(), updated_by = $1 WHERE NOT is_simulation", [actor])] : []),
    ...all.map((s) => sql.query(`INSERT INTO attendance_sessions
      (id, activity_id, title, type, venue, starts_at, ends_at, updated_by, is_simulation)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title, type = EXCLUDED.type, venue = EXCLUDED.venue,
        starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, active = TRUE, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [s.id, s.activityId, s.title, s.type, s.venue, s.startsAt, s.endsAt, actor, simulation])),
    ...groups.flatMap(g => [
      sql.query("INSERT INTO attendance_auditorium_blocks VALUES($1) ON CONFLICT DO NOTHING", [g.block.id]),
      ...g.members.map(m => sql.query(`INSERT INTO attendance_auditorium_members VALUES($1,$2)
        ON CONFLICT(session_id) DO UPDATE SET block_id=EXCLUDED.block_id`, [g.block.id, m.id])),
      sql.query(`INSERT INTO attendance_assignments(session_id,operator_email,assigned_by)
        SELECT $1,a.operator_email,$3 FROM attendance_assignments a WHERE a.session_id=ANY($2::text[])
        GROUP BY a.operator_email ON CONFLICT DO NOTHING`, [g.block.id, g.members.map(m => m.id), actor]),
    ]),
    sql.query("INSERT INTO attendance_audit (actor_email, action, detail) VALUES ($1,'sync_sessions',$2::jsonb)",
      [actor, JSON.stringify({ count: sessions.length })]),
  ]);
  return { count: sessions.length, blocks: groups.length };
}

export async function attendanceReport(sessionId?: string): Promise<Record<string, unknown>[]> {
  const legacyPromise = getSql().query(`SELECT s.id AS session_id, s.title, s.type, s.starts_at, s.ends_at, s.is_simulation,
      p.id AS participant_id, p.name, p.email,
      max(e.recorded_at) FILTER (WHERE e.direction = 'entry') AS entered_at,
      max(e.recorded_at) FILTER (WHERE e.direction = 'exit') AS exited_at,
      max(e.operator_email) FILTER (WHERE e.direction = 'entry') AS entry_operator,
      max(e.operator_email) FILTER (WHERE e.direction = 'exit') AS exit_operator,
      max(e.source) FILTER (WHERE e.direction = 'entry') AS entry_source,
      max(e.source) FILTER (WHERE e.direction = 'exit') AS exit_source,
      max(e.manual_reason) FILTER (WHERE e.direction = 'entry') AS entry_reason,
      max(e.manual_reason) FILTER (WHERE e.direction = 'exit') AS exit_reason
    FROM attendance_events e JOIN attendance_sessions s ON s.id = e.session_id
    JOIN participants p ON p.id = e.participant_id
    WHERE ($1::text IS NULL OR s.id = $1) AND (NOT s.is_simulation OR $2::boolean)
    GROUP BY s.id, p.id ORDER BY s.starts_at, p.name`, [sessionId ?? null, simulationEnabled()]);
  const [legacy, conference] = await Promise.all([legacyPromise, getSql().query(conferenceReportQuery, [sessionId ?? null, simulationEnabled()])]);
  return [...legacy.map(r => ({ ...r, evidence_type: "legacy_or_single_entry" })), ...conference];
}

export async function attendanceVisits(sessionId?: string) {
  return getSql().query(visitReportQuery, [sessionId ?? null, simulationEnabled()]);
}
