import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let sqlClient: NeonQueryFunction<false, false> | null = null;

export function getDatabaseUrl() {
  return (
    process.env.POSTGRES_URL ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.DATABASE_URL_UNPOOLED
  )?.trim();
}

export function hasDatabaseConfiguration() {
  return Boolean(getDatabaseUrl());
}

export function getSql() {
  if (sqlClient) return sqlClient;

  const connectionString = getDatabaseUrl();

  if (!connectionString) {
    throw new Error("Falta configurar una URL de conexión con Neon.");
  }

  sqlClient = neon(connectionString);
  return sqlClient;
}
