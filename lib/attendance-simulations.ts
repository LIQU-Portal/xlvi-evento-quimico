import { formatMinutes, localEventTime } from "./program-agenda.ts";
import type { AttendanceSession } from "./attendance-rules.ts";

// Cinco actividades exclusivas del módulo interno; nunca se insertan en activities ni en Sheets.
export function buildSimulationSessions(now = new Date()): AttendanceSession[] {
  const { date, minutes } = localEventTime(now);
  const start = Math.max(0, Math.min(1310, minutes - 15));
  const templates = [
    { key: "conference-a", type: "Conferencia", title: "Conferencia A · Aula azul", offset: 0 },
    { key: "conference-b", type: "Conferencia", title: "Conferencia B · Aula morada (simultánea)", offset: 0 },
    { key: "conference-c", type: "Conferencia", title: "Conferencia C · Sesión siguiente", offset: 20 },
    { key: "workshop", type: "Taller", title: "Taller de simulación", offset: 0 },
    { key: "contest", type: "Concurso", title: "Concurso de simulación", offset: 0 },
  ] as const;
  return templates.map((t) => ({
    id: `simulation-${date}-${t.key}`, activityId: null, title: `SIMULACIÓN · ${t.title}`,
    type: t.type, venue: "Entorno de pruebas", isSimulation: true, active: true,
    startsAt: `${date}T${formatMinutes(start + t.offset)}:00-06:00`,
    endsAt: `${date}T${formatMinutes(start + t.offset + 60)}:00-06:00`,
  }));
}
