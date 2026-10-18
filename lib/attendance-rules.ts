import type { ProgramItem } from "../config/content";
import { buildAgenda, formatMinutes, localEventTime, parseTimeRanges } from "./program-agenda.ts";

export type AttendanceSession = {
  id: string;
  activityId: number | null;
  title: string;
  type: "Conferencia" | "Taller" | "Concurso" | "Actividad";
  venue: string;
  startsAt: string;
  endsAt: string;
  isSimulation: boolean;
  active: boolean;
  entries?: number;
  exits?: number;
  operators?: string[];
};

export type AttendanceDirection = "entry" | "exit";
export type AttendanceResult = {
  outcome: string;
  message: string;
  participantId?: string;
  participantName?: string;
  recordedAt?: string;
};

export function sessionWindow(session: AttendanceSession, now = new Date()) {
  return session.active && localEventTime(now).date === localEventTime(new Date(session.startsAt)).date;
}

export function buildAttendanceSessions(items: ProgramItem[]): AttendanceSession[] {
  return buildAgenda(items).filter((o) => o.date && !o.notice).flatMap((o) =>
    parseTimeRanges(o.time).map((range, index) => ({
      id: `activity-${o.item.id}-${o.date}-${index}`,
      activityId: o.item.id, title: o.item.title, type: o.item.type, venue: o.item.place,
      startsAt: `${o.date}T${formatMinutes(range.start)}:00-06:00`,
      endsAt: `${o.date}T${formatMinutes(range.end)}:00-06:00`,
      isSimulation: false, active: true,
    })),
  );
}

export function validScanReference(reference: string, source: string) {
  return source === "qr"
    ? /^EQ26:EQ26-[A-F0-9]{10}:[A-Za-z0-9_-]{32}$/.test(reference)
    : source === "manual" && /^EQ26-[A-F0-9]{10}$/.test(reference);
}

export function normalizedEmailList(value: string | undefined) {
  return new Set((value ?? "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean));
}

export function attendanceCsvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export const attendanceMessages: Record<string, string> = {
  recorded: "Registro guardado",
  duplicate: "Ya estaba registrado",
  forbidden: "Tu acceso al lector no está activo. Contacta a tu coordinador.",
  not_assigned: "Esta sesión no está asignada a tu cuenta.",
  session_unavailable: "Esta sesión no está disponible.",
  outside_window: "El registro solo está disponible el día de esta sesión.",
  exit_not_required: "Esta actividad solo requiere entrada.",
  reason_required: "Escribe el motivo de la captura manual (mínimo 5 caracteres).",
  invalid_qr: "QR no reconocido. Usa el QR personal de Mi cuenta.",
  participant_cancelled: "El registro del participante está cancelado.",
  not_enrolled: "No tiene inscripción activa en esta actividad.",
  entry_required: "Primero debe registrarse la entrada a esta conferencia.",
  invalid_request: "Revisa los datos e inténtalo de nuevo.",
};
