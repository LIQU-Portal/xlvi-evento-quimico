-- Run after attendance.sql in the same explicit migration transaction.
CREATE INDEX IF NOT EXISTS attendance_participants_qr_idx ON participants(qr_token) WHERE qr_token IS NOT NULL;
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS attendance_auditorium_blocks (
  block_id TEXT PRIMARY KEY REFERENCES attendance_sessions(id)
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS attendance_auditorium_members (
  block_id TEXT NOT NULL REFERENCES attendance_auditorium_blocks(block_id),
  session_id TEXT NOT NULL UNIQUE REFERENCES attendance_sessions(id),
  PRIMARY KEY(block_id, session_id)
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS attendance_visits (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  block_id TEXT NOT NULL REFERENCES attendance_auditorium_blocks(block_id),
  participant_id TEXT NOT NULL REFERENCES participants(id),
  entered_at TIMESTAMPTZ NOT NULL,
  exited_at TIMESTAMPTZ CHECK(exited_at >= entered_at),
  entry_operator TEXT NOT NULL REFERENCES attendance_operators(email),
  exit_operator TEXT REFERENCES attendance_operators(email),
  entry_source TEXT NOT NULL CHECK(entry_source IN ('qr','manual')),
  exit_source TEXT CHECK(exit_source IN ('qr','manual')),
  entry_reason TEXT,
  exit_reason TEXT,
  CHECK(entry_source <> 'manual' OR length(trim(entry_reason)) >= 5),
  CHECK(exit_source IS DISTINCT FROM 'manual' OR length(trim(exit_reason)) >= 5),
  CHECK((exited_at IS NULL) = (exit_operator IS NULL))
);
-- statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS attendance_visits_one_open ON attendance_visits(block_id, participant_id) WHERE exited_at IS NULL;
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS attendance_visits_report ON attendance_visits(block_id, participant_id, entered_at);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS attendance_scan_requests (
  request_id TEXT PRIMARY KEY,
  block_id TEXT NOT NULL REFERENCES attendance_auditorium_blocks(block_id),
  participant_id TEXT NOT NULL REFERENCES participants(id),
  operator_email TEXT NOT NULL REFERENCES attendance_operators(email),
  direction TEXT NOT NULL CHECK(direction IN ('entry','exit')),
  source TEXT NOT NULL,
  manual_reason TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL
);
-- statement-breakpoint
CREATE OR REPLACE FUNCTION record_attendance_v2(
  p_session_id TEXT, p_operator_email TEXT, p_reference TEXT, p_direction TEXT,
  p_source TEXT, p_manual_reason TEXT, p_allow_simulation BOOLEAN, p_request_id TEXT
) RETURNS TABLE(outcome TEXT, participant_id TEXT, participant_name TEXT, recorded_at TIMESTAMPTZ)
LANGUAGE plpgsql AS $$
DECLARE
  s attendance_sessions%ROWTYPE;
  p participants%ROWTYPE;
  v attendance_visits%ROWTYPE;
  r attendance_scan_requests%ROWTYPE;
  t TIMESTAMPTZ;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM attendance_auditorium_blocks b WHERE b.block_id=p_session_id) THEN
    -- Conference sessions are no longer scanned individually through the new API.
    IF EXISTS(SELECT 1 FROM attendance_sessions x WHERE x.id=p_session_id AND x.type='Conferencia') THEN
      RETURN QUERY SELECT 'session_unavailable'::text,NULL::text,NULL::text,NULL::timestamptz; RETURN;
    END IF;
    RETURN QUERY SELECT * FROM record_attendance(p_session_id,p_operator_email,p_reference,p_direction,p_source,p_manual_reason,p_allow_simulation); RETURN;
  END IF;
  IF p_direction NOT IN ('entry','exit') OR p_source NOT IN ('qr','manual') OR p_request_id IS NULL
    OR p_request_id !~ '^[a-fA-F0-9-]{36}$' THEN
    RETURN QUERY SELECT 'invalid_request'::text,NULL::text,NULL::text,NULL::timestamptz; RETURN;
  END IF;
  SELECT * INTO s FROM attendance_sessions x WHERE x.id=p_session_id AND x.active FOR SHARE;
  IF NOT FOUND OR (s.is_simulation AND NOT p_allow_simulation) THEN
    RETURN QUERY SELECT 'session_unavailable'::text,NULL::text,NULL::text,NULL::timestamptz; RETURN;
  END IF;
  PERFORM 1 FROM attendance_operators o JOIN participants x ON lower(x.email)=o.email
    WHERE o.email=lower(p_operator_email) AND o.active AND attendance_staff_can_register(o.email) FOR SHARE OF o;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'forbidden'::text,NULL::text,NULL::text,NULL::timestamptz; RETURN;
  END IF;
  PERFORM 1 FROM attendance_assignments a WHERE a.session_id=p_session_id AND a.operator_email=lower(p_operator_email) FOR SHARE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_assigned'::text,NULL::text,NULL::text,NULL::timestamptz; RETURN;
  END IF;
  IF p_source='manual' AND coalesce(length(trim(p_manual_reason)),0)<5 THEN
    RETURN QUERY SELECT 'reason_required'::text,NULL::text,NULL::text,NULL::timestamptz; RETURN;
  END IF;
  SELECT * INTO p FROM participants x WHERE (p_source='qr' AND x.qr_token=p_reference)
    OR (p_source='manual' AND x.id=p_reference) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_qr'::text,NULL::text,NULL::text,NULL::timestamptz; RETURN;
  END IF;
  IF p.status<>'Confirmado' THEN
    RETURN QUERY SELECT 'participant_cancelled'::text,NULL::text,NULL::text,NULL::timestamptz; RETURN;
  END IF;
  -- Lock request IDs as well as participant rows; a reused UUID cannot cross people.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id,0));
  SELECT * INTO r FROM attendance_scan_requests x WHERE x.request_id=p_request_id;
  IF FOUND THEN
    IF r.block_id<>p_session_id OR r.participant_id<>p.id OR r.operator_email<>lower(p_operator_email)
      OR r.direction<>p_direction OR r.source<>p_source OR r.manual_reason<>coalesce(trim(p_manual_reason),'') THEN
      RETURN QUERY SELECT 'invalid_request'::text,NULL::text,NULL::text,NULL::timestamptz; RETURN;
    END IF;
    RETURN QUERY SELECT 'duplicate'::text,p.id,p.name,r.recorded_at; RETURN;
  END IF;
  t:=clock_timestamp();
  IF (t AT TIME ZONE 'America/Mexico_City')::date<>(s.starts_at AT TIME ZONE 'America/Mexico_City')::date THEN
    RETURN QUERY SELECT 'outside_window'::text,NULL::text,NULL::text,NULL::timestamptz; RETURN;
  END IF;
  SELECT * INTO v FROM attendance_visits x WHERE x.block_id=p_session_id AND x.participant_id=p.id
    AND x.exited_at IS NULL FOR UPDATE;
  IF p_direction='entry' THEN
    IF FOUND THEN
      INSERT INTO attendance_scan_requests VALUES(p_request_id,p_session_id,p.id,lower(p_operator_email),p_direction,p_source,coalesce(trim(p_manual_reason),''),v.entered_at);
      RETURN QUERY SELECT 'duplicate'::text,p.id,p.name,v.entered_at; RETURN;
    END IF;
    IF EXISTS(SELECT 1 FROM attendance_visits x JOIN attendance_sessions other ON other.id=x.block_id
      WHERE x.participant_id=p.id AND x.exited_at IS NULL AND other.is_simulation=s.is_simulation
      AND (other.starts_at AT TIME ZONE 'America/Mexico_City')::date=(s.starts_at AT TIME ZONE 'America/Mexico_City')::date) THEN
      RETURN QUERY SELECT 'open_visit_elsewhere'::text,p.id,p.name,NULL::timestamptz; RETURN;
    END IF;
    INSERT INTO attendance_visits(block_id,participant_id,entered_at,entry_operator,entry_source,entry_reason)
      VALUES(p_session_id,p.id,t,lower(p_operator_email),p_source,CASE WHEN p_source='manual' THEN trim(p_manual_reason) END);
  ELSE
    IF NOT FOUND THEN
      SELECT * INTO v FROM attendance_visits x WHERE x.block_id=p_session_id AND x.participant_id=p.id ORDER BY x.entered_at DESC LIMIT 1;
      IF FOUND THEN
        INSERT INTO attendance_scan_requests VALUES(p_request_id,p_session_id,p.id,lower(p_operator_email),p_direction,p_source,coalesce(trim(p_manual_reason),''),v.exited_at);
        RETURN QUERY SELECT 'duplicate'::text,p.id,p.name,v.exited_at; RETURN;
      END IF;
      RETURN QUERY SELECT 'entry_required'::text,p.id,p.name,NULL::timestamptz; RETURN;
    END IF;
    UPDATE attendance_visits SET exited_at=t,exit_operator=lower(p_operator_email),exit_source=p_source,
      exit_reason=CASE WHEN p_source='manual' THEN trim(p_manual_reason) END WHERE id=v.id;
  END IF;
  INSERT INTO attendance_scan_requests VALUES(p_request_id,p_session_id,p.id,lower(p_operator_email),p_direction,p_source,coalesce(trim(p_manual_reason),''),t);
  RETURN QUERY SELECT 'recorded'::text,p.id,p.name,t;
