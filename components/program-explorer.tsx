"use client";

import Image, { getImageProps } from "next/image";
import { useRouter } from "next/navigation";
import { ArrowUpRight, MapPin, UserRound, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { enrollInActivity } from "@/app/activity-registration-actions";
import type { ProgramItem, ProgramType } from "@/config/content";
import type {
  ActivityAvailability,
  ActivityAvailabilityMap,
} from "@/lib/activity-registration";
import { TeamEnrollmentForm } from "@/components/team-enrollment-form";

const filters: Array<"Todo" | ProgramType> = ["Todo", "Conferencia", "Taller", "Concurso", "Actividad"];

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

export function ProgramExplorer({
  items,
  activityAvailability,
  enrolledActivityIds,
  initialFilter,
}: {
  items: ProgramItem[];
  activityAvailability: ActivityAvailabilityMap;
  enrolledActivityIds: number[];
  initialFilter: (typeof filters)[number];
}) {
  const router = useRouter();
  const [active, setActive] = useState<(typeof filters)[number]>(initialFilter);
  const [selectedItem, setSelectedItem] = useState<ProgramItem | null>(null);
  const [loadedFlyerIds, setLoadedFlyerIds] = useState<Set<string>>(
    () => new Set(),
  );
  const flyerPreloads = useRef(new Map<string, HTMLImageElement>());
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
  const isSelectedEnrolled = selectedItem
    ? enrolledActivityIds.includes(selectedItem.id)
    : false;

  const markFlyerLoaded = (fileId: string) => {
    setLoadedFlyerIds((current) => {
      if (current.has(fileId)) return current;
      const next = new Set(current);
      next.add(fileId);
      return next;
    });
  };

  const preloadFlyer = (fileId?: string) => {
    if (!fileId || typeof window === "undefined" || flyerPreloads.current.has(fileId)) {
      return;
    }

    const src = `/api/flyers/${encodeURIComponent(fileId)}`;
    const { props } = getImageProps({
      src,
      alt: "",
      width: 520,
      height: 650,
      sizes: "(max-width: 720px) 92vw, 520px",
      quality: 70,
    });
    const preload = new window.Image();

    preload.decoding = "async";
    preload.fetchPriority = "high";
    if (props.srcSet) preload.srcset = props.srcSet;
    if (props.sizes) preload.sizes = props.sizes;
    preload.onload = () => markFlyerLoaded(fileId);
    preload.src = props.src;
    flyerPreloads.current.set(fileId, preload);
  };

  const openDetails = (item: ProgramItem) => {
    setEnrollmentFeedback(null);
    setSelectedItem(item);
  };

  const closeDetails = () => {
    if (isPending) return;
    setEnrollmentFeedback(null);
    setSelectedItem(null);
  };

  const submitEnrollment = () => {
    if (
      !selectedItem ||
      isSelectedEnrolled ||
      selectedAvailability?.status !== "open"
    ) return;

    startTransition(async () => {
      const result = await enrollInActivity(selectedItem.id);
      setEnrollmentFeedback(result);
      if (result.status === "success") router.refresh();
    });
  };

  useEffect(() => {
    if (!selectedItem) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPending) {
        setEnrollmentFeedback(null);
        setSelectedItem(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedItem, isPending]);

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
                onPointerEnter={() => preloadFlyer(item.flyerFileId)}
                onFocus={() => preloadFlyer(item.flyerFileId)}
                onTouchStart={() => preloadFlyer(item.flyerFileId)}
                onClick={() => openDetails(item)}
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
            if (event.target === event.currentTarget) closeDetails();
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
              onClick={closeDetails}
            >
              <X />
            </button>

            <div className="activity-modal-flyer">
              {selectedItem.flyerFileId ? (
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
                  />
                </>
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
