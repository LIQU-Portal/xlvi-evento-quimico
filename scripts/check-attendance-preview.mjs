import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";

// This diagnostic is intentionally limited to the attendance test branch. It
// never migrates or modifies data, and never outputs credentials or records.
const testBranch = "feature/control-asistencia-qr";
const expectedFingerprint = "b619c2fac063";
class PreviewCheckError extends Error {}
if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_GIT_COMMIT_REF === testBranch) {
  try {
    const connection = process.env.DATABASE_URL?.trim();
    if (!connection) throw new PreviewCheckError("Falta DATABASE_URL específica del Preview de asistencia.");
    let destination;
    try { destination = new URL(connection); } catch { throw new PreviewCheckError("DATABASE_URL no tiene formato válido."); }
    const fingerprint = createHash("sha256")
      .update(destination.hostname.replace("-pooler", "") + destination.pathname)
      .digest("hex").slice(0, 12);
    if (fingerprint !== expectedFingerprint) {
      throw new PreviewCheckError("Preview detenido: DATABASE_URL no coincide con la base de pruebas de asistencia verificada. No se consultó esa base.");
    }
    const sql = neon(connection);
    const required = ["participants", "attendance_operators", "attendance_sessions", "attendance_assignments",
      "attendance_simulation_roster", "attendance_events", "attendance_audit", "attendance_auditorium_blocks", "attendance_auditorium_members", "attendance_visits", "attendance_scan_requests"];
    const rows = await sql.query("SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = ANY($2::text[])", ["public", required]);
    const tables = new Set(rows.map((row) => row.table_name));
    if (required.some((name) => !tables.has(name))) {
      throw new PreviewCheckError("Conexión de pruebas OK, pero faltan tablas. Aplica explícitamente la migración en pruebas; el build no crea tablas.");
    }
    const [staffColumn] = await sql.query("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='participants' AND column_name='staff_function') AS present");
    if (!staffColumn.present) throw new PreviewCheckError("Falta staff_function en pruebas. Aplica explícitamente su migración antes de publicar esta versión; el build no migra.");
    const [routine] = await sql.query("SELECT to_regprocedure($1) IS NOT NULL AS present", ["public.record_attendance_v2(text,text,text,text,text,text,boolean,text)"]);
    if (!routine?.present) throw new PreviewCheckError("Conexión de pruebas OK, pero falta la función de lectura de asistencia.");
    const [staffGuard] = await sql.query("SELECT to_regprocedure('public.attendance_staff_can_register(text)') IS NOT NULL AS present");
    if (!staffGuard?.present) throw new PreviewCheckError("Falta la autorización de staffFunction. Aplica la migración de asistencia actualizada explícitamente en pruebas.");
    console.log("ASISTENCIA PREVIEW: conexión OK; destino de pruebas confirmado; tablas y función listas. Verificación de solo lectura.");
  } catch (error) {
    // Do not print database-driver errors, URLs, tokens, or connection details.
    console.error(error instanceof PreviewCheckError ? error.message
      : "No se pudo comprobar la conexión de pruebas desde Vercel. El Preview no se publicará.");
    process.exitCode = 1;
  }
}
