import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Activities } from "@/components/activities";
import { getProgramFromSheets } from "@/lib/sheets";
import { EventProgram } from "@/components/event-program";
import { initialAgendaDay } from "@/lib/program-agenda";
import { getParticipantSummary } from "@/lib/event-summary";
import { CalendarDays, ChevronRight, MapPin } from "lucide-react";
import { content } from "@/config/content";
import { auth } from "@/auth";
import {
  getParticipantEnrollmentActivityIds,
  syncProgramActivities,
} from "@/lib/activity-registration";

export const dynamic = "force-dynamic";
export const revalidate = 60;

type HomeProps = {
  searchParams: Promise<{ tipo?: string | string[] }>;
};

const programFilters = {
  conferencia: "Conferencia",
  taller: "Taller",
  concurso: "Concurso",
  actividad: "Actividad",
} as const;

export default async function Home({ searchParams }: HomeProps) {
  const requestedType = (await searchParams).tipo;
  const normalizedType = typeof requestedType === "string" ? requestedType.toLowerCase() : "";
  const initialFilter = programFilters[normalizedType as keyof typeof programFilters] ?? "Todo";
  const [program, session, participantSummary] = await Promise.all([
    getProgramFromSheets(),
    auth(),
    getParticipantSummary(),
  ]);
  const [activityAvailability, enrolledActivityIds] = await Promise.all([
    syncProgramActivities(program),
    getParticipantEnrollmentActivityIds(session?.user?.email),
  ]);
  return (
    <main id="inicio">
      <SiteHeader user={session?.user ?? null} />

      <section className="hero section-dark" aria-labelledby="hero-title">
        <div className="molecular-grid" aria-hidden="true" />
        <div className="orb orb-one" aria-hidden="true" />
        <div className="orb orb-two" aria-hidden="true" />
        <div className="container hero-layout">
          <div className="hero-copy reveal">
            <p className="eyebrow"><span /> Evento científico · cultural · 2026</p>
            <div className="edition">XLVI</div>
            <h1 id="hero-title">Evento del<br />Químico</h1>
            <p className="hero-tagline">
              Química que evoluciona, futuro que se construye
            </p>
            <p className="hero-intro">{content.hero.description}</p>
            <div className="hero-actions">
              <a className="button button-primary" href="#programa">Explorar programa <ChevronRight size={18} /></a>
              <a className="button button-ghost" href="#evento">
                Conoce el evento
              </a>
            </div>
          </div>

          <div className="hero-card-wrap" aria-label="Datos del evento">
            <div className="chemistry-mark" aria-hidden="true">
              <span className="node node-a" /><span className="node node-b" /><span className="node node-c" />
              <span className="bond bond-a" /><span className="bond bond-b" />
            </div>
            <article className="glass-card">
              <div className="card-icon"><CalendarDays /></div>
              <span>Reserva la fecha</span>
              <strong>{content.event.date}</strong>
              <div className="hairline" />
              <p><MapPin size={16} /> {content.event.venue}</p>
              <small>Prepárate para conectar con la ciencia</small>
            </article>
          </div>
        </div>
        <div className="hero-foot container">
          <span>01 — Encuentro</span>
          <span>Aprender · aplicar · conectar</span>
        </div>
      </section>

      <div className="ticker" aria-label="Ejes del evento">
        <div>
            QUÍMICA <b>✦</b> FORMACIÓN <b>✦</b> PROFESIÓN <b>✦</b>
            INNOVACIÓN <b>✦</b> COMUNIDAD <b>✦</b> FUTURO
        </div>  
      </div>

      <EventProgram
        key={initialFilter}
        items={program}
        activityAvailability={activityAvailability}
        enrolledActivityIds={enrolledActivityIds}
        initialFilter={initialFilter}
        initialDay={initialAgendaDay()}
        participantSummary={participantSummary}
      />

      <Activities />

      <section className="section partners-section" id="aliados" aria-labelledby="partners-title">
        <div className="container">
          <p className="section-index">05 — Hacemos comunidad</p>
          <div className="partners-title-row">
            <h2 id="partners-title">Instituciones<br />y aliados.</h2>
            <p>Este espacio está listo para incorporar las identidades aprobadas de patrocinadores y colaboradores.</p>
          </div>
          <div className="partner-grid">
            {content.partners.map((partner) => (
              <article key={`${partner.role}-${partner.name}`} className="partner-card">
                <span>{partner.role}</span>
                <div className="partner-placeholder">{partner.initials}</div>
                <strong>{partner.name}</strong>
                {partner.provisional && <small>Por confirmar</small>}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section info-section" id="informacion" aria-labelledby="info-title">
        <div className="container info-grid">
          <div>
            <p className="section-index light">06 — Información general</p>
            <h2 id="info-title">Nos vemos<br /><em>en CUCEI.</em></h2>
            <p className="info-copy">Datos provisionales para orientar a la comunidad. Confirma la información antes de difundir.</p>
          </div>
          <dl className="info-list">
            {content.info.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{"href" in item ? <a href={item.href}>{item.value} <span>↗</span></a> : item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
