"use client";

import { useState, type CSSProperties } from "react";
import type { ProgramItem } from "@/config/content";
import { formatMinutes, parseTimeRanges, rangesOverlap, type AgendaOccurrence } from "@/lib/program-agenda";
import { programCategories } from "@/components/event-pulse";

export function ProgramTimeline({ occurrences, onOpen }: {
  occurrences: AgendaOccurrence[];
  onOpen: (item: ProgramItem) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const rows = occurrences.map((entry) => ({ ...entry, ranges: parseTimeRanges(entry.item.time) }));
  const ranges = rows.flatMap((row) => row.ranges);
  const start = Math.floor(Math.min(9 * 60, ...ranges.map((range) => range.start)) / 60) * 60;
  const end = Math.ceil(Math.max(18 * 60, ...ranges.map((range) => range.end)) / 60) * 60;
  const duration = end - start;
  const hours = Array.from({ length: duration / 60 + 1 }, (_, index) => start + index * 60);
  const chosen = rows.find((row) => row.item.id === selected);
  const overlaps = chosen ? rows.filter((row) => row.item.id !== chosen.item.id && rangesOverlap(chosen.ranges, row.ranges)) : [];
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const hour = row.ranges.length ? formatMinutes(row.ranges[0].start) : "Por confirmar";
    groups.set(hour, [...(groups.get(hour) ?? []), row]);
  }

  return <>
    <div className="schedule-legend" aria-label="Colores por tipo de actividad">{programCategories.map(({ type, label }) => <span key={type} className={`schedule-color-${type.toLowerCase()}`}><i aria-hidden="true" />{label}</span>)}</div>
    <p className="schedule-instruction">Cada barra muestra la duración. Las barras alineadas en la misma hora coinciden. Selecciona una para ver su sede y traslapes.</p>
    <p className="schedule-mobile-instruction">Recorre el día por hora de inicio. Toca una actividad para ver dónde es y con cuáles coincide.</p>
    {rows.length ? <>
      <div className="mobile-program" aria-label="Programa organizado por hora de inicio">
        {[...groups].map(([hour, activities]) => <section className="mobile-program-group" key={hour} aria-label={`Inicio: ${hour}`}>
          <h4 className="mobile-program-hour">{hour}<span>{activities.length > 1 ? `${activities.length} actividades comienzan aquí` : "Inicio"}</span></h4>
          <ul className="mobile-program-list">{activities.map((row) => {
            const isSelected = selected === row.item.id;
            const conflicts = rows.filter((other) => other.item.id !== row.item.id && rangesOverlap(row.ranges, other.ranges));
            const overlapsSelected = overlaps.some((other) => other.item.id === row.item.id);
            return <li key={row.item.id} className={`mobile-program-item schedule-color-${row.item.type.toLowerCase()}${isSelected ? " is-selected" : ""}${overlapsSelected ? " is-overlap" : ""}`}>
              <button type="button" className="mobile-program-button" aria-expanded={isSelected} aria-controls={`mobile-activity-${row.item.id}`} onClick={() => setSelected(isSelected ? null : row.item.id)}>
                <span className="mobile-program-type">{row.item.type}<span aria-hidden="true">{isSelected ? "−" : "+"}</span></span>
                <strong>{row.item.title}</strong>
                <span className="mobile-program-meta">{row.item.time}{conflicts.length > 0 && <span>{conflicts.length} {conflicts.length === 1 ? "traslape" : "traslapes"}</span>}</span>
                {row.notice && <span className="mobile-program-warning">Fecha por confirmar</span>}
                {overlapsSelected && <span className="mobile-program-warning">Coincide con la actividad seleccionada</span>}
              </button>
              <div id={`mobile-activity-${row.item.id}`} hidden={!isSelected} className="mobile-program-detail">
                <p><strong>Sede:</strong> {row.item.place}</p>
                {row.notice && <p className="agenda-notice">{row.notice}</p>}
                {conflicts.length ? <><p>Coincide en horario con:</p><ul>{conflicts.map((other) => <li key={other.item.id}>{other.item.title} <span>· {other.item.time}</span></li>)}</ul></> : <p>{row.ranges.length ? "Sin traslapes con las actividades mostradas." : "Horario pendiente de confirmar."}</p>}
                <button className="agenda-details" type="button" onClick={() => onOpen(row.item)}>Ver ficha completa ↗</button>
              </div>
            </li>;
          })}</ul>
        </section>)}
      </div>
      <div className="schedule-scroll" tabIndex={0} role="region" aria-label="Diagrama de horarios. Desplázate horizontalmente para recorrer las horas.">
        <div className="schedule-chart" style={{ "--hour-width": `${100 / (hours.length - 1)}%` } as CSSProperties}>
          <div className="schedule-axis"><span>Actividad / horario</span><div>{hours.map((hour) => <span key={hour} style={{ left: `${(hour - start) / duration * 100}%` }}>{formatMinutes(hour)}</span>)}</div></div>
          {rows.map((row) => {
            const isSelected = selected === row.item.id;
            const overlapsSelected = overlaps.some((entry) => entry.item.id === row.item.id);
            return <div key={`${row.item.id}-${row.date}`} className={`schedule-row schedule-color-${row.item.type.toLowerCase()}${isSelected ? " is-selected" : ""}${overlapsSelected ? " is-overlap" : ""}`}>
              <button className="schedule-label" type="button" aria-pressed={isSelected} onClick={() => setSelected(isSelected ? null : row.item.id)} title={row.item.title}><i aria-hidden="true" /><span>{row.item.title}{row.notice && <small>Fecha por confirmar</small>}</span></button>
              <div className="schedule-track">
                {row.ranges.length ? row.ranges.map((range, index) => <button key={index} type="button" className={`schedule-bar${row.notice ? " is-uncertain" : ""}`} style={{ left: `${(range.start - start) / duration * 100}%`, width: `${(range.end - range.start) / duration * 100}%` }} onClick={() => setSelected(isSelected ? null : row.item.id)} aria-pressed={isSelected} aria-label={`${row.item.title}, ${row.item.type}, ${formatMinutes(range.start)} a ${formatMinutes(range.end)}, ${row.item.place}${row.notice ? ", fecha por confirmar" : ""}`} title={`${row.item.title}\n${formatMinutes(range.start)}–${formatMinutes(range.end)} · ${row.item.place}`}><span>{formatMinutes(range.start)}–{formatMinutes(range.end)}</span></button>) : <button type="button" className="schedule-no-time" onClick={() => setSelected(row.item.id)}>Horario por confirmar</button>}
              </div>
            </div>;
          })}
        </div>
      </div>
      <p className="schedule-mobile-hint">Desliza el diagrama para recorrer los horarios →</p>
      <div className="schedule-inspector" aria-live="polite">
        {chosen ? <><div><span className={`schedule-detail-type schedule-color-${chosen.item.type.toLowerCase()}`}>{chosen.item.type} · {chosen.item.time}</span><h4>{chosen.item.title}</h4><p>{chosen.item.place}</p>{chosen.notice && <p className="agenda-notice">{chosen.notice}</p>}<p className="schedule-overlap-note">{overlaps.length ? `Coincide en horario con ${overlaps.length} ${overlaps.length === 1 ? "actividad" : "actividades"}, resaltadas en el diagrama.` : chosen.ranges.length ? "Sin traslapes con las otras actividades mostradas." : "Sin horario suficiente para comprobar traslapes."}</p></div><button className="agenda-details" type="button" onClick={() => onOpen(chosen.item)}>Ver ficha completa ↗</button></> : <p>Selecciona una actividad para ubicar su sede y resaltar las que coinciden en horario.</p>}
      </div>
    </> : <p className="agenda-empty">No hay actividades para este día en la sede seleccionada.</p>}
  </>;
}
