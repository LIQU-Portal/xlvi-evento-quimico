"use client";

import Image from "next/image";
import { ArrowUpRight, MapPin, UserRound, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ProgramItem, ProgramType } from "@/config/content";

const filters: Array<"Todo" | ProgramType> = ["Todo", "Conferencia", "Taller", "Concurso", "Actividad"];

export function ProgramExplorer({ items }: { items: ProgramItem[] }) {
  const [active, setActive] = useState<(typeof filters)[number]>("Todo");
  const [selectedItem, setSelectedItem] = useState<ProgramItem | null>(null);
  const visible = useMemo(() => active === "Todo" ? items : items.filter((item) => item.type === active), [active, items]);

  useEffect(() => {
    if (!selectedItem) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedItem(null);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedItem]);

  return (
    <div>
      <div className="filter-row" role="group" aria-label="Filtrar actividades">
        {filters.map((filter) => (
          <button key={filter} type="button" aria-pressed={active === filter} onClick={() => setActive(filter)}>{filter}</button>
        ))}
      </div>
      <div className="program-list" aria-live="polite">
        {visible.map((item) => (
          <article className="program-item" key={item.id}>
            <div className="program-time"><strong>{item.time}</strong><span>{item.day}</span><small>{item.date || "Fecha por confirmar"}</small></div>
            <div className="program-main">
              <span className={`type-pill type-${item.type.toLowerCase()}`}>{item.type}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <div className="program-meta">
                <span><UserRound /> {item.person}</span>
                <span><MapPin /> {item.place}</span>
                {item.capacity && <span><UsersRound /> {item.capacity}</span>}
              </div>
              <button
                className="program-details-button"
                type="button"
                onClick={() => setSelectedItem(item)}
              >
                Más información <ArrowUpRight />
              </button>
            </div>
            <span  className={`status-pill status-${(item.status ?? "Provisional").toLowerCase()}`}>
              {item.status ?? "Provisional"}
            </span>
          </article>
        ))}
      </div>

      {selectedItem && (
        <div
          className="activity-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedItem(null);
          }}
        >
          <section
            className="activity-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="activity-modal-title"
          >
            <button
              className="activity-modal-close"
              type="button"
              aria-label="Cerrar información"
              onClick={() => setSelectedItem(null)}
            >
              <X />
            </button>

            <div className="activity-modal-flyer">
              {selectedItem.flyerFileId ? (
                <Image
                  src={`/api/flyers/${encodeURIComponent(selectedItem.flyerFileId)}`}
                  alt={`Flyer de ${selectedItem.title}`}
                  fill
                  sizes="(max-width: 720px) 92vw, 520px"
                />
              ) : (
                <div className="activity-modal-placeholder">
                  <span>{selectedItem.type}</span>
                  <strong>Flyer próximamente</strong>
                </div>
              )}
            </div>

            <div className="activity-modal-content">
              <span className={`type-pill type-${selectedItem.type.toLowerCase()}`}>
                {selectedItem.type}
              </span>
              <h3 id="activity-modal-title">{selectedItem.title}</h3>
              <p>{selectedItem.fullDescription || selectedItem.description}</p>
              <div className="activity-modal-meta">
                <span><UserRound /> {selectedItem.person}</span>
                <span><MapPin /> {selectedItem.place}</span>
                {(selectedItem.type === "Taller" ||
                  selectedItem.type === "Concurso") &&
                  selectedItem.registrationCapacity && (
                  <span><UsersRound /> Capacidad: {selectedItem.registrationCapacity}</span>
                )}
              </div>
              {(selectedItem.type === "Taller" ||
                selectedItem.type === "Concurso") && (
                <button className="activity-registration-button" type="button" disabled>
                  {selectedItem.registrationEnabled
                    ? "Inscripción en preparación"
                    : "Inscripciones no disponibles"}
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
