CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('Alumno', 'Profesor')),
  role TEXT NOT NULL CHECK (role IN ('Alumno', 'Profesor', 'Staff')),
  institutional_code TEXT NOT NULL,
  affiliation TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Confirmado', 'Cancelado')),
  qr_token TEXT,
  confirmation_email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS participants_email_lower_idx
  ON participants (LOWER(email));

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('Taller', 'Concurso')),
  title TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  reserved_count INTEGER NOT NULL DEFAULT 0,
  registration_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  opens_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (reserved_count >= 0 AND reserved_count <= capacity),
  CHECK (closes_at IS NULL OR opens_at IS NULL OR closes_at > opens_at)
);

-- statement-breakpoint

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS capacity_unit TEXT NOT NULL DEFAULT 'personas',
  ADD COLUMN IF NOT EXISTS min_members INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_members INTEGER NOT NULL DEFAULT 1;

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS activity_teams (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  captain_participant_id TEXT NOT NULL,
  captain_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Confirmado' CHECK (status IN ('Confirmado', 'Cancelado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  cancelled_by TEXT,
  cancellation_reason TEXT
);

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS activity_enrollments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE RESTRICT,
  participant_id TEXT NOT NULL,
  participant_email TEXT NOT NULL,
  participant_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Confirmado'
    CHECK (status IN ('Confirmado', 'Cancelado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  cancelled_by TEXT,
  cancellation_reason TEXT,
  UNIQUE (activity_id, participant_id),
  UNIQUE (activity_id, participant_email)
);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS activity_enrollments_participant_idx
  ON activity_enrollments (participant_email, status);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS activity_enrollments_activity_idx
  ON activity_enrollments (activity_id, status);

-- statement-breakpoint

ALTER TABLE activity_enrollments
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS team_id BIGINT REFERENCES activity_teams(id) ON DELETE RESTRICT;

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS activity_enrollments_team_idx
  ON activity_enrollments (team_id, status);

-- statement-breakpoint

CREATE OR REPLACE FUNCTION enroll_team_in_activity(
  requested_activity_id INTEGER,
  requested_team_name TEXT,
  requested_participant_ids TEXT[],
  requested_emails TEXT[],
  requested_names TEXT[]
)
RETURNS TABLE (outcome TEXT, remaining_capacity INTEGER, team_id BIGINT)
LANGUAGE plpgsql
AS $$
DECLARE
  selected_activity activities%ROWTYPE;
  new_team_id BIGINT;
  member_count INTEGER;
  member_index INTEGER;
  reserved_units INTEGER;
BEGIN
  SELECT * INTO selected_activity FROM activities
    WHERE id = requested_activity_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::TEXT, NULL::INTEGER, NULL::BIGINT; RETURN; END IF;

  member_count := COALESCE(array_length(requested_emails, 1), 0);
  reserved_units := CASE
    WHEN selected_activity.capacity_unit = 'personas' THEN member_count
    ELSE 1
  END;

  IF member_count < selected_activity.min_members
    OR member_count > selected_activity.max_members
    OR array_length(requested_participant_ids, 1) IS DISTINCT FROM member_count
    OR array_length(requested_names, 1) IS DISTINCT FROM member_count
    OR (SELECT COUNT(DISTINCT LOWER(value)) FROM unnest(requested_emails) AS value) <> member_count
  THEN
    RETURN QUERY SELECT 'invalid_team'::TEXT,
      selected_activity.capacity - selected_activity.reserved_count, NULL::BIGINT; RETURN;
  END IF;

  IF NOT selected_activity.registration_enabled THEN RETURN QUERY SELECT 'disabled'::TEXT, selected_activity.capacity - selected_activity.reserved_count, NULL::BIGINT; RETURN; END IF;
  IF selected_activity.opens_at IS NOT NULL AND NOW() < selected_activity.opens_at THEN RETURN QUERY SELECT 'upcoming'::TEXT, selected_activity.capacity - selected_activity.reserved_count, NULL::BIGINT; RETURN; END IF;
  IF selected_activity.closes_at IS NOT NULL AND NOW() >= selected_activity.closes_at THEN RETURN QUERY SELECT 'closed'::TEXT, selected_activity.capacity - selected_activity.reserved_count, NULL::BIGINT; RETURN; END IF;
  IF selected_activity.reserved_count + reserved_units > selected_activity.capacity THEN
    RETURN QUERY SELECT 'full'::TEXT,
      selected_activity.capacity - selected_activity.reserved_count, NULL::BIGINT; RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM activity_enrollments
    WHERE activity_id = requested_activity_id AND status = 'Confirmado'
      AND (participant_id = ANY(requested_participant_ids) OR LOWER(participant_email) = ANY(SELECT LOWER(value) FROM unnest(requested_emails) AS value))
  ) THEN
    RETURN QUERY SELECT 'member_already_enrolled'::TEXT,
      selected_activity.capacity - selected_activity.reserved_count, NULL::BIGINT; RETURN;
  END IF;

  INSERT INTO activity_teams (activity_id, name, captain_participant_id, captain_email)
    VALUES (requested_activity_id, requested_team_name, requested_participant_ids[1], LOWER(requested_emails[1]))
    RETURNING id INTO new_team_id;

  FOR member_index IN 1..member_count LOOP
    INSERT INTO activity_enrollments (activity_id, participant_id, participant_email, participant_name, team_id)
      VALUES (requested_activity_id, requested_participant_ids[member_index], LOWER(requested_emails[member_index]), requested_names[member_index], new_team_id)
    ON CONFLICT (activity_id, participant_id) DO UPDATE SET
      participant_email = EXCLUDED.participant_email, participant_name = EXCLUDED.participant_name,
      team_id = EXCLUDED.team_id, status = 'Confirmado', updated_at = NOW(),
      cancelled_at = NULL, cancelled_by = NULL, cancellation_reason = NULL;
  END LOOP;

  UPDATE activities SET reserved_count = reserved_count + reserved_units, updated_at = NOW()
    WHERE id = requested_activity_id RETURNING * INTO selected_activity;
  RETURN QUERY SELECT 'confirmed'::TEXT,
    selected_activity.capacity - selected_activity.reserved_count, new_team_id;
