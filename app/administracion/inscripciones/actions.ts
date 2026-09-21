"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  ADMIN_CANCELLATION_REASONS,
  cancelEnrollmentAsAdmin,
  isActivityAdmin,
  type AdminCancellationReason,
} from "@/lib/activity-admin";

export type AdminCancellationState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function cancelEnrollmentAdminAction(
  _previousState: AdminCancellationState,
  formData: FormData,
): Promise<AdminCancellationState> {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();

  if (!email || !isActivityAdmin(email)) {
    return { status: "error", message: "No tienes autorización para esta acción." };
  }

  const enrollmentId = Number(formData.get("enrollmentId"));
  const reason = String(formData.get("reason") ?? "") as AdminCancellationReason;
  const detail = String(formData.get("detail") ?? "").trim();

  if (!Number.isSafeInteger(enrollmentId) || enrollmentId < 1) {
    return { status: "error", message: "La inscripción no es válida." };
  }

  if (!(reason in ADMIN_CANCELLATION_REASONS)) {
    return { status: "error", message: "Selecciona un motivo de cancelación." };
  }

  if (reason === "other" && detail.length < 3) {
    return { status: "error", message: "Explica brevemente el motivo." };
  }

  try {
    const result = await cancelEnrollmentAsAdmin({
      enrollmentId,
      adminEmail: email,
      reason,
      detail,
    });

    if (result.outcome === "cancelled") {
      revalidatePath("/");
      revalidatePath("/mi-cuenta");
      revalidatePath("/administracion/inscripciones");
      return { status: "success", message: "Inscripción cancelada y auditada." };
    }

    return {
      status: result.outcome === "already_cancelled" ? "success" : "error",
      message:
        result.outcome === "already_cancelled"
          ? "La inscripción ya estaba cancelada."
          : "No se encontró la inscripción.",
    };
  } catch (error) {
    console.error("No fue posible cancelar la inscripción como administrador:", error);
    return { status: "error", message: "No fue posible cancelar la inscripción." };
  }
}
