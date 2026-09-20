import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const connectionString =
  process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    "Falta POSTGRES_URL_NON_POOLING o POSTGRES_URL en .env.local.",
  );
}

const schemaUrl = new URL("../database/schema.sql", import.meta.url);
const schema = await readFile(fileURLToPath(schemaUrl), "utf8");
const statements = schema
  .split("-- statement-breakpoint")
  .map((statement) => statement.trim())
  .filter(Boolean);
const sql = neon(connectionString);

for (const statement of statements) {
  await sql.query(statement);
}

const tables = await sql.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name IN ($2, $3) ORDER BY table_name",
  ["public", "activities", "activity_enrollments"],
);

console.log(`Migración completada: ${statements.length} sentencias aplicadas.`);
console.log(`Tablas verificadas: ${tables.map((table) => table.table_name).join(", ")}`);
