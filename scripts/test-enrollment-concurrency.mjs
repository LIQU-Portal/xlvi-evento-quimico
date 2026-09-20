import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";

// La prueba representa tráfico web concurrente y por ello usa primero el endpoint pooled.
const connectionString = process.env.POSTGRES_URL ?? process.env.POSTGRES_URL_NON_POOLING;
if (!connectionString) throw new Error("Falta POSTGRES_URL o POSTGRES_URL_NON_POOLING.");

const sql = neon(connectionString);
const activityId = -Number(String(Date.now()).slice(-8));
const testPrefix = `concurrency-${Date.now()}`;

try {
  await sql.query(
    `INSERT INTO activities (id, type, title, capacity, reserved_count, registration_enabled)
     VALUES ($1, 'Taller', $2, 20, 0, TRUE)`,
    [activityId, `Prueba aislada ${testPrefix}`],
  );

  const results = await Promise.all(
    Array.from({ length: 150 }, (_, index) =>
      sql.query("SELECT * FROM enroll_in_activity($1, $2, $3, $4)", [
        activityId,
        `${testPrefix}-P${index}`,
        `${testPrefix}-${index}@example.invalid`,
        `Participante de prueba ${index}`,
      ]),
    ),
  );
  const outcomes = results.map((rows) => rows[0].outcome);
  assert.equal(outcomes.filter((outcome) => outcome === "confirmed").length, 20);
  assert.equal(outcomes.filter((outcome) => outcome === "full").length, 130);

  const duplicateAttempts = await Promise.all(
    Array.from({ length: 10 }, () =>
      sql.query("SELECT * FROM enroll_in_activity($1, $2, $3, $4)", [
        activityId,
        `${testPrefix}-P0`,
        `${testPrefix}-0@example.invalid`,
        "Participante de prueba 0",
      ]),
    ),
  );
  assert.ok(duplicateAttempts.every((rows) => rows[0].outcome === "already_enrolled"));

  const activityRows = await sql.query(
    "SELECT capacity, reserved_count FROM activities WHERE id = $1",
    [activityId],
  );
  assert.equal(activityRows[0].capacity, 20);
  assert.equal(activityRows[0].reserved_count, 20);

  const enrollmentRows = await sql.query(
    `SELECT COUNT(*)::INTEGER AS total,
            COUNT(DISTINCT participant_id)::INTEGER AS unique_participants,
            COUNT(DISTINCT participant_email)::INTEGER AS unique_emails
       FROM activity_enrollments
      WHERE activity_id = $1 AND status = 'Confirmado'`,
    [activityId],
  );
  assert.deepEqual(enrollmentRows[0], {
    total: 20,
    unique_participants: 20,
    unique_emails: 20,
  });

  console.log("Prueba aprobada: 150 solicitudes, 20 confirmadas, 130 rechazadas por cupo y 0 duplicados.");
} finally {
  await sql.query("DELETE FROM activity_enrollments WHERE activity_id = $1", [activityId]);
  await sql.query("DELETE FROM activities WHERE id = $1", [activityId]);
  console.log("Datos aislados de prueba eliminados.");
}
