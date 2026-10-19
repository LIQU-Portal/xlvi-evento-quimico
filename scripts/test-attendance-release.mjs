import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const checker = fileURLToPath(new URL("./check-attendance-release.mjs", import.meta.url));
const secretMarker = "never-print-this-placeholder-password";
const connection = `postgresql://test:${secretMarker}@example.invalid/neondb`;
const fingerprint = createHash("sha256").update("example.invalid/neondb").digest("hex").slice(0, 12);
const base = { ...process.env, DATABASE_URL: connection,
  ATTENDANCE_ADMIN_EMAILS: "cdquim@cucei.udg.mx,jorge.lopezarce@academicos.udg.mx", ATTENDANCE_SIMULATION_ENABLED: "false" };
const args = ["--environment=production", "--phase=before-migration", `--expected-fingerprint=${fingerprint}`];
const reject = (cli, overrides, expected) => {
  const result = spawnSync(process.execPath, [checker, ...cli], { env: { ...base, ...overrides }, encoding: "utf8", timeout: 5000 });
  assert.equal(result.error, undefined, "Guard checks must finish without trying a network query");
  assert.equal(result.status, 1);
  assert.match(result.stderr, expected);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(secretMarker), "No secrets in diagnostics");
};
reject([], {}, /Specify environment/);
reject(args, { DATABASE_URL: "" }, /Missing or invalid DATABASE_URL/);
reject([...args.slice(0, 2), "--expected-fingerprint=000000000000"], {}, /Wrong database fingerprint/);
reject(args, { ATTENDANCE_ADMIN_EMAILS: "" }, /two authorized/);
reject(args, { ATTENDANCE_ADMIN_EMAILS: `${base.ATTENDANCE_ADMIN_EMAILS},other@example.invalid` }, /two authorized/);
reject(args, { ATTENDANCE_SIMULATION_ENABLED: "true" }, /false explicitly/);
reject(args, { ATTENDANCE_SIMULATION_ENABLED: "" }, /false explicitly/);
const testHost = "ep-orange-tree-awr9w6tf-pooler.c-12.us-east-1.aws.neon.tech";
reject([...args.slice(0, 2), "--expected-fingerprint=b619c2fac063"], { DATABASE_URL: `postgresql://test:${secretMarker}@${testHost}/neondb` }, /simulation database cannot be used as production/);
console.log("OK: release preflight fails closed for arguments, missing connection, wrong destination, coordinators and production simulations; no network or database writes.");
