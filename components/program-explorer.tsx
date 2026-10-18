"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { preconnect } from "react-dom";
import { ArrowUpRight, FileText, LockKeyhole, MapPin, Send, UserRound, UsersRound, X } from "lucide-react";
import { useEffect, useImperativeHandle, useMemo, useState, useTransition, type Ref } from "react";
import { enrollInActivity } from "@/app/activity-registration-actions";
import type { ProgramItem, ProgramType } from "@/config/content";
import type {
  ActivityAvailability,
  ActivityAvailabilityMap,
} from "@/lib/activity-registration";
import { TeamEnrollmentForm } from "@/components/team-enrollment-form";
import { QuantitoLoader } from "@/components/quantito-loader";
import { isSubmissionBeforeDeadline } from "@/lib/activity-resources";
import type { SpeakerProfile } from "@/lib/speaker-profiles";

const filters: Array<"Todo" | ProgramType> = ["Todo", "Conferencia", "Taller", "Concurso", "Actividad"];

export type ProgramExplorerHandle = { openActivity: (item: ProgramItem) => void };

function getRegistrationLabel(availability?: ActivityAvailability) {
  if (!availability || availability.status === "unavailable") {
    return "Inscripciones no disponibles";
  }
  if (availability.status === "disabled") return "Inscripciones no disponibles";
  if (availability.status === "upcoming") return "Inscripciones próximamente";
  if (availability.status === "closed") return "Inscripciones cerradas";
  if (availability.status === "full") return "Cupo agotado";
  return "Inscribirme";
}

function SpeakerPhoto({ fileId, name }: { fileId?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`activity-speaker-photo${!fileId || failed ? " is-placeholder" : ""}`}>
      {fileId && !failed ? (
        <>
          {!loaded && <span className="activity-speaker-photo-loading" role="status">Cargando foto…</span>}
          <Image src={`https://lh3.googleusercontent.com/d/${encodeURIComponent(fileId)}=w320`} alt={`Fotografía de ${name}`}
            className={loaded ? "is-loaded" : "is-loading"}
            width={160} height={200} sizes="(max-width: 720px) 40vw, 160px"
            loading="eager" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
        </>
      ) : (
        <><UserRound aria-hidden="true" /><span>Sin foto</span></>
      )}
    </div>
  );
}

function SpeakerCard({ speaker, selected, onToggle }: { speaker: SpeakerProfile; selected: boolean; onToggle: () => void }) {
  return (
    <article className={`activity-speaker${selected ? " is-selected" : ""}`}>
      <SpeakerPhoto fileId={speaker.photoFileId} name={speaker.name} />
      <h5>{speaker.name}</h5>
      <button
        className="activity-speaker-toggle"
        type="button"
        aria-controls={selected ? "activity-speaker-biography" : undefined}
        aria-expanded={selected}
        aria-label={`${selected ? "Ocultar" : "Ver"} semblanza de ${speaker.name}`}
        onClick={onToggle}
      >
        {selected ? "Ocultar semblanza" : "Ver semblanza"}
      </button>
    </article>
  );
}

