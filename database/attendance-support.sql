-- Additive, explicit migration after attendance.sql and attendance-auditorium.sql.
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS internal_kind TEXT CHECK(internal_kind IS NULL OR internal_kind='support');
-- statement-breakpoint
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='attendance_sessions'::regclass AND contype='c'
    AND pg_get_constraintdef(oid) LIKE '%is_simulation%' AND pg_get_constraintdef(oid) LIKE '%activity_id%'
  LOOP EXECUTE format('ALTER TABLE attendance_sessions DROP CONSTRAINT %I',c.conname); END LOOP;
  ALTER TABLE attendance_sessions ADD CONSTRAINT attendance_sessions_identity_check CHECK(
    (internal_kind IS NULL AND (is_simulation OR activity_id IS NOT NULL)) OR
    (internal_kind IS NOT DISTINCT FROM 'support' AND activity_id IS NULL AND type='Actividad' AND NOT is_simulation
      AND id ~ '^staff-support-[0-9]{4}-[0-9]{2}-[0-9]{2}$'));
END $$;
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS attendance_support_visits (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES attendance_sessions(id),
  participant_id TEXT NOT NULL REFERENCES participants(id),
  entered_at TIMESTAMPTZ NOT NULL, exited_at TIMESTAMPTZ CHECK(exited_at>=entered_at),
  entry_operator TEXT NOT NULL REFERENCES attendance_operators(email), exit_operator TEXT REFERENCES attendance_operators(email),
  entry_source TEXT NOT NULL CHECK(entry_source IN ('qr','manual')), exit_source TEXT CHECK(exit_source IN ('qr','manual')),
  entry_reason TEXT, exit_reason TEXT,
  CHECK(entry_source<>'manual' OR coalesce(length(trim(entry_reason)),0)>=5),
  CHECK(exit_source IS DISTINCT FROM 'manual' OR coalesce(length(trim(exit_reason)),0)>=5),
  CHECK((exited_at IS NULL)=(exit_operator IS NULL)), CHECK((exited_at IS NULL)=(exit_source IS NULL))
);
-- statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS attendance_support_one_open ON attendance_support_visits(session_id,participant_id) WHERE exited_at IS NULL;
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS attendance_support_report ON attendance_support_visits(session_id,participant_id,entered_at);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS attendance_support_requests (
  request_id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES attendance_sessions(id),
  participant_id TEXT NOT NULL REFERENCES participants(id), operator_email TEXT NOT NULL REFERENCES attendance_operators(email),
  direction TEXT NOT NULL CHECK(direction IN ('entry','exit')), source TEXT NOT NULL,
  manual_reason TEXT NOT NULL, recorded_at TIMESTAMPTZ NOT NULL
);
-- statement-breakpoint
CREATE OR REPLACE FUNCTION attendance_staff_is_support(p_email TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  WITH snapshot AS (SELECT detail FROM attendance_audit WHERE action='staff_sync_snapshot' ORDER BY id DESC LIMIT 1)
  SELECT EXISTS(SELECT 1 FROM participants p WHERE lower(p.email)=lower(p_email)
    AND p.role='Staff' AND p.status='Confirmado' AND p.staff_function='Apoyo operativo'
    AND (NOT EXISTS(SELECT 1 FROM snapshot) OR EXISTS(
      SELECT 1 FROM snapshot,jsonb_array_elements(snapshot.detail->'staff') AS s
      WHERE s->>'email'=lower(p_email) AND (s->>'active')::boolean AND s->>'staffFunction'='Apoyo operativo'
        AND s->>'id'=p.id AND s->>'status'='Confirmado')));
$$;
-- statement-breakpoint
CREATE OR REPLACE FUNCTION attendance_prepare_support_day(p_date DATE,p_venue TEXT,p_actor TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE d TEXT; p_id TEXT; p_start TIMESTAMPTZ; p_end TIMESTAMPTZ; old attendance_sessions%ROWTYPE;
BEGIN
  IF lower(p_actor) NOT IN ('cdquim@cucei.udg.mx','jorge.lopezarce@academicos.udg.mx') OR p_actor IS NULL THEN RAISE EXCEPTION 'Acceso no autorizado.'; END IF;
  IF p_date IS NULL OR NOT isfinite(p_date) OR extract(year FROM p_date) NOT BETWEEN 1 AND 9999
    OR coalesce(length(trim(p_venue)),0) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Revisa fecha y punto de registro.'; END IF;
  d:=to_char(p_date,'YYYY-MM-DD');
  p_id:='staff-support-'||d;
  p_start:=p_date::timestamp AT TIME ZONE 'America/Mexico_City';
  p_end:=(p_date+TIME '23:59:59.999') AT TIME ZONE 'America/Mexico_City';
  PERFORM pg_advisory_xact_lock(hashtextextended('support-day-'||d,0));
  SELECT * INTO old FROM attendance_sessions WHERE id=p_id FOR UPDATE;
  IF FOUND AND (old.internal_kind IS DISTINCT FROM 'support' OR
    (EXISTS(SELECT 1 FROM attendance_support_visits WHERE session_id=p_id)
      AND (old.starts_at<>p_start OR old.ends_at<>p_end OR old.venue<>trim(p_venue)))) THEN
    RAISE EXCEPTION 'Un registro diario con lecturas no admite cambios de sede. Conserva el historial.';
  END IF;
  INSERT INTO attendance_sessions(id,title,type,venue,starts_at,ends_at,updated_by,internal_kind)
    VALUES(p_id,'Apoyo operativo · Registro del día',
      'Actividad',trim(p_venue),p_start,p_end,lower(p_actor),'support')
    ON CONFLICT(id) DO UPDATE SET venue=EXCLUDED.venue,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,
      updated_by=EXCLUDED.updated_by,updated_at=NOW(),active=TRUE;
  INSERT INTO attendance_audit(actor_email,action,detail) VALUES(lower(p_actor),'support_day',jsonb_build_object('sessionId',p_id,'date',p_date,'venue',trim(p_venue)));
END $$;
-- statement-breakpoint
-- Old scan functions must never bypass support eligibility or create legacy evidence.
CREATE OR REPLACE FUNCTION attendance_protect_support_evidence() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM attendance_sessions WHERE id=NEW.session_id AND internal_kind='support') THEN
    RAISE EXCEPTION 'Usa el lector de apoyo operativo.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
-- statement-breakpoint
DROP TRIGGER IF EXISTS attendance_protect_support_evidence ON attendance_events;
-- statement-breakpoint
CREATE TRIGGER attendance_protect_support_evidence BEFORE INSERT OR UPDATE ON attendance_events FOR EACH ROW EXECUTE FUNCTION attendance_protect_support_evidence();
-- statement-breakpoint
CREATE OR REPLACE FUNCTION record_staff_support_attendance(
  p_session_id TEXT,p_operator_email TEXT,p_reference TEXT,p_direction TEXT,p_source TEXT,p_manual_reason TEXT,p_request_id TEXT
) RETURNS TABLE(outcome TEXT,participant_id TEXT,participant_name TEXT,recorded_at TIMESTAMPTZ) LANGUAGE plpgsql AS $$
DECLARE s attendance_sessions%ROWTYPE; p participants%ROWTYPE; v attendance_support_visits%ROWTYPE;
  r attendance_support_requests%ROWTYPE; t TIMESTAMPTZ;
BEGIN
  IF p_direction IS NULL OR p_direction NOT IN ('entry','exit') OR p_source IS NULL OR p_source NOT IN ('qr','manual')
    OR p_request_id IS NULL OR p_request_id !~ '^[a-fA-F0-9-]{36}$' THEN
    RETURN QUERY SELECT 'invalid_request'::text,NULL::text,NULL::text,NULL::timestamptz; RETURN;
  END IF;
  SELECT * INTO s FROM attendance_sessions WHERE id=p_session_id AND active AND internal_kind='support' AND NOT is_simulation FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'session_unavailable'::text,NULL::text,NULL::text,NULL::timestamptz; RETURN; END IF;
  PERFORM 1 FROM attendance_operators o WHERE o.email=lower(p_operator_email) AND o.active AND attendance_staff_can_register(o.email) FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'forbidden'::text,NULL::text,NULL::text,NULL::timestamptz; RETURN; END IF;
  PERFORM 1 FROM attendance_assignments a WHERE a.session_id=p_session_id AND a.operator_email=lower(p_operator_email) FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_assigned'::text,NULL::text,NULL::text,NULL::timestamptz; RETURN; END IF;
  IF p_source='manual' AND coalesce(length(trim(p_manual_reason)),0)<5 THEN
    RETURN QUERY SELECT 'reason_required'::text,NULL::text,NULL::text,NULL::timestamptz; RETURN;
  END IF;
  SELECT * INTO p FROM participants x WHERE (p_source='qr' AND x.qr_token=p_reference) OR (p_source='manual' AND x.id=p_reference) FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'invalid_qr'::text,NULL::text,NULL::text,NULL::timestamptz; RETURN; END IF;
  IF p.status<>'Confirmado' THEN RETURN QUERY SELECT 'participant_cancelled'::text,NULL::text,NULL::text,NULL::timestamptz; RETURN; END IF;
  IF NOT attendance_staff_is_support(p.email) THEN RETURN QUERY SELECT 'not_support_staff'::text,p.id,p.name,NULL::timestamptz; RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('support-request-'||p_request_id,0));
  SELECT * INTO r FROM attendance_support_requests WHERE request_id=p_request_id;
  IF FOUND THEN
    IF r.session_id<>p_session_id OR r.participant_id<>p.id OR r.operator_email<>lower(p_operator_email)
      OR r.direction<>p_direction OR r.source<>p_source OR r.manual_reason<>coalesce(trim(p_manual_reason),'') THEN
      RETURN QUERY SELECT 'invalid_request'::text,NULL::text,NULL::text,NULL::timestamptz; RETURN;
    END IF;
    RETURN QUERY SELECT 'duplicate'::text,p.id,p.name,r.recorded_at; RETURN;
  END IF;
  t:=clock_timestamp();
  IF (t AT TIME ZONE 'America/Mexico_City')::date<>(s.starts_at AT TIME ZONE 'America/Mexico_City')::date THEN
    RETURN QUERY SELECT 'outside_window'::text,NULL::text,NULL::text,NULL::timestamptz; RETURN;
  END IF;
  SELECT * INTO v FROM attendance_support_visits x WHERE x.session_id=p_session_id AND x.participant_id=p.id AND x.exited_at IS NULL FOR UPDATE;
  IF p_direction='entry' THEN
    IF FOUND THEN
      INSERT INTO attendance_support_requests VALUES(p_request_id,p_session_id,p.id,lower(p_operator_email),p_direction,p_source,coalesce(trim(p_manual_reason),''),v.entered_at);
      RETURN QUERY SELECT 'duplicate'::text,p.id,p.name,v.entered_at; RETURN;
    END IF;
    IF EXISTS(SELECT 1 FROM attendance_support_visits x JOIN attendance_sessions other ON other.id=x.session_id
      WHERE x.participant_id=p.id AND x.exited_at IS NULL
      AND (other.starts_at AT TIME ZONE 'America/Mexico_City')::date=(s.starts_at AT TIME ZONE 'America/Mexico_City')::date) THEN
      RETURN QUERY SELECT 'open_support_elsewhere'::text,p.id,p.name,NULL::timestamptz; RETURN;
    END IF;
    INSERT INTO attendance_support_visits(session_id,participant_id,entered_at,entry_operator,entry_source,entry_reason)
      VALUES(p_session_id,p.id,t,lower(p_operator_email),p_source,CASE WHEN p_source='manual' THEN trim(p_manual_reason) END);
  ELSE
    IF NOT FOUND THEN
      SELECT * INTO v FROM attendance_support_visits x WHERE x.session_id=p_session_id AND x.participant_id=p.id ORDER BY x.entered_at DESC,x.id DESC LIMIT 1;
      IF NOT FOUND THEN RETURN QUERY SELECT 'entry_required'::text,p.id,p.name,NULL::timestamptz; RETURN; END IF;
      INSERT INTO attendance_support_requests VALUES(p_request_id,p_session_id,p.id,lower(p_operator_email),p_direction,p_source,coalesce(trim(p_manual_reason),''),v.exited_at);
      RETURN QUERY SELECT 'duplicate'::text,p.id,p.name,v.exited_at; RETURN;
    END IF;
    UPDATE attendance_support_visits SET exited_at=t,exit_operator=lower(p_operator_email),exit_source=p_source,
      exit_reason=CASE WHEN p_source='manual' THEN trim(p_manual_reason) END WHERE id=v.id;
  END IF;
  INSERT INTO attendance_support_requests VALUES(p_request_id,p_session_id,p.id,lower(p_operator_email),p_direction,p_source,coalesce(trim(p_manual_reason),''),t);
  RETURN QUERY SELECT 'recorded'::text,p.id,p.name,t;
END $$;
-- statement-breakpoint
CREATE OR REPLACE FUNCTION record_attendance_v3(
  p_session_id TEXT,p_operator_email TEXT,p_reference TEXT,p_direction TEXT,p_source TEXT,p_manual_reason TEXT,p_allow_simulation BOOLEAN,p_request_id TEXT
) RETURNS TABLE(outcome TEXT,participant_id TEXT,participant_name TEXT,recorded_at TIMESTAMPTZ) LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM attendance_sessions WHERE id=p_session_id AND internal_kind='support') THEN
    RETURN QUERY SELECT * FROM record_staff_support_attendance(p_session_id,p_operator_email,p_reference,p_direction,p_source,p_manual_reason,p_request_id);
  ELSE
    RETURN QUERY SELECT * FROM record_attendance_v2(p_session_id,p_operator_email,p_reference,p_direction,p_source,p_manual_reason,p_allow_simulation,p_request_id);
  END IF;
END $$;
