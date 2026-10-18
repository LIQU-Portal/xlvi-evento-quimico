-- Se aplica explícitamente; nunca durante next build.
CREATE TABLE IF NOT EXISTS attendance_operators (
  email TEXT PRIMARY KEY CHECK (email = lower(trim(email))),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id TEXT PRIMARY KEY,
  activity_id INTEGER,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Conferencia', 'Taller', 'Concurso', 'Actividad')),
  venue TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL CHECK (ends_at > starts_at),
  is_simulation BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((starts_at AT TIME ZONE 'America/Mexico_City')::date = (ends_at AT TIME ZONE 'America/Mexico_City')::date),
  CHECK (is_simulation OR activity_id IS NOT NULL)
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS attendance_assignments (
  session_id TEXT NOT NULL REFERENCES attendance_sessions(id),
  operator_email TEXT NOT NULL REFERENCES attendance_operators(email),
  assigned_by TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, operator_email)
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS attendance_simulation_roster (
  session_id TEXT NOT NULL REFERENCES attendance_sessions(id),
  participant_id TEXT NOT NULL REFERENCES participants(id),
  PRIMARY KEY (session_id, participant_id)
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS attendance_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES attendance_sessions(id),
  participant_id TEXT NOT NULL REFERENCES participants(id),
  direction TEXT NOT NULL CHECK (direction IN ('entry', 'exit')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  operator_email TEXT NOT NULL REFERENCES attendance_operators(email),
  source TEXT NOT NULL CHECK (source IN ('qr', 'manual')),
  manual_reason TEXT,
  UNIQUE (session_id, participant_id, direction),
  CHECK (source <> 'manual' OR length(trim(manual_reason)) >= 5)
);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS attendance_events_session_time_idx ON attendance_events (session_id, recorded_at);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS attendance_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  detail JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- statement-breakpoint
CREATE OR REPLACE FUNCTION record_attendance(
  p_session_id TEXT, p_operator_email TEXT, p_reference TEXT,
  p_direction TEXT, p_source TEXT, p_manual_reason TEXT,
  p_allow_simulation BOOLEAN DEFAULT FALSE
) RETURNS TABLE (outcome TEXT, participant_id TEXT, participant_name TEXT, recorded_at TIMESTAMPTZ)
LANGUAGE plpgsql AS $$
DECLARE
  v_session attendance_sessions%ROWTYPE;
  v_person participants%ROWTYPE;
  v_time TIMESTAMPTZ;
  v_existing TIMESTAMPTZ;
BEGIN
  IF p_direction NOT IN ('entry', 'exit') OR p_source NOT IN ('qr', 'manual') THEN
    RETURN QUERY SELECT 'invalid_request'::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ; RETURN;
  END IF;
  SELECT * INTO v_session FROM attendance_sessions s WHERE s.id = p_session_id AND s.active FOR SHARE;
  IF NOT FOUND OR (v_session.is_simulation AND NOT p_allow_simulation) THEN
    RETURN QUERY SELECT 'session_unavailable'::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ; RETURN;
  END IF;
  PERFORM 1 FROM attendance_operators o JOIN participants p ON lower(p.email) = o.email
    WHERE o.email = lower(p_operator_email) AND o.active AND p.role = 'Staff' AND p.status = 'Confirmado'
    FOR SHARE OF o, p;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'forbidden'::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ; RETURN;
  END IF;
  PERFORM 1 FROM attendance_assignments a WHERE a.session_id = p_session_id
    AND a.operator_email = lower(p_operator_email) FOR SHARE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_assigned'::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ; RETURN;
  END IF;
  IF p_direction = 'exit' AND v_session.type <> 'Conferencia' THEN
    RETURN QUERY SELECT 'exit_not_required'::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ; RETURN;
  END IF;
  IF p_source = 'manual' AND coalesce(length(trim(p_manual_reason)), 0) < 5 THEN
    RETURN QUERY SELECT 'reason_required'::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ; RETURN;
  END IF;
  -- Bloqueo por participante: entrada/salida y dos lectores se serializan en Postgres.
  SELECT * INTO v_person FROM participants p WHERE
    (p_source = 'qr' AND p.qr_token = p_reference) OR
    (p_source = 'manual' AND p.id = p_reference)
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_qr'::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ; RETURN;
  END IF;
  IF v_person.status <> 'Confirmado' THEN
    RETURN QUERY SELECT 'participant_cancelled'::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ; RETURN;
  END IF;
  v_time := clock_timestamp();
  IF (v_time AT TIME ZONE 'America/Mexico_City')::date <> (v_session.starts_at AT TIME ZONE 'America/Mexico_City')::date THEN
    RETURN QUERY SELECT 'outside_window'::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ; RETURN;
  END IF;
  SELECT e.recorded_at INTO v_existing FROM attendance_events e WHERE e.session_id = p_session_id
    AND e.participant_id = v_person.id AND e.direction = p_direction;
  IF FOUND THEN
    RETURN QUERY SELECT 'duplicate'::TEXT, v_person.id, v_person.name, v_existing; RETURN;
  END IF;
  IF p_direction = 'entry' AND v_session.type IN ('Taller', 'Concurso') THEN
    IF v_session.is_simulation THEN
      PERFORM 1 FROM attendance_simulation_roster r WHERE r.session_id = p_session_id AND r.participant_id = v_person.id;
    ELSE
      PERFORM 1 FROM activity_enrollments e WHERE e.activity_id = v_session.activity_id
        AND e.participant_id = v_person.id AND e.status = 'Confirmado' FOR SHARE;
    END IF;
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'not_enrolled'::TEXT, v_person.id, v_person.name, NULL::TIMESTAMPTZ; RETURN;
    END IF;
  END IF;
  IF p_direction = 'exit' THEN
    PERFORM 1 FROM attendance_events e WHERE e.session_id = p_session_id
      AND e.participant_id = v_person.id AND e.direction = 'entry';
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'entry_required'::TEXT, v_person.id, v_person.name, NULL::TIMESTAMPTZ; RETURN;
    END IF;
  END IF;
  INSERT INTO attendance_events(session_id, participant_id, direction, recorded_at, operator_email, source, manual_reason)
    VALUES (p_session_id, v_person.id, p_direction, v_time, lower(p_operator_email), p_source,
      CASE WHEN p_source = 'manual' THEN trim(p_manual_reason) ELSE NULL END)
    ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'duplicate'::TEXT, v_person.id, v_person.name, e.recorded_at
      FROM attendance_events e WHERE e.session_id = p_session_id AND e.participant_id = v_person.id AND e.direction = p_direction;
  ELSE
    RETURN QUERY SELECT 'recorded'::TEXT, v_person.id, v_person.name, v_time;
  END IF;
END;
$$;
