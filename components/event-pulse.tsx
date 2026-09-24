"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProgramItem, ProgramType } from "@/config/content";
import type { ParticipantSummary } from "@/lib/event-summary";
import { eventDays, formatMinutes, getLiveAgenda, type AgendaOccurrence } from "@/lib/program-agenda";

export const programCategories: { type: ProgramType; label: string }[] = [
  { type: "Conferencia", label: "Conferencias" },
  { type: "Taller", label: "Talleres" },
  { type: "Concurso", label: "Concursos" },
  { type: "Actividad", label: "Otras actividades" },
];

export function EventPulse({ items, occurrences, participantSummary, onOpen }: {
  items: ProgramItem[];
  occurrences: AgendaOccurrence[];
  participantSummary: ParticipantSummary;
  onOpen: (item: ProgramItem) => void;
}) {
  const [summary, setSummary] = useState(participantSummary);
  const [now, setNow] = useState(() => new Date(participantSummary.checkedAt));
  const [stale, setStale] = useState(false);
  const uniqueItems = useMemo(() => [...new Map(items.map((item) => [item.id, item])).values()], [items]);
  const live = getLiveAgenda(occurrences, now);
  const nextDay = eventDays.find((day) => day.date === live.upcoming?.date);

  useEffect(() => {
    const controller = new AbortController();
    let fetching = false;
    const refresh = async () => {
      if (document.hidden || fetching) return;
      fetching = true;
      try {
        const response = await fetch("/api/event-summary", {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]), cache: "no-store",
        });
        if (!response.ok) throw new Error("Summary unavailable");
        const result: ParticipantSummary = await response.json();
        if (controller.signal.aborted) return;
        if (result.count === null) { setStale(true); return; }
        setSummary(result);
        setStale(false);
      } catch {
        if (!controller.signal.aborted) setStale(true);
      } finally { fetching = false; }
    };
    const clock = window.setInterval(() => setNow(new Date()), 30000);
    const polling = window.setInterval(refresh, 60000);
    const onVisible = () => { if (!document.hidden) { setNow(new Date()); void refresh(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => { controller.abort(); window.clearInterval(clock); window.clearInterval(polling); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  return <div className="event-overview">
    <div className="event-numbers" aria-label="El encuentro en cifras">
      <div className="event-total"><strong>{uniqueItems.length}</strong><span>actividades<br />en un encuentro</span></div>
      {programCategories.map(({ type, label }) => <div className={`event-number schedule-color-${type.toLowerCase()}`} key={type}>
        <strong>{uniqueItems.filter((item) => item.type === type).length}</strong><span><i aria-hidden="true" />{label}</span>
      </div>)}
      <div className="event-registered" aria-live="polite"><span className="event-registered-label">La comunidad crece</span><strong>{summary.count === null ? "—" : summary.count.toLocaleString("es-MX")}</strong><span>Registrados</span><small>{summary.count === null ? "Conteo no disponible" : `${stale ? "Último dato" : "Actualizado"} ${new Date(summary.checkedAt).toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hour12: false })} · GDL`}</small></div>
    </div>
    <div className={`event-live ${live.current.length ? "is-live" : ""}`}>
      <div className="event-live-label"><span><i aria-hidden="true" />En este momento</span><small>{formatMinutes(live.local.minutes)} · Hora de Guadalajara</small></div>
      <div className="event-live-content" aria-live="polite">
        {live.current.length ? <><p>{live.current.length === 1 ? "En curso, según el programa" : `${live.current.length} actividades simultáneas, según el programa`}</p><div className="event-live-activities">{live.current.map((entry) => <button key={`${entry.item.id}-${entry.start}`} type="button" onClick={() => onOpen(entry.item)}><span className={`live-type-dot schedule-color-${entry.item.type.toLowerCase()}`} /><strong>{entry.item.title}</strong><small>{formatMinutes(entry.start)}–{formatMinutes(entry.end)} · {entry.item.place}</small></button>)}</div></> : live.upcoming ? <><p>{live.local.date < eventDays[0].date ? "Nos vemos pronto. El programa comienza con:" : "Sin actividades en curso. Lo siguiente:"}</p><button className="event-next" type="button" onClick={() => onOpen(live.upcoming!.item)}><strong>{live.upcoming.item.title} ↗</strong><span>{nextDay?.label}{" "}{nextDay?.day} de octubre · {formatMinutes(live.upcoming.start)} · {live.upcoming.item.place}</span></button></> : <p>{live.local.date > eventDays[eventDays.length - 1].date ? "El programa de esta edición ha finalizado. Gracias por ser parte." : "No hay actividades con horario confirmado en curso. Consulta el diagrama del día."}</p>}
      </div>
    </div>
  </div>;
}
