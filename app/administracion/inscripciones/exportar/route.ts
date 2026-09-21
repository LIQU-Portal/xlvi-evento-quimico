import { auth } from "@/auth";
import {
  getAdminEnrollments,
  isActivityAdmin,
  type AdminEnrollmentStatus,
} from "@/lib/activity-admin";

function safeCsvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();

  if (!email || !isActivityAdmin(email)) {
    return new Response("No autorizado", { status: 403 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("buscar")?.trim().slice(0, 160) ?? "";
  const rawActivityId = url.searchParams.get("actividad") ?? "";
  const activityId = /^\d+$/.test(rawActivityId) ? Number(rawActivityId) : undefined;
  const rawStatus = url.searchParams.get("estado");
  const status: AdminEnrollmentStatus =
    rawStatus === "Confirmado" || rawStatus === "Cancelado" ? rawStatus : "Todos";
  const enrollments = await getAdminEnrollments({ search, activityId, status });
  const rows = [
    ["ID inscripción", "ID participante", "Nombre", "Correo", "Actividad", "Tipo", "Estado", "Fecha de inscripción", "Fecha de cancelación", "Cancelado por", "Motivo"],
    ...enrollments.map((item) => [
      item.id,
      item.participantId,
      item.participantName,
      item.participantEmail,
      item.activityTitle,
      item.activityType,
      item.status,
      item.createdAt,
      item.cancelledAt,
      item.cancelledBy,
      item.cancellationReason,
    ]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(safeCsvCell).join(",")).join("\r\n")}`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="inscripciones-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
