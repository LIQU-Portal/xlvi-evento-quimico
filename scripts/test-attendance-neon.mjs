import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";

// Explicit, isolated integration test. No migration, Sheets sync, or real users.
// Run: node --env-file=.env.local scripts/test-attendance-neon.mjs --run-isolated-neon
if (!process.argv.includes("--run-isolated-neon")) throw new Error("Explicit isolated-test flag required");
if (process.env.VERCEL_ENV === "production") throw new Error("Production is forbidden");
const connection = process.env.DATABASE_URL?.trim();
let destination;
try { destination = new URL(connection); } catch { throw new Error("Missing or invalid DATABASE_URL; no queries executed"); }
const fingerprint = createHash("sha256").update(destination.hostname.replace("-pooler", "") + destination.pathname).digest("hex").slice(0, 12);
if (fingerprint !== "b619c2fac063") throw new Error("Wrong database: no queries executed");
const sql = neon(connection);
const run = `attendance-load-${randomUUID()}`;
const person = (i, staff = false) => {
  const id = `EQ26-${randomBytes(5).toString("hex").toUpperCase()}`;
  return { id, email: `${run}-${i}@example.invalid`, name: run, role: staff ? "Staff" : "Alumno", qr: `EQ26:${id}:${randomBytes(24).toString("base64url")}` };
};
const operators = Array.from({ length: 8 }, (_, i) => person(i, true));
const people = Array.from({ length: 151 }, (_, i) => person(i + 8));
const allPeople = [...operators, ...people];
const sessions = ["Conferencia", "Conferencia", "Taller", "Concurso"].map((type, i) => ({ id: `${run}-${i}`, type }));
const sessionIds = sessions.map(s => s.id);
const emails = operators.map(o => o.email);
const ids = allPeople.map(p => p.id);
const report = { target: "isolated attendance Neon branch", fingerprint, run, batches: [], cleanup: false };
let failed = false;
let cleanupAllowed = false;
const query = (text, params = []) => sql.query(text, params, { fetchOptions: { signal: AbortSignal.timeout(60000) } });
const transaction = statements => sql.transaction(statements, { fetchOptions: { signal: AbortSignal.timeout(60000) } });
const batch = async (label, jobs, expected) => {
  // All HTTP requests start together, each with its own database transaction.
  const started = performance.now();
  const results = await Promise.allSettled(jobs.map(async (job, i) => {
    const before = performance.now();
    const [, rows] = await transaction([
      sql.query("SELECT set_config('statement_timeout','10000',true)"),
      sql.query("SELECT pg_backend_pid() AS backend_pid, r.* FROM record_attendance($1,$2,$3,$4,$5,$6,$7) r", [
        sessions[job.session ?? 0].id, operators[i % operators.length].email,
        people[job.person ?? 0].qr, job.direction ?? "entry", "qr", "", true,
      ]),
    ]);
    return { outcome: rows[0].outcome, pid: rows[0].backend_pid, ms: Math.round(performance.now() - before) };
  }));
  const counts = {}, pids = new Set(), latencies = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      counts[r.value.outcome] = (counts[r.value.outcome] ?? 0) + 1;
      pids.add(r.value.pid); latencies.push(r.value.ms);
    } else {
      const code = /^[A-Z0-9]{5}$/.test(r.reason?.code ?? "") ? r.reason.code : "transport_or_unknown";
      counts[`error:${code}`] = (counts[`error:${code}`] ?? 0) + 1;
    }
  }
  latencies.sort((a, b) => a - b);
  const summary = { label, requests: jobs.length, counts, backendConnections: pids.size, durationMs: Math.round(performance.now() - started), p50Ms: latencies[Math.floor(latencies.length * .5)] ?? null, p95Ms: latencies[Math.floor(latencies.length * .95)] ?? null, maxMs: latencies.at(-1) ?? null };
  report.batches.push(summary);
  console.log(JSON.stringify(summary));
  assert.deepEqual(counts, expected, `Unexpected outcomes in ${label}`);
  assert.ok(pids.size > 1, "Real concurrent database backends were not demonstrated");
};

