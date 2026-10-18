import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL
  ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_URL_UNPOOLED;
if (!connectionString) throw new Error("Falta configurar la conexión con Neon en .env.local.");
const sql = neon(connectionString.trim());
const schema = await readFile(new URL("../database/attendance.sql", import.meta.url), "utf8");
const statements = schema.split("-- statement-breakpoint").map((s) => s.trim()).filter(Boolean);
await sql.transaction(statements.map((s) => sql.query(s)));
console.log(`Asistencia: ${statements.length} sentencias aplicadas. No se modificaron participantes ni inscripciones.`);
