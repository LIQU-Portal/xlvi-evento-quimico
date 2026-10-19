import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { PGlite } from "@electric-sql/pglite";

// Apps Script pure helpers run in a sandbox; no Google APIs, emails or live DB.
const context = vm.createContext({});
vm.runInContext(await readFile(new URL("../google-apps-script/Code.gs", import.meta.url), "utf8"), context);
const normalize = context.normalizeStaffFunction_;
assert.equal(normalize(undefined), "");
assert.equal(normalize("  APOYO   operativo "), "Apoyo operativo");
assert.equal(normalize("registro de asistencia"), "Registro de asistencia");
assert.throws(() => normalize("Administrador"), /staffFunction/);
const staffSheet = rows => ({ getDataRange: () => ({ getDisplayValues: () => [[], ...rows] }) });
const staff = context.getStaffInfo_(staffSheet([["test@alumnos.udg.mx", "Test", "si", "Alumno", "Apoyo operativo"]]), "test@alumnos.udg.mx");
assert.equal(staff.isStaff, true);
assert.equal(staff.staffFunction, "Apoyo operativo");
assert.equal(context.getStaffInfo_(staffSheet([["test@alumnos.udg.mx", "Test", "no", "Alumno", "Apoyo operativo"]]), "test@alumnos.udg.mx").staffFunction, "");
const old = context.getStaffInfo_(staffSheet([["test@alumnos.udg.mx", "Test", "si", "Alumno"]]), "test@alumnos.udg.mx");
assert.equal(old.staffFunction, "", "Legacy rows remain valid without inferred function");
const registration = { role: "Staff", accountType: "Alumno", staffType: "Alumno", staffFunction: "Apoyo operativo", id: "unchanged", qrToken: "unchanged" };
context.applyStaffInfo_(registration, { isStaff: false, staffType: "", staffFunction: "" });
assert.equal(registration.role, "Alumno");
assert.equal(registration.staffFunction, "");
assert.equal(registration.id, "unchanged");
assert.equal(registration.qrToken, "unchanged");
context.applyStaffInfo_(registration, staff);
assert.equal(registration.role, "Staff");
assert.equal(registration.staffFunction, "Apoyo operativo");

// Actual response and append paths, using only in-memory sheet mocks.
const rows = [[], ["EQ26-AAAAAAAAAA", "2026-10-01T12:00:00Z", "2026-10-01T12:00:00Z",
  "test@alumnos.udg.mx", "Test", "Alumno", "Alumno", "000000000", "Test", "Confirmado", "", "", ""]];
const registrationsSheet = {
  getDataRange: () => ({ getDisplayValues: () => rows }),
  appendRow: values => rows.push(values),
  getRange: (row, col) => ({ setValue: value => { rows[row - 1][col - 1] = value; } }),
};
const sheets = { Registros: registrationsSheet, Staff: staffSheet([
  ["test@alumnos.udg.mx", "Test", "si", "Alumno", "Apoyo operativo"],
  ["new@alumnos.udg.mx", "New", "si", "Alumno", "Registro de asistencia"],
]) };
context.getSpreadsheet_ = () => sheets;
context.ensureSheet_ = (_, name) => sheets[name];
context.createQrToken_ = id => `synthetic-${id}`;
context.createParticipantId_ = () => "EQ26-BBBBBBBBBB";
assert.equal(context.lookup_("test@alumnos.udg.mx").registration.staffFunction, "Apoyo operativo");
assert.equal(context.lookupMany_(["test@alumnos.udg.mx"]).registrations[0].registration.staffFunction, "Apoyo operativo");
assert.equal(context.listRegistrations_().registrations[0].staffFunction, "Apoyo operativo");
const payload = { email: "new@alumnos.udg.mx", name: "New", institutionalCode: "000000000", affiliation: "Test" };
assert.equal(context.register_(payload).registration.staffFunction, "Registro de asistencia");
assert.equal(rows[2].length, 13);
assert.equal(rows[2][12], "Registro de asistencia");
assert.equal(context.register_(payload).alreadyRegistered, true);
context.Logger = { log: () => {} };
context.syncStaffClassifications();
assert.equal(rows[1][12], "Apoyo operativo");
assert.equal(rows[1][0], "EQ26-AAAAAAAAAA");
assert.equal(rows[1][9], "Confirmado");

