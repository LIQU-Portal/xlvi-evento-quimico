import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { buildAttendanceSessions, inspectAttendanceSchedule, sessionWindow, validScanReference, attendanceCsvCell, normalizedEmailList, isAuthorizedCoordinator, areSimulationsEnabled } from "../lib/attendance-rules.ts";
import { buildSimulationSessions } from "../lib/attendance-simulations.ts";
import { attendanceOperatorListQuery, operatorCanScan } from "../lib/attendance-operator-list.ts";

// PostgreSQL local en memoria: no lee .env ni se conecta a Neon.
const db = new PGlite();
try {
  const original = await readFile(new URL("../database/schema.sql", import.meta.url), "utf8");
  const attendance = await readFile(new URL("../database/attendance.sql", import.meta.url), "utf8");
  await db.exec(original);
  await db.exec(attendance);
  const staff = "EQ26-AAAAAAAAAA", person = "EQ26-BBBBBBBBBB", cancelled = "EQ26-CCCCCCCCCC";
  const token = `EQ26:${person}:${"x".repeat(32)}`;
  const cancelledToken = `EQ26:${cancelled}:${"y".repeat(32)}`;
  for (const [id, email, role, status, qr] of [
    [staff, "staff@alumnos.udg.mx", "Staff", "Confirmado", "staff-token"],
    ["EQ26-DDDDDDDDDD", "second@academicos.udg.mx", "Staff", "Confirmado", "second-token"],
    [person, "person@alumnos.udg.mx", "Alumno", "Confirmado", token],
    [cancelled, "cancelled@alumnos.udg.mx", "Alumno", "Cancelado", cancelledToken],
  ]) await db.query(`INSERT INTO participants(id,email,name,account_type,role,institutional_code,affiliation,status,qr_token,created_at)
    VALUES ($1,$2,$2,'Alumno',$3,'123456789','Química',$4,$5,NOW())`, [id, email, role, status, qr]);
  await db.query("INSERT INTO attendance_operators(email,updated_by) VALUES ('staff@alumnos.udg.mx','coordinator')");
  const candidates = (await db.query(attendanceOperatorListQuery)).rows;
  assert.deepEqual(new Set(candidates.map((o) => o.email)), new Set(["staff@alumnos.udg.mx", "second@academicos.udg.mx"]));
  assert.equal(candidates.find((o) => o.email === "second@academicos.udg.mx").configured, false);
  assert.equal(candidates.find((o) => o.email === "second@academicos.udg.mx").active, false);
  assert.equal(operatorCanScan(candidates.find((o) => o.email === "staff@alumnos.udg.mx")), true);
  await db.query("UPDATE participants SET role = 'Alumno' WHERE id = $1", [staff]);
  const revokedCandidate = (await db.query(attendanceOperatorListQuery)).rows.find((o) => o.email === "staff@alumnos.udg.mx");
  assert.ok(revokedCandidate, "Una cuenta revocada con permiso anterior sigue visible para desactivarla");
  assert.equal(operatorCanScan(revokedCandidate), false);
  await db.query("UPDATE participants SET role = 'Staff' WHERE id = $1", [staff]);
  await db.query("INSERT INTO attendance_operators(email,updated_by) VALUES ('second@academicos.udg.mx','coordinator')");
  const simulations = buildSimulationSessions();
  assert.equal(simulations.length, 5);
  assert.equal(simulations.filter((s) => s.type === "Conferencia").length, 3);
  assert.equal(simulations[0].startsAt, simulations[1].startsAt);
  assert.ok(new Date(simulations[2].startsAt) >= new Date(simulations[0].endsAt));
  for (const s of simulations) {
    await db.query(`INSERT INTO attendance_sessions(id,title,type,venue,starts_at,ends_at,is_simulation,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,TRUE,'coordinator')`, [s.id, s.title, s.type, s.venue, s.startsAt, s.endsAt]);
    await db.query("INSERT INTO attendance_assignments(session_id,operator_email,assigned_by) VALUES ($1,'staff@alumnos.udg.mx','coordinator')", [s.id]);
    await db.query("INSERT INTO attendance_assignments(session_id,operator_email,assigned_by) VALUES ($1,'second@academicos.udg.mx','coordinator')", [s.id]);
  }
  const scan = async (id, dir = "entry", options = {}) => (await db.query(
    "SELECT * FROM record_attendance($1,$2,$3,$4,$5,$6,$7)", [id, options.operator ?? "staff@alumnos.udg.mx",
      options.reference ?? token, dir, options.source ?? "qr", options.reason ?? "", options.allowSimulation ?? true],
  )).rows[0];
  const confA = simulations[0].id, confB = simulations[1].id, confC = simulations[2].id;
  const workshop = simulations[3].id, contest = simulations[4].id;
  assert.equal((await scan(confA, "exit")).outcome, "entry_required");
  assert.equal((await scan(confA, "entry", { operator: "person@alumnos.udg.mx" })).outcome, "forbidden");
  assert.equal((await scan(confA, "entry", { reference: "fake" })).outcome, "invalid_qr");
  assert.equal((await scan(confA, "entry", { reference: cancelledToken })).outcome, "participant_cancelled");
  assert.equal((await scan(confA, "entry", { allowSimulation: false })).outcome, "session_unavailable");
  assert.equal((await scan(confA)).outcome, "recorded");
  assert.equal((await scan(confA)).outcome, "duplicate");
  assert.equal((await scan(confA, "exit")).outcome, "recorded");
  assert.equal((await scan(confA, "exit")).outcome, "duplicate");
  assert.equal((await scan(confB)).outcome, "recorded");
  assert.equal((await scan(workshop, "exit")).outcome, "exit_not_required");
  assert.equal((await scan(workshop)).outcome, "not_enrolled");
  assert.equal((await scan(contest)).outcome, "not_enrolled");
  await db.query("INSERT INTO attendance_simulation_roster VALUES ($1,$2),($3,$2)", [workshop, person, contest]);
  assert.equal((await scan(workshop)).outcome, "recorded");
  assert.equal((await scan(contest)).outcome, "recorded");
  assert.equal((await scan(confC, "entry", { source: "manual", reference: person })).outcome, "reason_required");
  // 150 solicitudes concurrentes en la API de PGlite, que usa una sola conexión.
  // Verifica el SQL y unicidad; el paralelismo real entre conexiones se valida en Preview.
  const attempts = await Promise.all(Array.from({ length: 150 }, (_, i) => scan(confC, "entry", { operator: i % 2 ? "staff@alumnos.udg.mx" : "second@academicos.udg.mx" })));
  assert.equal(attempts.filter((r) => r.outcome === "recorded").length, 1);
  assert.equal(attempts.filter((r) => r.outcome === "duplicate").length, 149);
  assert.equal((await scan(confC, "exit", { source: "manual", reference: person, reason: "Pantalla rota" })).outcome, "recorded");
  await db.query("DELETE FROM attendance_assignments WHERE session_id = $1", [confC]);
  assert.equal((await scan(confC)).outcome, "not_assigned");
  await db.query("UPDATE attendance_operators SET active = FALSE");
  assert.equal((await scan(confA)).outcome, "forbidden");
  await db.query("UPDATE attendance_operators SET active = TRUE");
  await db.query("UPDATE participants SET role = 'Alumno' WHERE id = $1", [staff]);
  assert.equal((await scan(confA)).outcome, "forbidden");
  await db.query("UPDATE participants SET role = 'Staff' WHERE id = $1", [staff]);
  await db.query("UPDATE attendance_sessions SET starts_at = starts_at - INTERVAL '1 day', ends_at = ends_at - INTERVAL '1 day' WHERE id = $1", [confA]);
  assert.equal((await scan(confA)).outcome, "outside_window");
  await db.query("UPDATE attendance_sessions SET starts_at = starts_at + INTERVAL '2 day', ends_at = ends_at + INTERVAL '2 day' WHERE id = $1", [confA]);
  assert.equal((await scan(confA)).outcome, "outside_window");
  await db.query("UPDATE attendance_sessions SET active = FALSE WHERE id = $1", [confB]);
  assert.equal((await scan(confB)).outcome, "session_unavailable");

  const multi = buildAttendanceSessions([{
    id: 14, date: "2026-10-20 | 2026-10-22", day: "Martes | Jueves", time: "13:00-15:00 | 14:00-16:00",
    type: "Taller", title: "Multidía", place: "Auditorio", description: "", person: "",
  }]);
  assert.equal(multi.length, 2);
  assert.notEqual(multi[0].id, multi[1].id);
  assert.ok(multi.some((s) => s.startsAt === "2026-10-22T14:00:00-06:00"));
  const previousDayWorkshop = { id: 29, date: "2026-10-19 | 2026-10-20 | 2026-10-21 | 2026-10-22",
    day: "Lunes | Martes | Miércoles | Jueves", time: "15:00-19:00", type: "Taller", title: "Residuo", place: "Lab", description: "", person: "" };
  assert.equal(buildAttendanceSessions([previousDayWorkshop]).length, 4);
  assert.equal(buildAttendanceSessions([{ ...previousDayWorkshop, date: "2026-10-20", time: "09:00-11:00 | 15:00-17:00" }]).length, 1);
  assert.equal(inspectAttendanceSchedule([{ ...previousDayWorkshop, time: "09:00-11:00 | 15:00-17:00" }]).skipped.length, 1);
  const sample = multi[0];
  assert.equal(sessionWindow(sample, new Date("2026-10-19T23:59:59-06:00")), false);
  assert.equal(sessionWindow(sample, new Date("2026-10-20T00:00:00-06:00")), true);
  assert.equal(sessionWindow(sample, new Date("2026-10-20T23:59:59-06:00")), true);
  assert.equal(sessionWindow(sample, new Date("2026-10-21T00:00:00-06:00")), false);
  assert.equal(sessionWindow(sample, new Date("2026-10-21T13:00:00-06:00")), false);
  assert.equal(validScanReference(token, "qr"), true);
  assert.equal(validScanReference(person, "qr"), false);
  assert.equal(validScanReference(person, "manual"), true);
  assert.equal(attendanceCsvCell(" =SUM(A1)"), '"\' =SUM(A1)"');
  assert.deepEqual([...normalizedEmailList(" A@UDG.MX, a@udg.mx ")], ["a@udg.mx"]);
  assert.equal(isAuthorizedCoordinator("CDQUIM@CUCEI.UDG.MX", "cdquim@cucei.udg.mx"), true);
  assert.equal(isAuthorizedCoordinator("jorge.lopezarce@academicos.udg.mx", "jorge.lopezarce@academicos.udg.mx"), true);
  assert.equal(isAuthorizedCoordinator("person@alumnos.udg.mx", "person@alumnos.udg.mx"), false);
  assert.equal(isAuthorizedCoordinator("cdquim@cucei.udg.mx", ""), false);
  assert.equal(areSimulationsEnabled("true", "production"), false);
  assert.equal(areSimulationsEnabled("true", "preview"), true);
  assert.equal(areSimulationsEnabled("false", "preview"), false);
  console.log("OK: permisos, asignación, QR, registro cancelado, inscripción, entradas/salidas, duplicados, captura manual, fechas, ventanas, multidía y CSV.");
  console.log("OK: 150 solicitudes locales -> 1 nueva entrada y 149 duplicados. Cinco simulaciones aisladas; Neon no se consultó.");
} finally { await db.close(); }
