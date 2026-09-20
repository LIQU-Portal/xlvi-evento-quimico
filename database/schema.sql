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
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

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

  UPDATE activity_enrollments
    SET status = 'Cancelado',
        updated_at = NOW(),
        cancelled_at = NOW(),
        cancelled_by = LOWER(requested_cancelled_by),
        cancellation_reason = requested_reason
    WHERE id = selected_enrollment.id;

  UPDATE activities
    SET reserved_count = GREATEST(reserved_count - 1, 0),
        updated_at = NOW()
    WHERE id = requested_activity_id
    RETURNING * INTO selected_activity;

  RETURN QUERY
    SELECT 'cancelled'::TEXT,
      selected_activity.capacity - selected_activity.reserved_count;
END;
$$;