END;
$$;
-- statement-breakpoint
CREATE OR REPLACE FUNCTION attendance_assert_schedule(p_plan JSONB,p_sim BOOLEAN,p_date TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  -- Serializes with readers' session row locks before checking immutable history.
  PERFORM 1 FROM attendance_sessions s WHERE s.is_simulation=p_sim
    AND (p_date IS NULL OR to_char(s.starts_at AT TIME ZONE 'America/Mexico_City','YYYY-MM-DD')=p_date)
    ORDER BY s.id FOR UPDATE;
  IF EXISTS (
    WITH locked AS (
      SELECT b.block_id FROM attendance_auditorium_blocks b JOIN attendance_sessions s ON s.id=b.block_id
      WHERE s.is_simulation=p_sim AND (p_date IS NULL OR to_char(s.starts_at AT TIME ZONE 'America/Mexico_City','YYYY-MM-DD')=p_date)
      AND EXISTS(SELECT 1 FROM attendance_visits v WHERE v.block_id=b.block_id)
    ), actual AS (
      SELECT m.block_id,m.session_id,s.starts_at,s.ends_at FROM attendance_auditorium_members m
      JOIN attendance_sessions s ON s.id=m.session_id WHERE m.block_id IN(SELECT block_id FROM locked)
    ), planned AS (
      SELECT x.block_id,x.session_id,x.starts_at::timestamptz AS starts_at,x.ends_at::timestamptz AS ends_at
      FROM jsonb_to_recordset(p_plan) AS x(block_id text,session_id text,starts_at text,ends_at text)
      WHERE x.block_id IN(SELECT block_id FROM locked)
    )
    SELECT 1 FROM ((TABLE actual EXCEPT TABLE planned) UNION ALL (TABLE planned EXCEPT TABLE actual)) changed
  ) THEN
    RAISE EXCEPTION 'No se cambian horarios, sedes o integrantes de bloques con lecturas. Requiere revisión de coordinación.' USING ERRCODE='23514';
  END IF;
END;
$$;
