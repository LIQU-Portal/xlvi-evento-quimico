"use client";

import { BadgeCheck, CalendarCheck, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { cancelActivityEnrollment } from "@/app/activity-registration-actions";
import type { ParticipantActivityEnrollment } from "@/lib/activity-registration";

function getCancellationCopy(enrollment: ParticipantActivityEnrollment) {
  if (!enrollment.teamName) {
    return {
      prompt: "¿Liberar tu lugar?",
      confirm: "Confirmar cancelación",
      action: "Cancelar",
    };
  }

  if (enrollment.isTeamCaptain) {
    return {
      prompt: "¿Cancelar el equipo completo?",
      confirm: "Cancelar equipo",
      action: "Cancelar equipo",
    };
  }

  return {
    prompt: "¿Salir del equipo? Si deja de cumplir el mínimo, se cancelará completo.",
    confirm: "Confirmar salida",
    action: "Salir del equipo",
  };
}

export function AccountActivityEnrollments({
  enrollments,
}: {
  enrollments: ParticipantActivityEnrollment[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingActivityId, setPendingActivityId] = useState<number | null>(null);
  const [confirmingActivityId, setConfirmingActivityId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{
    status: "success" | "error";
    message: string;
  } | null>(null);

  const cancelEnrollment = (enrollment: ParticipantActivityEnrollment) => {
    setPendingActivityId(enrollment.activityId);
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await cancelActivityEnrollment(enrollment.activityId);
        setFeedback({ status: result.status, message: result.message });
        if (result.status === "success") {
          setConfirmingActivityId(null);
          router.refresh();
        }
      } catch (error) {
        console.error("No fue posible enviar la cancelacion:", error);
        setFeedback({
          status: "error",
          message:
            "La conexión tardó demasiado. Recarga Mi cuenta para comprobar el estado antes de reintentar.",
        });
      } finally {
        setPendingActivityId(null);
      }
    });
  };

  return (
    <section className="account-activities" aria-labelledby="account-activities-title">
      <div className="account-activities-heading">
        <div className="profile-icon"><CalendarCheck /></div>
        <div>
          <span>Actividades con cupo</span>
          <h2 id="account-activities-title">Mis talleres y concursos</h2>
          <p>Consulta o cancela tus inscripciones confirmadas.</p>
        </div>
      </div>

      {feedback && (
        <div
          className={feedback.status === "success" ? "registration-notice" : "registration-error"}
          role="status"
        >
          {feedback.message}
        </div>
      )}

      {enrollments.length ? (
        <div className="account-activity-list">
          {enrollments.map((enrollment) => {
            const copy = getCancellationCopy(enrollment);

            return (
              <article key={enrollment.activityId} className="account-activity-item">
                <div>
                  <span>{enrollment.type}</span>
                  <h3>{enrollment.title}</h3>
                  <p><BadgeCheck /> Inscripción confirmada</p>
                  {enrollment.teamName && (
                    <div className="account-team-summary">
                      <strong>{enrollment.teamName}</strong>
                      <span>{enrollment.teamMembers?.join(" · ")}</span>
                      <small>{enrollment.isTeamCaptain ? "Eres capitán" : "Integrante del equipo"}</small>
                    </div>
                  )}
                </div>
                {confirmingActivityId === enrollment.activityId ? (
                  <div className="account-cancel-confirmation" role="group" aria-label={`Confirmar cancelación de ${enrollment.title}`}>
                    <p>{copy.prompt}</p>
                    <div>
                      <button type="button" disabled={isPending} onClick={() => cancelEnrollment(enrollment)}>
                        {pendingActivityId === enrollment.activityId ? "Procesando…" : copy.confirm}
                      </button>
                      <button type="button" disabled={isPending} onClick={() => setConfirmingActivityId(null)}>
                        Volver
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isPending || !enrollment.canCancel}
                    onClick={() => setConfirmingActivityId(enrollment.activityId)}
                  >
                    <XCircle />
                    {enrollment.canCancel ? copy.action : "Cancelación cerrada"}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="account-activities-empty">
          Todavía no tienes inscripciones a talleres o concursos.
        </p>
      )}
    </section>
  );
}