export function ProgramExplorer({
  ref,
  items,
  activityAvailability,
  enrolledActivityIds,
  captainedActivityIds,
  isAuthenticated,
  hasConfirmedRegistration,
  initialFilter,
}: {
  ref?: Ref<ProgramExplorerHandle>;
  items: ProgramItem[];
  activityAvailability: ActivityAvailabilityMap;
  enrolledActivityIds: number[];
  captainedActivityIds: number[];
  isAuthenticated: boolean;
  hasConfirmedRegistration: boolean;
  initialFilter: (typeof filters)[number];
}) {
  if (items.some((item) => item.speakers?.some((speaker) => speaker.photoFileId))) {
    preconnect("https://lh3.googleusercontent.com");
  }
  const router = useRouter();
  const [active, setActive] = useState<(typeof filters)[number]>(initialFilter);
  const [selectedItem, setSelectedItem] = useState<ProgramItem | null>(null);
  const [selectedSpeakerIndex, setSelectedSpeakerIndex] = useState<number | null>(null);
  const [loadedFlyerIds, setLoadedFlyerIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [failedFlyerIds, setFailedFlyerIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [enrollmentFeedback, setEnrollmentFeedback] = useState<{
    status: "success" | "error";
    code: string;
    message: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const visible = useMemo(() => active === "Todo" ? items : items.filter((item) => item.type === active), [active, items]);
  const selectedAvailability = selectedItem
    ? activityAvailability[selectedItem.id]
    : undefined;
  const selectedDescription = selectedItem?.fullDescription || selectedItem?.description || "";
  const selectedSpeakers = selectedItem?.speakers ?? [];
  const selectedSpeaker = selectedSpeakerIndex === null ? null : selectedSpeakers[selectedSpeakerIndex] ?? null;
  const descriptionIsBiography = selectedSpeakers.some((speaker) =>
    speaker.biography === selectedDescription) ?? false;
  const isSelectedEnrolled = selectedItem
    ? enrolledActivityIds.includes(selectedItem.id)
    : false;
  const isSelectedCaptain = selectedItem
    ? captainedActivityIds.includes(selectedItem.id)
    : false;

  const markFlyerLoaded = (fileId: string) => {
    setLoadedFlyerIds((current) => {
      if (current.has(fileId)) return current;
      const next = new Set(current);
      next.add(fileId);
      return next;
    });
  };

  const openDetails = (item: ProgramItem) => {
    setEnrollmentFeedback(null);
    setSelectedSpeakerIndex(null);
    setSelectedItem(item);
  };

  const closeDetails = () => {
    if (isPending) return;
    setEnrollmentFeedback(null);
    setSelectedSpeakerIndex(null);
    setSelectedItem(null);
  };

  useImperativeHandle(ref, () => ({
    openActivity(item) {
      setActive("Todo");
      openDetails(item);
    },
  }));

  const submitEnrollment = () => {
    if (
      !selectedItem ||
      isSelectedEnrolled ||
      selectedAvailability?.status !== "open"
    ) return;

    startTransition(async () => {
      try {
        const result = await enrollInActivity(selectedItem.id);
        setEnrollmentFeedback(result);
        if (result.status === "success") router.refresh();
      } catch (error) {
        console.error("No fue posible enviar la inscripcion:", error);
        setEnrollmentFeedback({
          status: "error",
          code: "unavailable",
          message:
            "La conexión tardó demasiado. Revisa Mi cuenta antes de volver a intentarlo.",
        });
      }
    });
  };

  useEffect(() => {
    if (!selectedItem) return;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = document.querySelector<HTMLElement>(".activity-modal");
    dialog?.querySelector<HTMLButtonElement>(".activity-modal-close")?.focus({ preventScroll: true });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPending) {
        setEnrollmentFeedback(null);
        setSelectedSpeakerIndex(null);
        setSelectedItem(null);
      }
      if (event.key === "Tab" && dialog) {
        const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [selectedItem, isPending]);

  useEffect(() => {
    if (!selectedSpeaker) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById("activity-speaker-biography")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedSpeaker]);

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
              {item.type === "Conferencia" && Boolean(item.speakers?.length) && (
                <p className="program-speaker-preview">
                  <strong>{item.speakers?.length === 1 ? "Semblanza disponible:" : "Semblanzas disponibles:"}</strong>{" "}
                  {item.speakers?.map((speaker) => speaker.name).join(", ")}
                </p>
              )}
              <button
                className="program-details-button"
                type="button"
                onClick={() => openDetails(item)}
              >
                {item.type === "Conferencia" && item.speakers?.length ? "Ver semblanzas" : "Más información"} <ArrowUpRight />
              </button>
            </div>
            <span className={`status-pill status-${(item.status ?? "Programado").toLowerCase()}`}>
              {item.status === "Provisional" ? "Programado" : (item.status ?? "Programado")}
            </span>
          </article>
        ))}
      </div>

      {selectedItem && (
        <div
          className="activity-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDetails();
          }}
        >
          <section
            className="activity-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="activity-modal-title"
          >
            <div className="activity-modal-toolbar">
              <button
                className="activity-modal-close"
                type="button"
                aria-label="Cerrar información"
                onClick={closeDetails}
              >
                <X />
              </button>
            </div>

            <div className="activity-modal-flyer">
              {selectedItem.flyerFileId && !failedFlyerIds.has(selectedItem.flyerFileId) ? (
                <>
                  {!loadedFlyerIds.has(selectedItem.flyerFileId) && (
                    <div className="activity-modal-image-loading" role="status">
                      <span aria-hidden="true" />
                      Cargando flyer…
                    </div>
                  )}
                  <Image
                    className={
                      loadedFlyerIds.has(selectedItem.flyerFileId)
                        ? "is-loaded"
                        : "is-loading"
                    }
                    src={`/api/flyers/${encodeURIComponent(selectedItem.flyerFileId)}`}
                    alt={`Flyer de ${selectedItem.title}`}
                    fill
                    sizes="(max-width: 720px) 92vw, 520px"
                    quality={70}
                    loading="eager"
                    fetchPriority="high"
                    onLoad={() => markFlyerLoaded(selectedItem.flyerFileId!)}
                    onError={() => setFailedFlyerIds((current) => new Set(current).add(selectedItem.flyerFileId!))}
                  />
                </>
              ) : (
                <div className="activity-modal-placeholder">
                  <span>{selectedItem.type}</span>
                  <strong>{selectedItem.flyerFileId ? "Flyer no disponible" : "Información de la actividad"}</strong>
                </div>
              )}
            </div>

            <div className="activity-modal-content">
              <span className={`type-pill type-${selectedItem.type.toLowerCase()}`}>
                {selectedItem.type}
              </span>
              <h3
                id="activity-modal-title"
                className={
                  selectedItem.title.length > 42
                    ? "activity-modal-title is-very-long"
                    : selectedItem.title.length > 26
                      ? "activity-modal-title is-long"
                      : "activity-modal-title"
                }
              >
                {selectedItem.title}
              </h3>
              {!descriptionIsBiography && <p>{selectedDescription}</p>}
              <div className="activity-modal-meta">
                <span>{selectedItem.date || selectedItem.day} · {selectedItem.time}</span>
                {!selectedSpeakers.length && <span><UserRound /> {selectedItem.person}</span>}
                <span><MapPin /> {selectedItem.place}</span>
                {(selectedItem.type === "Taller" ||
                  selectedItem.type === "Concurso") && (
                  <span>
                    <UsersRound />{
                      selectedAvailability?.capacity
                        ? `${selectedAvailability.remainingCapacity} ${selectedAvailability.capacityUnit === "equipos" ? "equipos" : "lugares"} disponibles de ${selectedAvailability.capacity}`
                        : `Capacidad: ${selectedItem.registrationCapacity ?? "por confirmar"}`
                    }
                  </span>
                )}
              </div>
              {selectedItem.type === "Conferencia" && selectedSpeakers.length > 0 && (
                <section className="activity-speakers" aria-label="Ponentes de la conferencia">
                  <h4>{selectedSpeakers.length === 1 ? "Ponente" : `Ponentes (${selectedSpeakers.length})`}</h4>
                  <div className="activity-speaker-list">
                    {selectedSpeakers.map((speaker, index) => (
                      <SpeakerCard
                        key={`${speaker.activityId}:${speaker.order}:${speaker.name}`}
                        speaker={speaker}
                        selected={selectedSpeakerIndex === index}
                        onToggle={() => setSelectedSpeakerIndex((current) => current === index ? null : index)}
                      />
                    ))}
                  </div>
                  {selectedSpeaker && (
                    <div className="activity-speaker-biography" id="activity-speaker-biography">
                      <h5>Semblanza de {selectedSpeaker.name}</h5>
                      <p>{selectedSpeaker.biography}</p>
                    </div>
                  )}
                </section>
              )}
              {(selectedItem.hasCallForEntries || selectedItem.hasSubmissionLink) && (
                <section className="activity-resources" aria-label="Convocatoria y entrega">
                  <h4>Recursos</h4>
                  {selectedItem.hasCallForEntries && (
                    hasConfirmedRegistration ? (
                      <a
                        className="activity-resource-link"
                        href={`/actividades/${selectedItem.id}/convocatoria`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <FileText /> Ver convocatoria completa <ArrowUpRight />
                      </a>
                    ) : (
                      <a className="activity-resource-link is-locked" href="/mi-cuenta">
                        <LockKeyhole />
                        {isAuthenticated ? "Completa tu registro para verla" : "Inicia sesión para verla"}
                      </a>
                    )
                  )}
                  {selectedItem.hasSubmissionLink && (
                    <>
                      {hasConfirmedRegistration &&
                      isSelectedEnrolled &&
                      isSelectedCaptain &&
                      selectedItem.submissionEnabled &&
                      isSubmissionBeforeDeadline(selectedItem.submissionDeadline) ? (
                        <a
                          className="activity-resource-link activity-submission-link"
                          href={`/actividades/${selectedItem.id}/entrega`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Send /> {selectedItem.submissionLabel || "Enviar participación"} <ArrowUpRight />
                        </a>
                      ) : (
                        <div className="activity-resource-notice">
                          <LockKeyhole />
                          <span>
                            {!hasConfirmedRegistration
                              ? isAuthenticated
                                ? "Completa tu registro para habilitar la entrega."
                                : "Inicia sesión y regístrate para habilitar la entrega."
                              : !isSelectedEnrolled
                                ? "Inscríbete a esta actividad para habilitar la entrega."
                                : !isSelectedCaptain
                                  ? "La entrega debe hacerla quien registró al equipo."
                                  : !selectedItem.submissionEnabled
                                    ? "La recepción de trabajos no está habilitada."
                                    : "La fecha límite de entrega ya terminó."}
                          </span>
                        </div>
                      )}
                      {selectedItem.submissionDeadline && (
                        <small className="activity-resource-deadline">
                          Fecha límite: {selectedItem.submissionDeadline}
                        </small>
                      )}
                    </>
                  )}
                </section>
              )}
              {(selectedItem.type === "Taller" ||
                selectedItem.type === "Concurso") && (
                <>
                  {selectedItem.type === "Concurso" &&
                  ((selectedAvailability?.minMembers ?? 1) > 1 ||
                    (selectedAvailability?.maxMembers ?? 1) > 1) &&
                  !isSelectedEnrolled &&
                  selectedAvailability?.status === "open" ? (
                    <TeamEnrollmentForm
                      activityId={selectedItem.id}
                      minMembers={selectedAvailability.minMembers ?? 1}
                      maxMembers={selectedAvailability.maxMembers ?? 1}
                    />
                  ) : (
                    <>
                      <button
                        className="activity-registration-button"
                        type="button"
                        disabled={
                          isPending ||
                          isSelectedEnrolled ||
                          selectedAvailability?.status !== "open" ||
                          enrollmentFeedback?.status === "success"
                        }
                        onClick={submitEnrollment}
                      >
                        {isPending
                          ? "Confirmando inscripción..."
                          : enrollmentFeedback?.status === "success"
                            ? "Inscripción confirmada"
                            : isSelectedEnrolled
                              ? "Ya estás inscrito"
                              : getRegistrationLabel(selectedAvailability)}
                      </button>
                      {isPending ? (
                        <QuantitoLoader
                          variant="inline"
                          message="Confirmando tu lugar…"
                          detail="No cierres esta ventana."
                        />
                      ) : null}
                    </>
                  )}
                  {enrollmentFeedback && (
                    <div
                      className={`activity-enrollment-feedback activity-enrollment-${enrollmentFeedback.status}`}
                      role="status"
                    >
                      <p>{enrollmentFeedback.message}</p>
                      {(enrollmentFeedback.code === "auth_required" ||
                        enrollmentFeedback.code === "registration_required") && (
                        <a href="/mi-cuenta">Ir a Mi cuenta</a>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
