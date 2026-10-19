import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";

class ReleaseCheckError extends Error {}

// Read-only preflight. Never migrates, synchronizes, enables operators or scans.
const argument = name => process.argv.find(a => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const environment = argument("environment");
const phase = argument("phase");
const expected = argument("expected-fingerprint");
const allowedCoordinators = ["cdquim@cucei.udg.mx", "jorge.lopezarce@academicos.udg.mx"];
const required = ["attendance_operators", "attendance_sessions", "attendance_assignments", "attendance_simulation_roster", "attendance_events", "attendance_audit"];

try {
  if (!["preview", "production"].includes(environment) || !["before-migration", "after-migration"].includes(phase)
    || !/^[a-f0-9]{12}$/.test(expected ?? "")) throw new ReleaseCheckError("Specify environment, phase and reviewed 12-character expected fingerprint.");
  const connection = process.env.DATABASE_URL?.trim();
  let destination;
  try { destination = new URL(connection); } catch { throw new ReleaseCheckError("Missing or invalid DATABASE_URL. No fallback to other connection variables."); }
  const fingerprint = createHash("sha256").update(destination.hostname.replace("-pooler", "") + destination.pathname).digest("hex").slice(0, 12);
  if (fingerprint !== expected) throw new ReleaseCheckError("Wrong database fingerprint: no queries executed.");
  if (environment === "production" && fingerprint === "b619c2fac063") throw new ReleaseCheckError("The known simulation database cannot be used as production.");
  const coordinators = new Set((process.env.ATTENDANCE_ADMIN_EMAILS ?? "").split(",").map(v => v.trim().toLowerCase()).filter(Boolean));
  if (coordinators.size !== 2 || allowedCoordinators.some(email => !coordinators.has(email))) throw new ReleaseCheckError("Configure exactly the two authorized attendance coordinators.");
  if (environment === "production" && process.env.ATTENDANCE_SIMULATION_ENABLED?.trim().toLowerCase() !== "false") throw new ReleaseCheckError("Production requires ATTENDANCE_SIMULATION_ENABLED=false explicitly.");
  const sql = neon(connection);
  const query = (text, params = []) => sql.query(text, params, { fetchOptions: { signal: AbortSignal.timeout(15000) } });
  const tables = new Set((await query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).map(r => r.table_name));
  if (!tables.has("participants") || !tables.has("activity_enrollments")) throw new ReleaseCheckError("The existing participant/enrollment schema is missing; do not apply attendance migration here.");
  const missing = required.filter(t => !tables.has(t));
  const [routine] = await query("SELECT to_regprocedure('public.record_attendance(text,text,text,text,text,text,boolean)') IS NOT NULL AS ready");
  const [staffColumn] = await query("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='participants' AND column_name='staff_function') AS present");
  const [participants] = await query("SELECT count(*)::int AS total, count(*) FILTER (WHERE role='Staff' AND status='Confirmado')::int AS eligible_staff FROM participants");
  const report = { environment, phase, fingerprint, readOnly: true, coordinatorsConfigured: true,
    simulationsConfigured: process.env.ATTENDANCE_SIMULATION_ENABLED?.trim().toLowerCase() === "true",
    participants, missingTables: missing, recordingFunctionPresent: routine.ready, staffFunctionColumnPresent: staffColumn.present };
  if (!missing.length) {
    const [setup] = await query(`SELECT
      (SELECT count(*) FROM attendance_operators o JOIN participants p ON lower(p.email)=o.email WHERE o.active AND p.role='Staff' AND p.status='Confirmado')::int AS enabled_operators,
      (SELECT count(*) FROM attendance_sessions WHERE active AND NOT is_simulation)::int AS real_sessions,
      (SELECT count(*) FROM attendance_sessions WHERE is_simulation)::int AS simulation_sessions,
      (SELECT count(*) FROM attendance_sessions s WHERE active AND NOT is_simulation AND NOT EXISTS (
        SELECT 1 FROM attendance_assignments a JOIN attendance_operators o ON o.email=a.operator_email
        JOIN participants p ON lower(p.email)=o.email WHERE a.session_id=s.id AND o.active AND p.role='Staff' AND p.status='Confirmado'))::int AS real_sessions_without_operator`);
    report.setup = setup;
  }
  console.log(JSON.stringify(report, null, 2));
  if (phase === "after-migration" && (missing.length || !routine.ready)) throw new ReleaseCheckError("Attendance schema is incomplete. Apply the reviewed migration explicitly before release.");
  if (phase === "after-migration" && !staffColumn.present) throw new ReleaseCheckError("staff_function is missing. Apply its separate reviewed migration before publishing this version.");
  if (environment === "production" && report.setup?.simulation_sessions > 0) throw new ReleaseCheckError("Simulation rows found in production. Investigate; this checker never deletes data.");
  console.log("Read-only technical preflight OK. This does not approve manual tests, backup, deployment or operator assignments.");
} catch (error) {
  // Driver messages may contain secrets: print only our own controlled errors.
  console.error(error instanceof ReleaseCheckError ? error.message : "Connection/read failure; details suppressed to protect credentials.");
  process.exitCode = 1;
}
