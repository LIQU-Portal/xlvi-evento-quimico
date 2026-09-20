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
  const [feedback, setFeedback] = useState<{
    status: "success" | "error";
    message: string;
  } | null>(null);

  const cancelEnrollment = (enrollment: ParticipantActivityEnrollment) => {
    const confirmed = window.confirm(
      `¿Quieres cancelar tu inscripción a "${enrollment.title}"? El lugar volverá a estar disponible.`,
    );

    if (!confirmed) return;

    setPendingActivityId(enrollment.activityId);
    setFeedback(null);
    startTransition(async () => {
      const result = await cancelActivityEnrollment(enrollment.activityId);
      setFeedback({ status: result.status, message: result.message });
      setPendingActivityId(null);
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
              <button
                type="button"
                disabled={isPending || !enrollment.canCancel}
                onClick={() => cancelEnrollment(enrollment)}
              >
                <XCircle />
                {pendingActivityId === enrollment.activityId
                  ? "Cancelando..."
                  : enrollment.canCancel
                    ? "Cancelar inscripción"
                    : "Periodo de cancelación cerrado"}
              </button>
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
