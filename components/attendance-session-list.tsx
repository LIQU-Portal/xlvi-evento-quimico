"use client";

import Link from "next/link";
import { useState } from "react";
import { AttendanceAdminForm } from "@/components/attendance-admin-form";
import { operatorCanScan, type AttendanceOperatorOption } from "@/lib/attendance-operator-list";
import type { AttendanceSession } from "@/lib/attendance-rules";
import { groupSessionChoices, sessionStartTime } from "@/lib/attendance-session-picker";

const dateKey = (date: string) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(date));
const format = (date: string) => new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
}).format(new Date(date));

export function AttendanceSessionList({ sessions, operators }: { sessions: AttendanceSession[]; operators: AttendanceOperatorOption[] }) {
  const [day, setDay] = useState("");
  const [kind, setKind] = useState("");
  const [scope, setScope] = useState("");
  const [hour, setHour] = useState("");
  const enabled = operators.filter(operatorCanScan);
  const days = [...new Set(sessions.map((s) => dateKey(s.startsAt)))].sort();
  const daily = sessions.filter((s) => (!day || dateKey(s.startsAt) === day) && (!kind || s.type === kind)
    && (!scope || (scope === "simulation" ? s.isSimulation : scope === "support" ? s.isSupport : !s.isSimulation && !s.isSupport)));
  const hours = [...new Set(daily.filter(s => !s.isSupport).map(sessionStartTime))].sort();
  const visible = daily.filter(s => !hour || sessionStartTime(s) === hour);
  const visibleDays = [...new Set(visible.map(s => dateKey(s.startsAt)))].sort();
  return <>
    <div className="attendance-filters">
      <label>Día<select aria-label="Día" value={day} onChange={(e) => { setDay(e.target.value); setHour(""); }}><option value="">Todos los días</option>{days.map((d) => <option key={d} value={d}>{d.split("-").reverse().join("/")}</option>)}</select></label>
      <label>Hora de inicio<select aria-label="Hora de inicio" value={hour} onChange={e => setHour(e.target.value)}><option value="">Todas las horas</option>{hours.map(h => <option key={h} value={h}>{h} h</option>)}</select></label>
      <label>Tipo<select aria-label="Tipo" value={kind} onChange={(e) => { setKind(e.target.value); setHour(""); }}><option value="">Todos los tipos</option>{[...new Set(sessions.map((s) => s.type))].map((t) => <option key={t}>{t}</option>)}</select></label>
      <label>Programa, apoyo o pruebas<select aria-label="Programa, apoyo o pruebas" value={scope} onChange={(e) => { setScope(e.target.value); setHour(""); }}><option value="">Todas las sesiones</option><option value="real">Programa</option><option value="support">Apoyo operativo</option><option value="simulation">Simulaciones</option></select></label>
    </div>
    <p className="attendance-muted" role="status">{visible.length} sesiones · Horarios de Ciudad de México</p>
    {!sessions.length && <p className="attendance-empty">Aún no hay sesiones. Actualiza el programa o crea las simulaciones en el paso 2.</p>}
    {!!sessions.length && !visible.length && <p>No hay sesiones con estos filtros.</p>}
    {!enabled.length && <p className="attendance-notice">Habilita al menos un operador en el paso 1 para poder asignar sesiones.</p>}
    <div>{visibleDays.map(date => <section key={date} className="attendance-coordination-day" aria-label={`Sesiones del ${date}`}>
      <h3>{new Intl.DateTimeFormat("es-MX", {timeZone: "America/Mexico_City", weekday: "long", day: "numeric", month: "long"}).format(new Date(`${date}T12:00:00-06:00`))}</h3>
      {groupSessionChoices(visible.filter(s => dateKey(s.startsAt) === date)).map(group => <section key={group.key} className="attendance-time-group" data-slot-tone={group.tone} aria-label={group.label}>
        <div className="attendance-time-group-heading"><h4>{group.label}</h4><span>{group.sessions.length} {group.sessions.length === 1 ? "sesión" : "sesiones"}</span></div>
        <div className="attendance-admin-list">{group.sessions.map((s) => {
      const assigned = enabled.filter((o) => s.operators?.includes(o.email));
      return <details key={s.id} className="attendance-admin-card attendance-session-card">
        <summary>
          <div className="attendance-card-heading"><span className="attendance-badge" data-tone={s.isSimulation ? "test" : "neutral"}>{s.isSimulation ? "Simulación · " : ""}{s.isSupport ? "Apoyo operativo" : s.type}</span>
            <span className="attendance-badge" data-tone={!s.active ? "neutral" : assigned.length ? "success" : "test"}>{!s.active ? "Inactiva" : assigned.length ? `${assigned.length} ${assigned.length === 1 ? "operador" : "operadores"}` : "Sin asignar"}</span></div>
          <h3>{s.title}</h3><p>{s.isSupport ? `${dateKey(s.startsAt)} · Todo el día` : `${format(s.startsAt)} – ${format(s.endsAt)}`}</p><p className="attendance-muted">{s.venue}</p>
          {s.isAuditorium && <p>Registro continuo del auditorio. No escanear entre conferencias.</p>}
          {s.isSupport && <p>Lista única del día · Entrada y salida · Horas reales sin elegir turno</p>}
          <span className="attendance-summary-action">Ver operadores y asignar</span>
        </summary>
        <p>{assigned.length ? `Asignados: ${assigned.map((o) => o.name || o.email).join(", ")}` : "Ningún operador habilitado asignado"}</p>
        <p><strong>{s.entries} entradas</strong>{(s.type === "Conferencia" || s.isSupport) && <> · <strong>{s.exits} salidas</strong></>}</p>
        {s.active && !!enabled.length && <AttendanceAdminForm key={JSON.stringify(s.operators)} operation="assign" label="Guardar asignación">
          <input type="hidden" name="sessionId" value={s.id} />
          <p className="attendance-muted">Marca quién registrará esta sesión. Puedes seleccionar varias personas.</p>
          {enabled.map((o) => <label className="attendance-check" key={o.email}><input type="checkbox" name="operators" value={o.email} defaultChecked={s.operators?.includes(o.email)} /><span>{o.name || o.email}<small>{o.email}</small></span></label>)}
        </AttendanceAdminForm>}
        <Link href={`/administracion/asistencia?sesion=${encodeURIComponent(s.id)}#registros`}>Ver asistentes →</Link>
      </details>;
    })}</div></section>)}</section>)}</div>
  </>;
}
