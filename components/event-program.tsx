"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { content, type ProgramItem, type ProgramType } from "@/config/content";
import type { ParticipantSummary } from "@/lib/event-summary";
import { EventPulse } from "@/components/event-pulse";
import { ProgramTimeline } from "@/components/program-timeline";
import type { ActivityAvailabilityMap } from "@/lib/activity-registration";
import { buildAgenda, eventDays, normalizeVenue } from "@/lib/program-agenda";
import { ProgramExplorer, type ProgramExplorerHandle } from "@/components/program-explorer";
import eventLogo from "@/public/branding/logo-evento-2026.png";

export function EventProgram({ items, activityAvailability, enrolledActivityIds, initialFilter, initialDay, participantSummary }: {
  items: ProgramItem[];
  activityAvailability: ActivityAvailabilityMap;
  enrolledActivityIds: number[];
  initialFilter: "Todo" | ProgramType;
  initialDay: string;
  participantSummary: ParticipantSummary;
}) {
  const explorer = useRef<ProgramExplorerHandle>(null);
  const [day, setDay] = useState(initialDay);
  const [venue, setVenue] = useState("");
  const occurrences = useMemo(() => buildAgenda(items), [items]);
  const venues = useMemo(() => {
    const unique = new Map<string, string>();
    for (const item of items) {
      const key = normalizeVenue(item.place);
      if (!unique.has(key)) unique.set(key, item.place.trim().replace(/\s+/g, " "));
    }
    return [...unique].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [items]);
  const visible = occurrences.filter((entry) =>
    (day === "pending" ? entry.date === null : entry.date === day) && (!venue || normalizeVenue(entry.item.place) === venue),
  );
  const pending = occurrences.filter((entry) => entry.date === null).length;
  const selectedDay = eventDays.find((entry) => entry.date === day);
  const openActivity = (item: ProgramItem) => {
    document.getElementById("programa")?.scrollIntoView({ behavior: "instant" });
    explorer.current?.openActivity(item);
  };

  return <>
    <section className="section model-section" id="evento" aria-labelledby="model-title">
      <div className="container">
        <div className="section-heading agenda-heading">
          <div className="agenda-heading-copy">
            <p className="section-index">02 — Un encuentro para pensar la química</p>
            <h2 id="model-title">Conocimiento que<br /><em>se pone en práctica.</em></h2>
          </div>
          <div className="agenda-logo"><Image src={eventLogo} alt="XLVI Evento del Químico 2026. Química que evoluciona, futuro que se construye." sizes="(max-width: 720px) 85vw, 420px" /></div>
        </div>
        <p className="event-introduction">{content.model.intro}</p>
        <EventPulse items={items} occurrences={occurrences} participantSummary={participantSummary} onOpen={openActivity} />
        <div className="week-agenda">
          <div className="agenda-toolbar">
            <div><p className="agenda-kicker">20 — 23 octubre 2026</p><h3>Programa por día</h3></div>
            <label className="agenda-venue">Filtrar por sede<select value={venue} onChange={(event) => setVenue(event.target.value)}>
              <option value="">Todas las sedes</option>
              {venues.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select></label>
          </div>
          <div className="agenda-days" role="group" aria-label="Elegir día de la agenda">
            {eventDays.map((entry) => <button key={entry.date} type="button" aria-pressed={day === entry.date} aria-controls="agenda-results" onClick={() => setDay(entry.date)}>
              <span>{entry.label}{" "}<strong>{entry.day}</strong></span><small>{occurrences.filter((occurrence) => occurrence.date === entry.date).length} actividades</small>
            </button>)}
            {pending > 0 && <button type="button" aria-pressed={day === "pending"} aria-controls="agenda-results" onClick={() => setDay("pending")}><span>Fecha por confirmar</span><small>{pending} actividades</small></button>}
          </div>
          <div id="agenda-results" aria-live="polite" aria-atomic="false">
            <p className="agenda-result-count">{selectedDay ? `${selectedDay.label} ${selectedDay.day} de octubre` : "Fecha por confirmar"} · {visible.length} {visible.length === 1 ? "actividad" : "actividades"}{venue ? " en esta sede" : ""}</p>
            <ProgramTimeline key={`${day}-${venue}`} occurrences={visible} onOpen={openActivity} />
          </div>
          <p className="agenda-footnote">Horarios y sedes sujetos a cambios. Las actividades de varios días aparecen en cada fecha; el total las cuenta una sola vez. Las fechas por confirmar se indican con borde discontinuo.</p>
        </div>
      </div>
    </section>
    <section className="section program-section" id="programa" aria-labelledby="program-title">
      <div className="container">
        <div className="section-heading program-heading">
          <div><p className="section-index light">03 — Agenda preliminar</p><h2 id="program-title">El programa,<br /><em>de un vistazo.</em></h2></div>
          <p>Horarios, sedes y participantes están sujetos a confirmación. Usa los filtros para explorar la propuesta de agenda.</p>
        </div>
        <ProgramExplorer ref={explorer} items={items} activityAvailability={activityAvailability} enrolledActivityIds={enrolledActivityIds} initialFilter={initialFilter} />
      </div>
    </section>
  </>;
}
