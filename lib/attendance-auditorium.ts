import type { AttendanceSession } from "./attendance-rules.ts";
import { localEventTime } from "./program-agenda.ts";

export function buildAuditoriumBlocks(sessions: AttendanceSession[]) {
  const groups = new Map<string, AttendanceSession[]>();
  for (const session of sessions.filter(s => s.type === "Conferencia")) {
    const venue = session.venue.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
    if (!venue || /^(por confirmar|por definir|pendiente|sede por confirmar)$/.test(venue)) {
      throw new Error(`Define el auditorio antes de importar: ${session.title}`);
    }
    const key = `${session.isSimulation ? "simulation" : "real"}:${localEventTime(new Date(session.startsAt)).date}:${venue}`;
    groups.set(key, [...(groups.get(key) ?? []), session]);
  }
  const usedIds = new Set<string>();
  return [...groups].map(([key, members]) => {
    members.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    for (let i = 1; i < members.length; i++) {
      if (Date.parse(members[i].startsAt) < Date.parse(members[i - 1].endsAt)) throw new Error(`Conferencias traslapadas en ${members[0].venue}. Revisa sus horarios o sedes.`);
    }
    let hash = 2166136261;
    for (const c of key) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
    const id = `auditorium-${members[0].isSimulation ? "sim" : "real"}-${hash.toString(16)}-${localEventTime(new Date(members[0].startsAt)).date}`;
    if (usedIds.has(id)) throw new Error("Conflicto de identificadores de auditorio; revisa las sedes.");
    usedIds.add(id);
    return { block: { ...members[0], id,
      title: `${members[0].isSimulation ? "SIMULACIÓN · " : ""}Conferencias · ${members[0].venue}`,
      startsAt: members[0].startsAt, endsAt: members.at(-1)!.endsAt, isAuditorium: true }, members };
  });
}

// Reused in the server and tested independently; never invent exit timestamps.
export function conferenceMinutes(start: string, end: string, visits: { enteredAt: string; exitedAt: string | null }[]) {
  const from = Date.parse(start), to = Date.parse(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) throw new Error("Horario inválido");
  const ranges = visits.filter(v => v.exitedAt).map(v => [Math.max(from, Date.parse(v.enteredAt)), Math.min(to, Date.parse(v.exitedAt!))])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a).sort((a, b) => a[0] - b[0]);
  let milliseconds = 0, a = 0, b = 0;
  for (const range of ranges) {
    if (range[0] > b) { milliseconds += b - a; [a, b] = range; }
    else b = Math.max(b, range[1]);
  }
  milliseconds += b - a;
  const attendedMinutes = Math.floor(milliseconds / 600) / 100;
  return { attendedMinutes, creditedMinutes: milliseconds > (to - from) / 2 ? attendedMinutes : 0 };
}
