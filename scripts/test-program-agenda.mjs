import assert from "node:assert/strict";
import { buildAgenda, initialAgendaDay, normalizeVenue, parseTimeRanges, rangesOverlap, getLiveAgenda } from "../lib/program-agenda.ts";

const activity = (id, overrides = {}) => ({
  id, title: `Actividad ${id}`, date: "2026-10-20", day: "Día 1 Martes",
  time: "09:00-10:00", type: "Taller", place: "Auditorio", description: "", person: "",
  ...overrides,
});

const multiDay = activity(14, { date: "2026-10-20\n2026-10-23", day: "Día 1 Martes y Día 3 Jueves" });
const expanded = buildAgenda([multiDay]);
assert.deepEqual(expanded.map((entry) => entry.date), ["2026-10-20", "2026-10-23"]);
assert.ok(expanded.every((entry) => entry.item === multiDay && entry.notice.includes("no coinciden")));

const inferred = buildAgenda([activity(30, { date: undefined, day: "Día 2 Miércoles" })]);
assert.equal(inferred[0].date, "2026-10-21");
assert.match(inferred[0].notice, /Fecha por confirmar/);
assert.equal(buildAgenda([activity(32, { date: undefined, day: "Por confirmar" })])[0].date, null);
assert.equal(buildAgenda([activity(33, { date: "2026-10-24" })])[0].date, null);

const ordered = buildAgenda([
  activity(1, { time: "Horario por confirmar" }),
  activity(2, { time: "13:00-14:00, 14:00-15:00" }),
  activity(3, { time: "9:00 - 10:00" }),
  activity(4, { time: "09:00-12:00" }),
]);
assert.deepEqual(ordered.map((entry) => entry.item.id), [3, 4, 2, 1]);
assert.equal(ordered[2].item.time, "13:00-14:00, 14:00-15:00");
assert.equal(buildAgenda([activity(1, { date: "2026-10-20\n2026-10-20" })]).length, 1);
assert.deepEqual(buildAgenda([]), []);
assert.equal(normalizeVenue(" Auditorio Antonio Rodríguez  "), normalizeVenue("Auditorio  Antonio Rodriguez"));
assert.equal(initialAgendaDay(new Date("2026-10-21T05:30:00Z")), "2026-10-20");
assert.equal(initialAgendaDay(new Date("2026-10-21T06:30:00Z")), "2026-10-21");
assert.equal(initialAgendaDay(new Date("2026-11-01T12:00:00Z")), "2026-10-20");
console.log("Agenda checks passed: dates, warnings, sorting, repeated sessions, venues and timezone.");

assert.deepEqual(parseTimeRanges("13:00-14:00, 14:00–15:00"), [{ start: 780, end: 840 }, { start: 840, end: 900 }]);
assert.deepEqual(parseTimeRanges("17:00-16:00"), []);
assert.deepEqual(parseTimeRanges("Por confirmar"), []);
assert.equal(rangesOverlap(parseTimeRanges("09:00-10:00"), parseTimeRanges("10:00-11:00")), false);
assert.equal(rangesOverlap(parseTimeRanges("09:00-11:00"), parseTimeRanges("10:00-12:00")), true);
const liveItems = buildAgenda([
  activity(1, { time: "09:00-10:00" }),
  activity(2, { time: "09:00-11:00" }),
  activity(3, { time: "10:00-11:00" }),
  activity(4, { date: undefined }),
  activity(5, { date: "2026-10-20", day: "Día 3 Jueves" }),
]);
assert.deepEqual(getLiveAgenda(liveItems, new Date("2026-10-20T15:30:00Z")).current.map((entry) => entry.item.id), [1, 2]);
assert.deepEqual(getLiveAgenda(liveItems, new Date("2026-10-20T16:00:00Z")).current.map((entry) => entry.item.id), [2, 3]);
assert.equal(getLiveAgenda(liveItems, new Date("2026-09-20T16:00:00Z")).upcoming.item.id, 1);
assert.equal(getLiveAgenda(liveItems, new Date("2026-10-24T16:00:00Z")).upcoming, undefined);
assert.equal(getLiveAgenda([], new Date()).current.length, 0);
console.log("Timeline checks passed: multiple ranges, overlaps, live boundaries and uncertain dates excluded.");
