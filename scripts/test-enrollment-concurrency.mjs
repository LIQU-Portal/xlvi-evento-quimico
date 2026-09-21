import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";

// La prueba representa tráfico web concurrente y por ello usa primero el endpoint pooled.
const connectionString = process.env.POSTGRES_URL ?? process.env.POSTGRES_URL_NON_POOLING;
if (!connectionString) throw new Error("Falta POSTGRES_URL o POSTGRES_URL_NON_POOLING.");

const sql = neon(connectionString);
const activityId = -Number(String(Date.now()).slice(-8));
const teamActivityId = activityId - 1;
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
  const confirmedIndex = outcomes.findIndex((outcome) => outcome === "confirmed");
  assert.notEqual(confirmedIndex, -1);

  const duplicateAttempts = await Promise.all(
    Array.from({ length: 10 }, () =>
      sql.query("SELECT * FROM enroll_in_activity($1, $2, $3, $4)", [
        activityId,
        `${testPrefix}-P${confirmedIndex}`,
        `${testPrefix}-${confirmedIndex}@example.invalid`,
        `Participante de prueba ${confirmedIndex}`,
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

  await sql.query(
    `INSERT INTO activities (id, type, title, capacity, reserved_count, registration_enabled, capacity_unit, min_members, max_members)
     VALUES ($1, 'Concurso', $2, 60, 0, TRUE, 'personas', 3, 3)`,
    [teamActivityId, `Prueba de equipos ${testPrefix}`],
  );
  const teamResults = await Promise.all(
    Array.from({ length: 150 }, (_, team) => {
      const ids = Array.from({ length: 3 }, (_, member) => `${testPrefix}-T${team}-P${member}`);
      const emails = ids.map((id) => `${id}@example.invalid`);
      const names = ids.map((id) => `Participante ${id}`);
      return sql.query(
        "SELECT * FROM enroll_team_in_activity($1, $2, $3::TEXT[], $4::TEXT[], $5::TEXT[])",
        [teamActivityId, `Equipo ${team}`, ids, emails, names],
      );
    }),
  );
  const teamOutcomes = teamResults.map((rows) => rows[0].outcome);
  assert.equal(teamOutcomes.filter((outcome) => outcome === "confirmed").length, 20);
  assert.equal(teamOutcomes.filter((outcome) => outcome === "full").length, 130);
  const teamCounts = await sql.query(
    `SELECT
       (SELECT reserved_count FROM activities WHERE id = $1)::INTEGER AS reserved,
       COUNT(DISTINCT team_id)::INTEGER AS teams,
       COUNT(*)::INTEGER AS members
     FROM activity_enrollments WHERE activity_id = $1 AND status = 'Confirmado'`,
    [teamActivityId],
  );
  assert.deepEqual(teamCounts[0], { reserved: 60, teams: 20, members: 60 });

  const [confirmedTeam] = await sql.query(
    `SELECT captain_participant_id, captain_email
       FROM activity_teams
      WHERE activity_id = $1 AND status = 'Confirmado'
      ORDER BY id
      LIMIT 1`,
    [teamActivityId],
  );
  const [cancelledTeam] = await sql.query(
    "SELECT * FROM cancel_activity_enrollment($1, $2, $3, $4, $5)",
    [
      teamActivityId,
      confirmedTeam.captain_participant_id,
      confirmedTeam.captain_email,
      confirmedTeam.captain_email,
      "Cancelación aislada de prueba",
    ],
  );
  assert.equal(cancelledTeam.outcome, "cancelled");
  assert.equal(cancelledTeam.remaining_capacity, 3);

  const [countsAfterCancellation] = await sql.query(
    `SELECT
       (SELECT reserved_count FROM activities WHERE id = $1)::INTEGER AS reserved,
       COUNT(DISTINCT team_id)::INTEGER AS teams,
       COUNT(*)::INTEGER AS members
     FROM activity_enrollments WHERE activity_id = $1 AND status = 'Confirmado'`,
    [teamActivityId],
  );
  assert.deepEqual(countsAfterCancellation, {
    reserved: 57,
    teams: 19,
    members: 57,
  });

  console.log("Prueba aprobada: concurrencia y cancelación de equipos con cupo por persona, sin sobrecupo ni duplicados.");
} finally {
  await sql.query("DELETE FROM activity_enrollments WHERE activity_id = $1", [teamActivityId]);
  await sql.query("DELETE FROM activity_teams WHERE activity_id = $1", [teamActivityId]);
  await sql.query("DELETE FROM activities WHERE id = $1", [teamActivityId]);
  await sql.query("DELETE FROM activity_enrollments WHERE activity_id = $1", [activityId]);
  await sql.query("DELETE FROM activities WHERE id = $1", [activityId]);
  console.log("Datos aislados de prueba eliminados.");
}