const db = new PGlite();
try {
  await db.exec(await readFile(new URL("../database/schema.sql", import.meta.url), "utf8"));
  const migration = await readFile(new URL("../database/staff-function.sql", import.meta.url), "utf8");
  await db.exec(migration);
  await db.exec(migration); // idempotent
  await db.exec(await readFile(new URL("../database/attendance.sql", import.meta.url), "utf8"));
  for (const [i, fn] of ["Apoyo operativo", "Registro de asistencia", null].entries()) {
    await db.query(`INSERT INTO participants(id,email,name,account_type,role,institutional_code,affiliation,status,qr_token,created_at,staff_function)
      VALUES($1,$2,'Test','Alumno','Staff','000000000','Test','Confirmado',$3,NOW(),$4)`, [`test-${i}`, `test-${i}@example.invalid`, `token-${i}`, fn]);
  }
  await db.query(`INSERT INTO attendance_sessions(id,title,type,venue,starts_at,ends_at,is_simulation,updated_by)
    VALUES('test','Test','Conferencia','Test',date_trunc('day',NOW()),date_trunc('day',NOW())+INTERVAL '1 hour',true,'test')`);
  for (const i of [0, 1]) {
    const result = await db.query("SELECT * FROM record_attendance('test',$1,'token-2','entry','qr','',true)", [`test-${i}@example.invalid`]);
    assert.equal(result.rows[0].outcome, "forbidden", "Neither classification grants operator permission");
  }
  assert.equal((await db.query("SELECT count(*)::int AS n FROM attendance_operators")).rows[0].n, 0);
  await assert.rejects(db.query("UPDATE participants SET staff_function='Administrador' WHERE id='test-0'"));
  assert.equal((await db.query("SELECT staff_function FROM participants WHERE id='test-0'")).rows[0].staff_function, "Apoyo operativo");
  // Run both real mirroring upserts against the in-memory schema to verify SQL parameters.
  const sql = { query: (text, params) => db.query(text, params) };
  const mirrorContext = vm.createContext({ getSql: () => sql, hasDatabaseConfiguration: () => true, sql, isoDate: value => value });
  const web = await readFile(new URL("../lib/registration.ts", import.meta.url), "utf8");
  const webFunction = web.slice(web.indexOf("async function mirrorRegistration("), web.indexOf("async function mirrorRegistrationSafely("))
    .replace("registration: EventRegistration", "registration");
  vm.runInContext(webFunction, mirrorContext);
  const sync = await readFile(new URL("./sync-participant-mirror.mjs", import.meta.url), "utf8");
  vm.runInContext(sync.slice(sync.indexOf("async function saveRegistration("), sync.indexOf("async function getRegistrations(")), mirrorContext);
  for (const save of [mirrorContext.mirrorRegistration, mirrorContext.saveRegistration]) {
    const data = { id: "test-0", email: "test-0@example.invalid", name: "Test", accountType: "Alumno", role: "Staff",
      staffType: "Alumno", staffFunction: "Registro de asistencia", institutionalCode: "000000000", affiliation: "Test",
      status: "Confirmado", createdAt: "2026-10-01T12:00:00Z" };
    await save(data);
    const stored = (await db.query("SELECT staff_function,qr_token FROM participants WHERE id='test-0'")).rows[0];
    assert.equal(stored.staff_function, "Registro de asistencia");
    assert.equal(stored.qr_token, "token-0", "Mirroring preserves an existing QR when no token is supplied");
    await save({ ...data, role: "Alumno" });
    assert.equal((await db.query("SELECT staff_function FROM participants WHERE id='test-0'")).rows[0].staff_function, null);
  }
} finally { await db.close(); }
console.log("OK: staff function normalization, legacy and inactive staff, preserved QR/ID, additive idempotent migration, stored classifications and no automatic reader permissions. No live services used.");
