// Closed visits only; exact seconds determine >50%, displayed minutes truncate to 2 decimals.
export const conferenceReportQuery = `
WITH coverage AS (
  SELECT s.id AS session_id,s.title,s.type,s.starts_at,s.ends_at,s.is_simulation,
    p.id AS participant_id,p.name,p.email,
    min(v.entered_at) AS entered_at,max(v.exited_at) AS exited_at,
    count(*) FILTER(WHERE v.exited_at IS NULL)::int AS open_intervals,
    range_agg(CASE WHEN v.exited_at IS NOT NULL AND least(v.exited_at,s.ends_at)>greatest(v.entered_at,s.starts_at)
      THEN tstzrange(greatest(v.entered_at,s.starts_at),least(v.exited_at,s.ends_at),'[)') ELSE NULL END) AS ranges
  FROM attendance_auditorium_members m JOIN attendance_sessions s ON s.id=m.session_id
  JOIN attendance_sessions b ON b.id=m.block_id
  JOIN attendance_visits v ON v.block_id=m.block_id JOIN participants p ON p.id=v.participant_id
  WHERE ($1::text IS NULL OR m.block_id=$1 OR s.id=$1) AND (NOT s.is_simulation OR $2::boolean)
  GROUP BY s.id,p.id
), measured AS (
  SELECT coverage.*,coalesce((SELECT sum(extract(epoch FROM upper(r)-lower(r))) FROM unnest(ranges) AS r),0) AS seconds FROM coverage
)
SELECT *,trunc(seconds/60,2)::float8 AS attended_minutes,
  CASE WHEN seconds>extract(epoch FROM ends_at-starts_at)/2 THEN trunc(seconds/60,2)::float8 ELSE 0 END AS credited_minutes,
  'auditorium_intervals'::text AS evidence_type
FROM measured ORDER BY starts_at,name`;

export const visitReportQuery = `SELECT v.id AS visit_id,v.block_id AS session_id,s.title,s.type,s.starts_at,s.ends_at,s.is_simulation,
  p.id AS participant_id,p.name,p.email,v.entered_at,v.exited_at,
  v.entry_operator,v.exit_operator,v.entry_source,v.exit_source,v.entry_reason,v.exit_reason,
  CASE WHEN v.exited_at IS NULL THEN 'Entrada sin salida: no computa' ELSE 'Intervalo cerrado' END AS interval_status
FROM attendance_visits v JOIN attendance_sessions s ON s.id=v.block_id JOIN participants p ON p.id=v.participant_id
WHERE ($1::text IS NULL OR s.id=$1 OR EXISTS(SELECT 1 FROM attendance_auditorium_members m WHERE m.block_id=s.id AND m.session_id=$1))
AND (NOT s.is_simulation OR $2::boolean) ORDER BY v.entered_at,v.id`;
