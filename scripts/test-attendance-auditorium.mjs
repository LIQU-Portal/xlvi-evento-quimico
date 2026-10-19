import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { buildAuditoriumBlocks, conferenceMinutes } from "../lib/attendance-auditorium.ts";
import { conferenceReportQuery, visitReportQuery } from "../lib/attendance-conference-report.ts";
import { buildSimulationSessions } from "../lib/attendance-simulations.ts";
import { withAttendanceRetry } from "../lib/attendance-retry.ts";
import vm from "node:vm";
import { localEventTime } from "../lib/program-agenda.ts";

let attempts = 0;
assert.equal(await withAttendanceRetry(async () => {
  if (attempts++ === 0) throw Object.assign(new Error("Synthetic resource pressure"), { code: "53200" });
  return "same idempotent operation";
}), "same idempotent operation");
assert.equal(attempts, 2);
attempts = 0;
await assert.rejects(withAttendanceRetry(async () => { attempts++; throw Object.assign(new Error("Validation is not transient"), { code: "23514" }); }));
assert.equal(attempts, 1);
attempts = 0;
await assert.rejects(withAttendanceRetry(async () => { attempts++; throw Object.assign(new Error("Persistent resource pressure"), { code: "53200" }); }));
assert.equal(attempts, 4, "Retries are bounded");

