import { ArrowUpRight, FlaskConical, Lightbulb, Mic2 } from "lucide-react";
import { content } from "@/config/content";

const icons = [<Mic2 key="mic" />, <FlaskConical key="flask" />, <Lightbulb key="bulb" />];

export function Activities() {
  return (
    <section className="section activities-section" aria-labelledby="activities-title">
      <div className="container">
        <p className="section-index">04 — Formas de participar</p>
        <h2 id="activities-title" className="sr-only">Actividades del evento</h2>
        <div className="activities-grid">
          {content.activities.map((item, index) => (
            <article className="activity-card" id={item.anchor} key={item.title}>
              <div className="activity-top"><span>0{index + 1}</span><div>{icons[index]}</div></div>
              <p>{item.kicker}</p>
              <h3>{item.title}</h3>
              <div className="activity-description">{item.description}</div>
              <a href="#programa">Ver en el programa <ArrowUpRight /></a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
