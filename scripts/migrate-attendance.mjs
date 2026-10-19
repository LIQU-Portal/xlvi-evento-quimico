import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";

class MigrationCheckError extends Error {}
try {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new MigrationCheckError("Falta configurar DATABASE_URL.");
  const expected = process.argv.find(a => a.startsWith("--expected-fingerprint="))?.slice("--expected-fingerprint=".length);
  if (!/^[a-f0-9]{12}$/.test(expected ?? "")) throw new MigrationCheckError("Indica --expected-fingerprint con la huella del destino verificado. No se realizaron consultas.");
  let destination;
  try { destination = new URL(connectionString.trim()); } catch { throw new MigrationCheckError("DATABASE_URL inválida. No se realizaron consultas."); }
  const fingerprint = createHash("sha256").update(destination.hostname.replace("-pooler", "") + destination.pathname).digest("hex").slice(0, 12);
  if (fingerprint !== expected) throw new MigrationCheckError("El destino no coincide. No se realizaron consultas.");
  const sql = neon(connectionString.trim());
  const schema = await readFile(new URL("../database/attendance.sql", import.meta.url), "utf8") + "\n-- statement-breakpoint\n"
    + await readFile(new URL("../database/attendance-auditorium.sql", import.meta.url), "utf8");
  const statements = schema.split("-- statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  await sql.transaction(statements.map((s) => sql.query(s)));
  console.log(`Asistencia: ${statements.length} sentencias aplicadas. No se modificaron participantes ni inscripciones.`);
} catch (error) {
  console.error(error instanceof MigrationCheckError ? error.message : "No se completó la migración de asistencia. Detalles del controlador omitidos para proteger credenciales.");
  process.exitCode = 1;
}
