import type { AttendanceSession } from "./attendance-rules";

export function buildSupportDay(input: { date: string; venue: string }): AttendanceSession {
  const { date } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number(date.slice(0,4)) < 1) {
    throw new Error("Revisa la fecha del registro diario.");
  }
  // Calendar boundaries only: not a work schedule or a morning/afternoon cutoff.
  const startsAt = `${date}T00:00:00-06:00`, endsAt = `${date}T23:59:59.999-06:00`;
  if (!Number.isFinite(Date.parse(startsAt)) || new Date(`${date}T12:00:00-06:00`).toISOString().slice(0, 10) !== date) {
    throw new Error("La fecha del registro diario no es válida.");
  }
  const venue = input.venue.trim();
  if (!venue || venue.length > 160) throw new Error("Indica el punto de registro (máximo 160 caracteres).");
  return { id: `staff-support-${date}`, activityId: null, title: "Apoyo operativo · Registro del día",
    type: "Actividad", venue, startsAt, endsAt, isSimulation: false, active: true, isSupport: true };
}

export const supportReportQuery = `WITH coverage AS (
  SELECT s.id AS session_id,s.title,s.type,s.starts_at,s.ends_at,s.is_simulation,
    p.id AS participant_id,p.name,p.email,
    min(v.entered_at) AS entered_at,max(v.exited_at) AS exited_at,
    count(*) FILTER(WHERE v.exited_at IS NULL)::int AS open_intervals,
    range_agg(CASE WHEN v.exited_at IS NOT NULL AND v.exited_at>v.entered_at
      THEN tstzrange(v.entered_at,v.exited_at,'[)') END) AS ranges
  FROM attendance_sessions s JOIN attendance_support_visits v ON v.session_id=s.id
  JOIN participants p ON p.id=v.participant_id WHERE s.internal_kind='support'
    AND ($1::text IS NULL OR s.id=$1) AND (NOT s.is_simulation OR $2::boolean)
  GROUP BY s.id,p.id
), measured AS (
  SELECT coverage.*,coalesce((SELECT sum(extract(epoch FROM upper(r)-lower(r))) FROM unnest(ranges) AS r),0) AS seconds FROM coverage
)
SELECT *,trunc(seconds/60,2)::float8 AS attended_minutes,trunc(seconds/60,2)::float8 AS credited_minutes,
  trunc(seconds/3600,4)::float8 AS credited_hours,'support_intervals'::text AS evidence_type
FROM measured ORDER BY starts_at,name`;

export const supportVisitsQuery = `SELECT v.id AS visit_id,v.session_id,s.title,s.type,s.starts_at,s.ends_at,s.is_simulation,
  p.id AS participant_id,p.name,p.email,v.entered_at,v.exited_at,
  v.entry_operator,v.exit_operator,v.entry_source,v.exit_source,v.entry_reason,v.exit_reason,
  CASE WHEN v.exited_at IS NULL THEN 'Entrada sin salida: no computa' ELSE 'Intervalo cerrado' END AS interval_status
FROM attendance_support_visits v JOIN attendance_sessions s ON s.id=v.session_id JOIN participants p ON p.id=v.participant_id
WHERE ($1::text IS NULL OR s.id=$1) AND (NOT s.is_simulation OR $2::boolean) ORDER BY v.entered_at,v.id`;
