import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";

class MigrationCheckError extends Error {}
try {
  const expected = process.argv.find(a => a.startsWith("--expected-fingerprint="))?.slice("--expected-fingerprint=".length);
  if (!/^[a-f0-9]{12}$/.test(expected ?? "")) throw new MigrationCheckError("Specify a previously reviewed --expected-fingerprint; no queries executed.");
  const connection = process.env.DATABASE_URL?.trim();
  let destination;
  try { destination = new URL(connection); } catch { throw new MigrationCheckError("Missing or invalid DATABASE_URL; no fallback connection is used."); }
  const fingerprint = createHash("sha256").update(destination.hostname.replace("-pooler", "") + destination.pathname).digest("hex").slice(0, 12);
  if (fingerprint !== expected) throw new MigrationCheckError("Wrong database fingerprint; no queries executed.");
  const sql = neon(connection);
  const migration = await readFile(new URL("../database/staff-function.sql", import.meta.url), "utf8");
  await sql.query(migration);
  console.log("staff_function ready. No participant rows, enrollments, QR tokens or operator permissions were changed.");
} catch (error) {
  console.error(error instanceof MigrationCheckError ? error.message : "Migration failed; driver details suppressed to protect credentials.");
  process.exitCode = 1;
}