try {
  const [schema] = await query("SELECT to_regprocedure('public.record_attendance(text,text,text,text,text,text,boolean)') IS NOT NULL AS ready");
  assert.equal(schema.ready, true, "Attendance migration missing; test never migrates");
  console.log("Isolated database fingerprint verified; creating exclusively synthetic fixtures.");
  cleanupAllowed = true;
  await transaction([
    sql.query(`INSERT INTO participants(id,email,name,account_type,role,institutional_code,affiliation,status,qr_token,created_at)
      SELECT p.id,p.email,p.name,'Alumno',p.role,'000000000','Simulation','Confirmado',p.qr,NOW()
      FROM jsonb_to_recordset($1::jsonb) AS p(id text,email text,name text,role text,qr text)`, [JSON.stringify(allPeople)]),
    sql.query("INSERT INTO attendance_operators(email,updated_by) SELECT unnest($1::text[]),$2", [emails, run]),
    sql.query(`INSERT INTO attendance_sessions(id,title,type,venue,starts_at,ends_at,is_simulation,updated_by)
      SELECT s.id,$2,s.type,'Synthetic test',
        ((NOW() AT TIME ZONE 'America/Mexico_City')::date + TIME '10:00') AT TIME ZONE 'America/Mexico_City',
        ((NOW() AT TIME ZONE 'America/Mexico_City')::date + TIME '11:00') AT TIME ZONE 'America/Mexico_City',true,$2
      FROM jsonb_to_recordset($1::jsonb) AS s(id text,type text)`, [JSON.stringify(sessions), run]),
    sql.query("INSERT INTO attendance_assignments(session_id,operator_email,assigned_by) SELECT s,e,$3 FROM unnest($1::text[]) s CROSS JOIN unnest($2::text[]) e", [sessionIds, emails, run]),
    sql.query("INSERT INTO attendance_simulation_roster(session_id,participant_id) SELECT s,p FROM unnest($1::text[]) s CROSS JOIN unnest($2::text[]) p", [sessionIds.slice(2), people.slice(1, 151).map(p => p.id)]),
  ]);
  await batch("150 simultaneous entry attempts, same participant", Array.from({ length: 150 }, () => ({})), { recorded: 1, duplicate: 149 });
  await batch("150 simultaneous exit attempts, same participant", Array.from({ length: 150 }, () => ({ direction: "exit" })), { recorded: 1, duplicate: 149 });
  await batch("150 distinct participants across simultaneous conference/workshop/contest sessions", Array.from({ length: 150 }, (_, i) => ({ person: i + 1, session: 1 + i % 3 })), { recorded: 150 });
  await batch("150 workshop attempts without enrollment", Array.from({ length: 150 }, () => ({ session: 2 })), { not_enrolled: 150 });
  const [totals] = await query(`SELECT count(*)::int AS total,
    count(*) FILTER (WHERE direction='entry')::int AS entries,
    count(*) FILTER (WHERE direction='exit')::int AS exits,
    (SELECT count(*)::int FROM (SELECT session_id,participant_id,direction FROM attendance_events
      WHERE session_id=ANY($1::text[]) GROUP BY 1,2,3 HAVING count(*)>1) d) AS duplicate_groups
    FROM attendance_events WHERE session_id=ANY($1::text[])`, [sessionIds]);
  report.totals = totals;
  assert.deepEqual(totals, { total: 152, entries: 151, exits: 1, duplicate_groups: 0 });
  console.log(JSON.stringify({ verifiedDatabaseTotals: totals }));
} catch (error) {
  failed = true;
  // Never dump driver errors, query parameters, credentials, or QR tokens.
  report.failure = error instanceof assert.AssertionError ? error.message : "Database or transport failure; details suppressed to protect secrets";
  console.error(report.failure);
} finally {
  if (cleanupAllowed) {
    try {
      // Exact random IDs AND ownership marker; never broad prefix deletions.
      await transaction([
        sql.query("DELETE FROM attendance_events WHERE session_id IN (SELECT id FROM attendance_sessions WHERE id=ANY($1::text[]) AND updated_by=$2)", [sessionIds, run]),
        sql.query("DELETE FROM attendance_simulation_roster WHERE session_id IN (SELECT id FROM attendance_sessions WHERE id=ANY($1::text[]) AND updated_by=$2)", [sessionIds, run]),
        sql.query("DELETE FROM attendance_assignments WHERE session_id=ANY($1::text[]) AND assigned_by=$2", [sessionIds, run]),
        sql.query("DELETE FROM attendance_sessions WHERE id=ANY($1::text[]) AND updated_by=$2", [sessionIds, run]),
        sql.query("DELETE FROM attendance_operators WHERE email=ANY($1::text[]) AND updated_by=$2", [emails, run]),
        sql.query("DELETE FROM participants WHERE id=ANY($1::text[]) AND name=$2", [ids, run]),
      ]);
      const [left] = await query(`SELECT
        (SELECT count(*) FROM participants WHERE id=ANY($1::text[]) AND name=$4)::int AS participants,
        (SELECT count(*) FROM attendance_sessions WHERE id=ANY($2::text[]) AND updated_by=$4)::int AS sessions,
        (SELECT count(*) FROM attendance_events WHERE session_id=ANY($2::text[]))::int AS events,
        (SELECT count(*) FROM attendance_operators WHERE email=ANY($3::text[]) AND updated_by=$4)::int AS operators`, [ids, sessionIds, emails, run]);
      assert.deepEqual(left, { participants: 0, sessions: 0, events: 0, operators: 0 });
      report.cleanup = true;
      console.log("Synthetic participants, operators, sessions, rosters, assignments and readings removed; zero test rows remain.");
    } catch {
      failed = true;
      report.cleanup = false;
      console.error(`Cleanup needs attention. Run ownership marker: ${run}`);
    }
  }
  console.log(JSON.stringify({ report }));
  if (failed) process.exitCode = 1;
}
