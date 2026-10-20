import type { AttendanceSession } from "./attendance-rules";
import { formatMinutes, localEventTime } from "./program-agenda.ts";

const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
export const sessionDate = (s: AttendanceSession) => localEventTime(new Date(s.startsAt)).date;
export const sessionStartTime = (s: AttendanceSession) => formatMinutes(localEventTime(new Date(s.startsAt)).minutes);
const valid = (s: AttendanceSession) => Number.isFinite(Date.parse(s.startsAt)) && Number.isFinite(Date.parse(s.endsAt)) && Date.parse(s.endsAt) > Date.parse(s.startsAt);
const byStart = (a: AttendanceSession, b: AttendanceSession) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.title.localeCompare(b.title, "es") || a.id.localeCompare(b.id);

export function sessionTiming(session: AttendanceSession, now: Date): "current" | "upcoming" | "finished" {
  if (Date.parse(session.startsAt) > now.getTime()) return "upcoming";
  return Date.parse(session.endsAt) > now.getTime() ? "current" : "finished";
}

export function assignedSessionDays(sessions: AttendanceSession[]) {
  return [...new Set(sessions.filter(s => s.active && valid(s)).map(sessionDate))].sort();
}

export function assignedSessionsForDay(sessions: AttendanceSession[], day: string) {
  return sessions.filter(s => s.active && valid(s) && sessionDate(s) === day).sort(byStart);
}

export function filterSessionChoices(sessions: AttendanceSession[], query: string, startTime = "") {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  return sessions.filter(s => terms.every(term => normalizeSearch(s.title + " " + s.venue).includes(term))
    && (!startTime || sessionStartTime(s) === startTime));
}

const tones = ["violet", "teal", "pink", "blue", "indigo", "mint", "lavender", "rose"] as const;
export function sessionTimeTone(startTime: string) {
  const hour = Number(startTime.split(":")[0]);
  return tones[Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour % tones.length : 0];
}

// Reusable in reader and coordination; does not mutate props or confer permissions.
export function groupSessionChoices(sessions: AttendanceSession[]) {
  const ordered = sessions.filter(valid).slice().sort(byStart);
  const conferences = ordered.filter(s => s.type === "Conferencia");
  const groups: Array<{key: string; label: string; tone: string; sessions: AttendanceSession[]}> = [];
  if (conferences.length) groups.push({key: "conferences", label: "Conferencias · Auditorio", tone: "neutral", sessions: conferences});
  const support = ordered.filter(s => s.isSupport);
  if (support.length) groups.push({key: "support", label: "Apoyo operativo · Todo el día", tone: "teal", sessions: support});
  for (const s of ordered.filter(s => s.type !== "Conferencia" && !s.isSupport)) {
    const time = sessionStartTime(s);
    const existing = groups.find(group => group.key === time);
    if (existing) existing.sessions.push(s);
    else groups.push({key: time, label: time + " h", tone: sessionTimeTone(time), sessions: [s]});
  }
  return groups;
}
