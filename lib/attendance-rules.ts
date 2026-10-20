import type { ProgramItem } from "../config/content";
import { formatMinutes, localEventTime, parseTimeRanges } from "./program-agenda.ts";

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
  isAuditorium?: boolean;
  isSupport?: boolean;
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
  return inspectAttendanceSchedule(items).sessions;
}

export function inspectAttendanceSchedule(items: ProgramItem[]) {
  const sessions: AttendanceSession[] = [];
  const skipped: string[] = [];
  for (const item of items) {
    // Las fechas explícitas son la fuente de verdad. Incluye también talleres previos al día inaugural.
    const dates = [...new Set(item.date?.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [])];
    const timeParts = item.time.split("|").map((value) => value.trim()).filter(Boolean);
    if (!dates.length || dates.some((date) => !Number.isFinite(Date.parse(`${date}T12:00:00-06:00`))
      || new Date(`${date}T12:00:00-06:00`).toISOString().slice(0, 10) !== date)
      || (dates.length > 1 && timeParts.length !== 1 && timeParts.length !== dates.length)) {
      skipped.push(item.title); continue;
    }
    const daily = dates.map((date, i) => ({ date, ranges: parseTimeRanges(
      dates.length === 1 ? item.time : timeParts.length === 1 ? timeParts[0] : timeParts[i],
    ) }));
    if (daily.some((d) => !d.ranges.length)) { skipped.push(item.title); continue; }
    for (const { date, ranges } of daily) {
      // Taller/concurso: una sola asistencia por día, incluso si tiene dos bloques horarios ese día.
      const periods = item.type === "Conferencia" ? ranges
        : [{ start: Math.min(...ranges.map((r) => r.start)), end: Math.max(...ranges.map((r) => r.end)) }];
      periods.forEach((range, index) => sessions.push({
        id: `activity-${item.id}-${date}-${index}`,
        activityId: item.id, title: item.title, type: item.type, venue: item.place,
        startsAt: `${date}T${formatMinutes(range.start)}:00-06:00`,
        endsAt: `${date}T${formatMinutes(range.end)}:00-06:00`,
        isSimulation: false, active: true,
      }));
    }
  }
  return { sessions, skipped };
}

export function validScanReference(reference: string, source: string) {
  return source === "qr"
    ? /^EQ26:EQ26-[A-F0-9]{10}:[A-Za-z0-9_-]{32}$/.test(reference)
    : source === "manual" && /^EQ26-[A-F0-9]{10}$/.test(reference);
}

export function normalizedEmailList(value: string | undefined) {
  return new Set((value ?? "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean));
}

export function isAuthorizedCoordinator(email: string | null | undefined, configured: string | undefined) {
  const allowed = new Set(["cdquim@cucei.udg.mx", "jorge.lopezarce@academicos.udg.mx"]);
  const normalized = email?.trim().toLowerCase();
  return Boolean(normalized && allowed.has(normalized) && normalizedEmailList(configured).has(normalized));
}

export function areSimulationsEnabled(flag: string | undefined, environment: string | undefined) {
  return flag === "true" && environment !== "production";
}

export function attendanceCsvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export const attendanceMessages: Record<string, string> = {
  not_support_staff: "Esta cuenta no está reconocida como staff activo de Apoyo operativo. Contacta a Coordinación.",
  open_support_elsewhere: "Tiene otra entrada de apoyo sin salida. Contacta a Coordinación antes de continuar.",
  open_visit_elsewhere: "Tiene una entrada sin salida en otro auditorio. Registra primero su salida allí.",
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
  entry_required: "Primero debe registrarse la entrada a esta sesión.",
  invalid_request: "Revisa los datos e inténtalo de nuevo.",
};