END;
$$;

-- statement-breakpoint

CREATE OR REPLACE FUNCTION enroll_in_activity(
  requested_activity_id INTEGER,
  requested_participant_id TEXT,
  requested_email TEXT,
  requested_name TEXT
)
RETURNS TABLE (outcome TEXT, remaining_capacity INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  selected_activity activities%ROWTYPE;
  existing_enrollment activity_enrollments%ROWTYPE;
BEGIN
  SELECT *
    INTO selected_activity
    FROM activities
    WHERE id = requested_activity_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::INTEGER;
    RETURN;
  END IF;

  SELECT *
    INTO existing_enrollment
    FROM activity_enrollments
    WHERE activity_id = requested_activity_id
      AND (
        participant_id = requested_participant_id
        OR LOWER(participant_email) = LOWER(requested_email)
      )
    ORDER BY id
    LIMIT 1;

  IF FOUND AND existing_enrollment.status = 'Confirmado' THEN
    RETURN QUERY
      SELECT 'already_enrolled'::TEXT,
        selected_activity.capacity - selected_activity.reserved_count;
    RETURN;
  END IF;

  IF NOT selected_activity.registration_enabled THEN
    RETURN QUERY SELECT 'disabled'::TEXT,
      selected_activity.capacity - selected_activity.reserved_count;
    RETURN;
  END IF;

  IF selected_activity.opens_at IS NOT NULL AND NOW() < selected_activity.opens_at THEN
    RETURN QUERY SELECT 'upcoming'::TEXT,
      selected_activity.capacity - selected_activity.reserved_count;
    RETURN;
  END IF;

  IF selected_activity.closes_at IS NOT NULL AND NOW() >= selected_activity.closes_at THEN
    RETURN QUERY SELECT 'closed'::TEXT,
      selected_activity.capacity - selected_activity.reserved_count;
    RETURN;
  END IF;

  IF selected_activity.reserved_count >= selected_activity.capacity THEN
    RETURN QUERY SELECT 'full'::TEXT, 0;
    RETURN;
  END IF;

  IF existing_enrollment.id IS NOT NULL THEN
    UPDATE activity_enrollments
      SET participant_id = requested_participant_id,
          participant_email = LOWER(requested_email),
          participant_name = requested_name,
          status = 'Confirmado',
          updated_at = NOW(),
          cancelled_at = NULL,
          cancelled_by = NULL,
          cancellation_reason = NULL
      WHERE id = existing_enrollment.id;
  ELSE
    INSERT INTO activity_enrollments (
      activity_id,
      participant_id,
      participant_email,
      participant_name
    ) VALUES (
      requested_activity_id,
      requested_participant_id,
      LOWER(requested_email),
      requested_name
    );
  END IF;

  UPDATE activities
    SET reserved_count = reserved_count + 1,
        updated_at = NOW()
    WHERE id = requested_activity_id
    RETURNING * INTO selected_activity;

  RETURN QUERY
    SELECT 'confirmed'::TEXT,
      selected_activity.capacity - selected_activity.reserved_count;
END;
$$;

-- statement-breakpoint

CREATE OR REPLACE FUNCTION cancel_activity_enrollment(
  requested_activity_id INTEGER,
  requested_participant_id TEXT,
  requested_email TEXT,
  requested_cancelled_by TEXT,
  requested_reason TEXT
)
RETURNS TABLE (outcome TEXT, remaining_capacity INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  selected_activity activities%ROWTYPE;
  selected_enrollment activity_enrollments%ROWTYPE;
  reserved_units INTEGER := 1;
BEGIN
  SELECT *
    INTO selected_activity
    FROM activities
    WHERE id = requested_activity_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::INTEGER;
    RETURN;
  END IF;

  SELECT *
    INTO selected_enrollment
    FROM activity_enrollments
    WHERE activity_id = requested_activity_id
      AND participant_id = requested_participant_id
      AND LOWER(participant_email) = LOWER(requested_email)
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY
      SELECT 'not_found'::TEXT,
        selected_activity.capacity - selected_activity.reserved_count;
    RETURN;
  END IF;

  IF selected_enrollment.status = 'Cancelado' THEN
    RETURN QUERY
      SELECT 'already_cancelled'::TEXT,
        selected_activity.capacity - selected_activity.reserved_count;
    RETURN;
  END IF;

  IF selected_activity.closes_at IS NOT NULL AND NOW() >= selected_activity.closes_at THEN
    RETURN QUERY
      SELECT 'cancellation_closed'::TEXT,
        selected_activity.capacity - selected_activity.reserved_count;
    RETURN;
  END IF;

  IF selected_enrollment.team_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM activity_teams
    WHERE id = selected_enrollment.team_id
      AND captain_participant_id = requested_participant_id
      AND LOWER(captain_email) = LOWER(requested_email)
  ) THEN
    RETURN QUERY SELECT 'captain_required'::TEXT,
      selected_activity.capacity - selected_activity.reserved_count;
    RETURN;
  END IF;

  IF selected_enrollment.team_id IS NOT NULL
    AND selected_activity.capacity_unit = 'personas'
  THEN
    SELECT COUNT(*)::INTEGER INTO reserved_units
    FROM activity_enrollments
    WHERE team_id = selected_enrollment.team_id AND status = 'Confirmado';
  END IF;

  UPDATE activity_enrollments
    SET status = 'Cancelado',
        updated_at = NOW(),
        cancelled_at = NOW(),
        cancelled_by = LOWER(requested_cancelled_by),
        cancellation_reason = requested_reason
    WHERE id = selected_enrollment.id
       OR (selected_enrollment.team_id IS NOT NULL AND team_id = selected_enrollment.team_id);

  IF selected_enrollment.team_id IS NOT NULL THEN
    UPDATE activity_teams SET status = 'Cancelado', updated_at = NOW(),
      cancelled_at = NOW(), cancelled_by = LOWER(requested_cancelled_by),
      cancellation_reason = requested_reason
      WHERE id = selected_enrollment.team_id;
  END IF;

  UPDATE activities
    SET reserved_count = GREATEST(reserved_count - reserved_units, 0),
        updated_at = NOW()
    WHERE id = requested_activity_id
    RETURNING * INTO selected_activity;

  RETURN QUERY
    SELECT 'cancelled'::TEXT,
      selected_activity.capacity - selected_activity.reserved_count;
END;
$$;

-- statement-breakpoint

CREATE OR REPLACE FUNCTION admin_cancel_activity_enrollment(
  requested_enrollment_id BIGINT,
  requested_cancelled_by TEXT,
  requested_reason TEXT
)
RETURNS TABLE (outcome TEXT, remaining_capacity INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  selected_activity activities%ROWTYPE;
  selected_enrollment activity_enrollments%ROWTYPE;
  selected_activity_id INTEGER;
  reserved_units INTEGER := 1;
BEGIN
  SELECT activity_id
    INTO selected_activity_id
    FROM activity_enrollments
    WHERE id = requested_enrollment_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::INTEGER;
    RETURN;
  END IF;

  SELECT *
    INTO selected_activity
    FROM activities
    WHERE id = selected_activity_id
    FOR UPDATE;

  SELECT *
    INTO selected_enrollment
    FROM activity_enrollments
    WHERE id = requested_enrollment_id
    FOR UPDATE;

  IF selected_enrollment.status = 'Cancelado' THEN
    RETURN QUERY
      SELECT 'already_cancelled'::TEXT,
        selected_activity.capacity - selected_activity.reserved_count;
    RETURN;
  END IF;

  IF selected_enrollment.team_id IS NOT NULL
    AND selected_activity.capacity_unit = 'personas'
  THEN
    SELECT COUNT(*)::INTEGER INTO reserved_units
    FROM activity_enrollments
    WHERE team_id = selected_enrollment.team_id AND status = 'Confirmado';
  END IF;

  UPDATE activity_enrollments
    SET status = 'Cancelado',
        updated_at = NOW(),
        cancelled_at = NOW(),
        cancelled_by = LOWER(requested_cancelled_by),
        cancellation_reason = requested_reason
    WHERE id = requested_enrollment_id
       OR (selected_enrollment.team_id IS NOT NULL AND team_id = selected_enrollment.team_id);

  IF selected_enrollment.team_id IS NOT NULL THEN
    UPDATE activity_teams SET status = 'Cancelado', updated_at = NOW(),
      cancelled_at = NOW(), cancelled_by = LOWER(requested_cancelled_by),
      cancellation_reason = requested_reason
      WHERE id = selected_enrollment.team_id;
  END IF;

  UPDATE activities
    SET reserved_count = GREATEST(reserved_count - reserved_units, 0),
        updated_at = NOW()
    WHERE id = selected_activity_id
    RETURNING * INTO selected_activity;

  RETURN QUERY
    SELECT 'cancelled'::TEXT,
      selected_activity.capacity - selected_activity.reserved_count;
END;
$$;
