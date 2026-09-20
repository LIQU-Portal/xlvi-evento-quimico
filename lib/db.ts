import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let sqlClient: NeonQueryFunction<false, false> | null = null;

export function getSql() {
  if (sqlClient) return sqlClient;

  const connectionString = process.env.POSTGRES_URL;

  if (!connectionString) {
    throw new Error("Falta configurar POSTGRES_URL.");
  }

  sqlClient = neon(connectionString);
  return sqlClient;
}
