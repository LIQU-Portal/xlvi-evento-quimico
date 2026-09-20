"use client";

import { BadgeCheck, CalendarCheck, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { cancelActivityEnrollment } from "@/app/activity-registration-actions";
import type { ParticipantActivityEnrollment } from "@/lib/activity-registration";

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
      const result = await cancelActivityEnrollment(enrollment.activityId);
      setFeedback({ status: result.status, message: result.message });
      setPendingActivityId(null);
      setConfirmingActivityId(null);
      if (result.status === "success") router.refresh();
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
          {enrollments.map((enrollment) => (
            <article key={enrollment.activityId} className="account-activity-item">
              <div>
                <span>{enrollment.type}</span>
                <h3>{enrollment.title}</h3>
                <p><BadgeCheck /> Inscripción confirmada</p>
              </div>
              {confirmingActivityId === enrollment.activityId ? (
                <div className="account-cancel-confirmation" role="group" aria-label={`Confirmar cancelación de ${enrollment.title}`}>
                  <p>¿Liberar tu lugar?</p>
                  <div>
                    <button type="button" disabled={isPending} onClick={() => cancelEnrollment(enrollment)}>
                      {pendingActivityId === enrollment.activityId ? "Cancelando…" : "Confirmar cancelación"}
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
                  {enrollment.canCancel ? "Cancelar" : "Cancelación cerrada"}
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="account-activities-empty">
          Todavía no tienes inscripciones a talleres o concursos.
        </p>
      )}
    </section>
  );
}
