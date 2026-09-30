import type { ProgramItem } from "../config/content";

export const eventDays = [
  { date: "2026-10-20", label: "Martes", day: 20 },
  { date: "2026-10-21", label: "Miércoles", day: 21 },
  { date: "2026-10-22", label: "Jueves", day: 22 },
  { date: "2026-10-23", label: "Viernes", day: 23 },
] as const;

export type AgendaOccurrence = {
  item: ProgramItem;
  date: string | null;
  time: string;
  notice?: string;
};

export type TimeRange = { start: number; end: number };

export function parseTimeRanges(value: string): TimeRange[] {
  const matches = value.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\s*[-–—]\s*([01]?\d|2[0-3]):([0-5]\d)\b/g);
  return Array.from(matches, (match) => ({
    start: Number(match[1]) * 60 + Number(match[2]),
    end: Number(match[3]) * 60 + Number(match[4]),
  })).filter((range) => range.end > range.start).sort((a, b) => a.start - b.start);
}

export function formatMinutes(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function localEventTime(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, minutes: Number(part("hour")) * 60 + Number(part("minute")) };
}

export function getLiveAgenda(occurrences: AgendaOccurrence[], now: Date) {
  const local = localEventTime(now);
  // Uncertain dates must not be presented as activities happening now.
  const sessions = occurrences.filter((entry) => entry.date && !entry.notice).flatMap((entry) =>
    parseTimeRanges(entry.time).map((range) => ({ ...entry, ...range })),
  ).sort((a, b) => a.date!.localeCompare(b.date!) || a.start - b.start);
  const current = [...new Map(sessions.filter((entry) => entry.date === local.date && entry.start <= local.minutes && local.minutes < entry.end).map((entry) => [entry.item.id, entry])).values()];
  const upcoming = sessions.find((entry) => entry.date! > local.date || (entry.date === local.date && entry.start > local.minutes));
  return { current, upcoming, local };
}

export function rangesOverlap(a: TimeRange[], b: TimeRange[]) {
  return a.some((left) => b.some((right) => left.start < right.end && right.start < left.end));
}

export function normalizeVenue(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function initialAgendaDay(now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  return eventDays.find((day) => day.date === today)?.date ?? eventDays[0].date;
}

function startMinutes(time: string) {
  const match = time.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : Infinity;
}

function occurrenceTimes(value: string, count: number) {
  const sessions = value.split("|").map((time) => time.trim()).filter(Boolean);
  return sessions.length === count
    ? sessions
    : Array.from({ length: count }, () => value);
}

export function buildAgenda(items: ProgramItem[]): AgendaOccurrence[] {
  return items.flatMap((item): AgendaOccurrence[] => {
    const dates = [...new Set(item.date?.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [])];
    const dayText = normalizeVenue(item.day);
    const inferred = eventDays.filter((day, index) =>
      dayText.includes(normalizeVenue(day.label)) || new RegExp(`\\bdia\\s+${index + 1}\\b`).test(dayText),
    ).map((day) => day.date as string);

    if (dates.length) {
      const conflict = inferred.length > 0 && (
        dates.length !== inferred.length || dates.some((date) => !inferred.includes(date))
      );
      const scheduled = dates.filter((date) => eventDays.some((day) => day.date === date));
      const times = occurrenceTimes(item.time, dates.length);
      const occurrences: AgendaOccurrence[] = scheduled.map((date) => ({
        item, date,
        time: times[dates.indexOf(date)],
        ...(conflict ? { notice: `Fecha por confirmar: la fecha y el día publicados no coinciden (${item.day.replace(/\s+/g, " ")}).` } : {}),
      }));
      if (scheduled.length !== dates.length) occurrences.push({ item, date: null, time: item.time, notice: `Fecha fuera de la semana anunciada: ${dates.filter((date) => !scheduled.includes(date)).join(", ")}. Por confirmar.` });
      return occurrences;
    }
    if (inferred.length) {
      const times = occurrenceTimes(item.time, inferred.length);
      return inferred.map((date, index) => ({ item, date, time: times[index], notice: "Fecha por confirmar; ubicación basada en el día publicado." }));
    }
    return [{ item, date: null, time: item.time, notice: "Fecha por confirmar." }];
  }).sort((a, b) => startMinutes(a.time) - startMinutes(b.time) || a.item.id - b.item.id);
}
