import { auth } from "@/auth";
import { attendanceReport, isAttendanceAdmin } from "@/lib/attendance";
import { attendanceCsvCell } from "@/lib/attendance-rules";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!isAttendanceAdmin(session?.user?.email)) return Response.redirect(new URL("/mi-cuenta", request.url));
  const sessionId = new URL(request.url).searchParams.get("sesion")?.slice(0, 120);
  const rows = await attendanceReport(sessionId);
  const columns = ["session_id", "title", "type", "starts_at", "ends_at", "is_simulation", "participant_id", "name", "email", "entered_at", "exited_at", "entry_operator", "exit_operator", "entry_reason", "exit_reason"];
  const csv = "\uFEFF" + [columns, ...rows.map((r) => columns.map((key) => r[key] ?? ""))]
    .map((row) => row.map(attendanceCsvCell).join(",")).join("\r\n");
  return new Response(csv, { headers: {
    "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="asistencia.csv"',
    "Cache-Control": "private, no-store",
  } });
}
