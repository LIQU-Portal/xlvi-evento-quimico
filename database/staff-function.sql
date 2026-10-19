-- Explicit additive migration. Classification only; no operator permissions.
ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS staff_function TEXT
  CHECK (staff_function IS NULL OR staff_function IN ('Apoyo operativo', 'Registro de asistencia'));
