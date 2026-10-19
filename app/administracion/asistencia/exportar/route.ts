import { auth } from "@/auth";
import { attendanceReport, attendanceVisits, isAttendanceAdmin } from "@/lib/attendance";
import { attendanceCsvCell } from "@/lib/attendance-rules";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!isAttendanceAdmin(session?.user?.email)) return Response.redirect(new URL("/mi-cuenta", request.url));
  const sessionId = new URL(request.url).searchParams.get("sesion")?.slice(0, 120);
  const detail = new URL(request.url).searchParams.get("detalle") === "estancias";
  const rows = detail ? await attendanceVisits(sessionId) : await attendanceReport(sessionId);
  const columns = ["session_id", "title", "type", "starts_at", "ends_at", "is_simulation", "participant_id", "name", "email", "entered_at", "exited_at", "entry_operator", "exit_operator", "entry_source", "exit_source", "entry_reason", "exit_reason"];
  const labels = ["Sesión", "Actividad", "Tipo", "Inicio (Ciudad de México)", "Fin (Ciudad de México)", "Simulación", "ID participante", "Nombre", "Correo", "Entrada (Ciudad de México)", "Salida (Ciudad de México)", "Registró entrada", "Registró salida", "Fuente entrada", "Fuente salida", "Motivo manual entrada", "Motivo manual salida"];
  columns.push(...(detail ? ["visit_id", "interval_status"] : ["attended_minutes", "credited_minutes", "open_intervals", "evidence_type"]));
  labels.push(...(detail ? ["ID estancia", "Estado"] : ["Minutos presentes cerrados", "Minutos reconocidos (>50%)", "Entradas sin salida", "Tipo de evidencia"]));
  if (!detail) { labels[9] = "Primera entrada (resumen)"; labels[10] = "Última salida (resumen)"; }
  const timestampKeys = new Set(["starts_at", "ends_at", "entered_at", "exited_at"]);
  const formatter = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Mexico_City",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const data = rows.map((r) => columns.map((key) =>
    r[key] && timestampKeys.has(key) ? formatter.format(new Date(String(r[key]))) : r[key] ?? ""));
  const csv = "\uFEFF" + [labels, ...data]
    .map((row) => row.map(attendanceCsvCell).join(",")).join("\r\n");
  return new Response(csv, { headers: {
    "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${detail ? "estancias-auditorio" : "asistencia"}.csv"`,
    "Cache-Control": "private, no-store",
  } });
}
