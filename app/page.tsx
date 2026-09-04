import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Activities } from "@/components/activities";
import { ProgramExplorer } from "@/components/program-explorer";
import { Beaker, CalendarDays, ChevronRight, FlaskConical, MapPin, Network, Sparkles } from "lucide-react";
import { content } from "@/config/content";

export default function Home() {
  return (
    <main id="inicio">
      <SiteHeader />

      <section className="hero section-dark" aria-labelledby="hero-title">
        <div className="molecular-grid" aria-hidden="true" />
        <div className="orb orb-one" aria-hidden="true" />
        <div className="orb orb-two" aria-hidden="true" />
        <div className="container hero-layout">
          <div className="hero-copy reveal">
            <p className="eyebrow"><span /> Evento científico · cultural · 2026</p>
            <div className="edition">XLVI</div>
            <h1 id="hero-title">Evento del<br />Químico</h1>
            <p className="hero-tagline">Ciencia que conecta saberes</p>
            <p className="hero-intro">{content.hero.description}</p>
            <div className="hero-actions">
              <a className="button button-primary" href="#programa">Explorar programa <ChevronRight size={18} /></a>
              <a className="button button-ghost" href="#modelo">Conoce el nuevo modelo</a>
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
        <div>CIENCIA <b>✦</b> COMPETENCIAS <b>✦</b> COMUNIDAD <b>✦</b> INNOVACIÓN <b>✦</b> CIENCIA <b>✦</b> COMPETENCIAS</div>
      </div>

      <section className="section model-section" id="modelo" aria-labelledby="model-title">
        <div className="container">
          <div className="section-heading split-heading">
            <div>
              <p className="section-index">02 — Una nueva forma de aprender</p>
              <h2 id="model-title">Conocimiento que<br /><em>se pone en práctica.</em></h2>
            </div>
            <div>
              <p className="lead">{content.model.intro}</p>
              <span className="provisional-note">Una nueva forma de aprender</span>
            </div>
          </div>
          <div className="competency-grid">
            {content.model.competencies.map((item, index) => (
              <article className="competency-card" key={item.title}>
                <span className="card-number">0{index + 1}</span>
                <div className="competency-icon">{index === 0 ? <Beaker /> : index === 1 ? <FlaskConical /> : index === 2 ? <Network /> : <Sparkles />}</div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <small>Competencia en acción</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section program-section" id="programa" aria-labelledby="program-title">
        <div className="container">
          <div className="section-heading program-heading">
            <div>
              <p className="section-index light">03 — Agenda preliminar</p>
              <h2 id="program-title">El programa,<br /><em>de un vistazo.</em></h2>
            </div>
            <p>Horarios, sedes y participantes están sujetos a confirmación. Usa los filtros para explorar la propuesta de agenda.</p>
          </div>
          <ProgramExplorer items={content.program} />
        </div>
      </section>

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