const grouped = buildAuditoriumBlocks(buildSimulationSessions(new Date("2026-10-20T15:00:00-06:00")));
assert.equal(grouped.length, 2);
assert.equal(grouped.find(g => g.block.venue === "Aula azul").members.length, 2);
assert.equal(buildAuditoriumBlocks(buildSimulationSessions(new Date("2026-10-21T15:00:00-06:00")))[0].block.id === grouped[0].block.id, false);
assert.throws(() => buildAuditoriumBlocks([{ ...grouped[0].members[0], venue: "Por confirmar" }]), /auditorio/);
assert.throws(() => buildAuditoriumBlocks([grouped[0].members[0], { ...grouped[0].members[0], id: "overlap" }]), /traslapadas/);
const db = new PGlite();
try {
  for (const file of ["schema.sql", "attendance.sql", "attendance-auditorium.sql"]) await db.exec(await readFile(new URL(`../database/${file}`, import.meta.url), "utf8"));
  // Idempotent additive migration.
  await db.exec(await readFile(new URL("../database/attendance-auditorium.sql", import.meta.url), "utf8"));
  const { date } = (await db.query("SELECT to_char(NOW() AT TIME ZONE 'America/Mexico_City','YYYY-MM-DD') AS date")).rows[0];
  const at = time => `${date}T${time}:00-06:00`;
  for (let i = 0; i < 4; i++) await db.query(`INSERT INTO participants(id,email,name,account_type,role,institutional_code,affiliation,status,qr_token,created_at)
    VALUES($1,$2,'Test','Alumno',$3,'000000000','Test','Confirmado',$4,NOW())`, [`p${i}`, `p${i}@example.invalid`, i < 2 ? "Staff" : "Alumno", `token${i}`]);
  for (const i of [0, 1]) await db.query("INSERT INTO attendance_operators(email,updated_by) VALUES($1,'test')", [`p${i}@example.invalid`]);
  for (const [id, start, end, venue] of [["a", "09:00", "10:00", "Azul"], ["c", "10:00", "11:00", "Azul"], ["blue", "09:00", "11:00", "Azul"], ["purple", "09:00", "10:00", "Morada"]]) {
    await db.query("INSERT INTO attendance_sessions(id,title,type,venue,starts_at,ends_at,is_simulation,updated_by) VALUES($1,$1,'Conferencia',$2,$3,$4,true,'test')", [id, venue, at(start), at(end)]);
    for (const i of [0, 1]) await db.query("INSERT INTO attendance_assignments(session_id,operator_email,assigned_by) VALUES($1,$2,'test')", [id, `p${i}@example.invalid`]);
  }
  await db.query("INSERT INTO attendance_auditorium_blocks VALUES('blue'),('purple')");
  await db.query("INSERT INTO attendance_auditorium_members VALUES('blue','a'),('blue','c')");
  const plan = [{ block_id: "blue", session_id: "a", starts_at: at("09:00"), ends_at: at("10:00") }, { block_id: "blue", session_id: "c", starts_at: at("10:00"), ends_at: at("11:00") }];
  await db.query("SELECT attendance_assert_schedule($1::jsonb,true,$2)", [JSON.stringify(plan), date]);
  const scan = async (direction = "entry", options = {}) => (await db.query("SELECT * FROM record_attendance_v2($1,$2,$3,$4,$5,$6,true,$7)", [options.block ?? "blue", options.operator ?? "p0@example.invalid", options.source === "manual" ? "p2" : options.token ?? "token2", direction, options.source ?? "qr", options.reason ?? "", options.request ?? randomUUID()])).rows[0];
  assert.equal((await scan("exit")).outcome, "entry_required");
  assert.equal((await scan("entry", { request: "" })).outcome, "invalid_request");
  assert.equal((await scan("entry", { source: "manual", reason: "" })).outcome, "reason_required");
  assert.equal((await scan("entry", { token: "bad" })).outcome, "invalid_qr");
  assert.equal((await scan("entry", { operator: "p3@example.invalid" })).outcome, "forbidden");
  assert.equal((await scan("entry", { block: "a" })).outcome, "session_unavailable", "No individual conference scanning through v2");
  const first = randomUUID(), exit = randomUUID();
  assert.equal((await scan("entry", { request: first })).outcome, "recorded");
  assert.equal((await scan("entry", { operator: "p1@example.invalid" })).outcome, "duplicate");
  assert.equal((await scan("entry", { request: first, token: "token3" })).outcome, "invalid_request");
  assert.equal((await scan("entry", { block: "purple" })).outcome, "open_visit_elsewhere");
  assert.equal((await scan("exit", { request: exit })).outcome, "recorded");
  assert.equal((await scan("exit")).outcome, "duplicate");
  assert.equal((await scan()).outcome, "recorded", "A closed visit allows a real re-entry");
  assert.equal((await scan("entry", { request: first })).outcome, "duplicate", "Lost old entry response cannot create a new visit after exit");
  assert.equal((await scan("exit", { request: exit })).outcome, "duplicate", "Lost old exit response cannot close the new visit");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM attendance_visits WHERE exited_at IS NULL")).rows[0].n, 1);
  await db.query("UPDATE attendance_operators SET active=false WHERE email='p0@example.invalid'");
  assert.equal((await scan("exit")).outcome, "forbidden", "Revocation is checked on every request, even with page open");
  await db.query("UPDATE attendance_operators SET active=true WHERE email='p0@example.invalid'");
  await db.query("SELECT attendance_assert_schedule($1::jsonb,true,$2)", [JSON.stringify(plan), date]);
  await assert.rejects(db.query("SELECT attendance_assert_schedule($1::jsonb,true,$2)", [JSON.stringify([{ ...plan[0], ends_at: at("09:59") }, plan[1]]), date]));

  const cases = [
    { visits: [["09:00", "09:31"]], expected: [31, 31] },
    { visits: [["09:00", "10:00"]], expected: [60, 60] },
    { visits: [["09:00", "09:30"]], expected: [30, 0] },
    { visits: [["09:00", null]], expected: [0, 0] },
    { visits: [["09:00", "09:20"], ["09:30", "09:45"], ["09:50", null]], expected: [35, 35] },
    { visits: [["08:00", "09:31"]], expected: [31, 31] },
    { visits: [["09:00", "10:31"]], expected: [60, 60], next: [31, 31] },
    { visits: [["10:00", "11:00"]], expected: [0, 0], next: [60, 60] },
    { visits: [["09:00", "09:40"], ["09:20", "09:50"]], expected: [50, 50] },
  ];
  for (const test of cases) {
    await db.query("DELETE FROM attendance_scan_requests");
    await db.query("DELETE FROM attendance_visits");
    for (const [entry, leave] of test.visits) await db.query(`INSERT INTO attendance_visits(block_id,participant_id,entered_at,exited_at,entry_operator,exit_operator,entry_source,exit_source)
      VALUES('blue','p2',$1,$2,'p0@example.invalid',CASE WHEN $2::timestamptz IS NULL THEN NULL ELSE 'p1@example.invalid' END,'qr',CASE WHEN $2::timestamptz IS NULL THEN NULL ELSE 'qr' END)`, [at(entry), leave ? at(leave) : null]);
    const rows = (await db.query(conferenceReportQuery, ["blue", true])).rows;
    const a = rows.find(r => r.session_id === "a");
    assert.deepEqual([a.attended_minutes, a.credited_minutes], test.expected);
    const pure = conferenceMinutes(at("09:00"), at("10:00"), test.visits.map(([entry, leave]) => ({ enteredAt: at(entry), exitedAt: leave ? at(leave) : null })));
    assert.deepEqual([pure.attendedMinutes, pure.creditedMinutes], test.expected);
    if (test.next) { const c = rows.find(r => r.session_id === "c"); assert.deepEqual([c.attended_minutes, c.credited_minutes], test.next); }
    const raw = (await db.query(visitReportQuery, ["blue", true])).rows;
    assert.equal(raw.length, test.visits.length);
    assert.equal(raw[0].entry_operator, "p0@example.invalid");
  }
  assert.equal((await db.query(conferenceReportQuery, ["blue", false])).rows.length, 0, "Simulation reports are hidden outside tests");
  assert.deepEqual(conferenceMinutes(at("09:00"), at("10:00"), [{ enteredAt: at("09:00"), exitedAt: at("09:40") }, { enteredAt: at("09:20"), exitedAt: at("09:50") }]), { attendedMinutes: 50, creditedMinutes: 50 }, "Pure coverage merges overlaps defensively");
  // Execute the actual session-import helper with Neon-like deferred query descriptors.
  const deferred = {
    query: (text, params) => ({ text, params }),
    transaction: async statements => {
      await db.exec("BEGIN");
      try { for (const statement of statements) await db.query(statement.text, statement.params); await db.exec("COMMIT"); }
      catch(error) { await db.exec("ROLLBACK"); throw error; }
    },
  };
  const context = vm.createContext({ getSql: () => deferred, buildAuditoriumBlocks, localEventTime });
  const source = await readFile(new URL("../lib/attendance.ts", import.meta.url), "utf8");
  const helper = source.slice(source.indexOf("export async function saveAttendanceSessions("), source.indexOf("export async function attendanceReport("))
    .replace("export async function", "async function").replace("sessions: AttendanceSession[], actor: string, simulation: boolean", "sessions, actor, simulation");
  vm.runInContext(helper, context);
  const real = [
    { id:"real-a",activityId:1001,title:"Real A",type:"Conferencia",venue:"Auditorio QA",startsAt:at("09:00"),endsAt:at("10:00"),active:true,isSimulation:false },
    { id:"real-c",activityId:1002,title:"Real C",type:"Conferencia",venue:"Auditorio QA",startsAt:at("10:00"),endsAt:at("11:00"),active:true,isSimulation:false },
  ];
  assert.equal((await context.saveAttendanceSessions(real,"test",false)).blocks,1);
  await db.query("INSERT INTO attendance_assignments(session_id,operator_email,assigned_by) VALUES('real-a','p0@example.invalid','test')");
  await context.saveAttendanceSessions(real,"test",false);
  const blockId = buildAuditoriumBlocks(real)[0].block.id;
  assert.equal((await db.query("SELECT count(*)::int AS n FROM attendance_assignments WHERE session_id=$1",[blockId])).rows[0].n,1,"Original conference assignments are inherited by the auditorium");
  assert.equal((await db.query("SELECT * FROM record_attendance_v2($1,'p0@example.invalid','token2','entry','qr','',false,$2)",[blockId,randomUUID()])).rows[0].outcome,"recorded");
  await context.saveAttendanceSessions(real,"test",false);
  await assert.rejects(context.saveAttendanceSessions([{...real[0],endsAt:at("09:59")},real[1]],"test",false));
  assert.equal(new Date((await db.query("SELECT ends_at FROM attendance_sessions WHERE id='real-a'")).rows[0].ends_at).toISOString(),new Date(at("10:00")).toISOString());
  console.log("OK: auditorium grouping, strict >50%, actual minutes, no exit=0, re-entries/gaps, clipping per conference, SQL reports, request replay, revocation, audit detail and immutable schedules. In-memory only.");
} finally { await db.close(); }
