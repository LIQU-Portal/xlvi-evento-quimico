"use client";

import { MapPin, UserRound, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import type { ProgramItem, ProgramType } from "@/config/content";

const filters: Array<"Todo" | ProgramType> = ["Todo", "Conferencia", "Taller", "Concurso", "Actividad"];

export function ProgramExplorer({ items }: { items: ProgramItem[] }) {
  const [active, setActive] = useState<(typeof filters)[number]>("Todo");
  const visible = useMemo(() => active === "Todo" ? items : items.filter((item) => item.type === active), [active, items]);

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
            <div className="program-time"><strong>{item.time}</strong><span>{item.day}</span><small>Fecha por confirmar</small></div>
            <div className="program-main">
              <span className={`type-pill type-${item.type.toLowerCase()}`}>{item.type}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <div className="program-meta">
                <span><UserRound /> {item.person}</span>
                <span><MapPin /> {item.place}</span>
                {item.capacity && <span><UsersRound /> {item.capacity}</span>}
              </div>
            </div>
            <span className="status-pill">Provisional</span>
          </article>
        ))}
      </div>
    </div>
  );
}
