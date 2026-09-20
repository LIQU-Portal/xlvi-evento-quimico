"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { getProgramFromSheets } from "@/lib/sheets";
import {
  cancelParticipantEnrollment,
  enrollParticipant,
} from "@/lib/activity-registration";
import { lookupRegistration } from "@/lib/registration";

export async function enrollInActivity(activityId: number) {
  if (!Number.isInteger(activityId) || activityId < 1) {
    return { status: "error" as const, code: "invalid", message: "La actividad no es válida." };
  }

  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();

  if (!email) {
    return {
      status: "error" as const,
      code: "auth_required",
      message: "Inicia sesión con tu cuenta institucional para inscribirte.",
    };
  }

  const registrationLookup = await lookupRegistration(email);
  const registration = registrationLookup.registration;

  if (!registration || registration.status !== "Confirmado") {
    return {
      status: "error" as const,
      code: "registration_required",
      message: "Primero confirma tu registro general desde Mi cuenta.",
    };
  }

  const program = await getProgramFromSheets();
  const activity = program.find((item) => item.id === activityId);

  if (!activity || (activity.type !== "Taller" && activity.type !== "Concurso")) {
    return {
      status: "error" as const,
      code: "not_found",
      message: "La actividad ya no está disponible.",
    };
  }

  try {
    const result = await enrollParticipant({
      activity,
      participantId: registration.id,
      email,
      name: registration.name,
    });

    revalidatePath("/");
    revalidatePath("/mi-cuenta");

    if (result.outcome === "confirmed") {
      return {
        status: "success" as const,
        code: result.outcome,
        message: "Tu inscripción quedó confirmada.",
        remainingCapacity: result.remainingCapacity,
      };
    }

    if (result.outcome === "already_enrolled") {
      return {
        status: "success" as const,
        code: result.outcome,
        message: "Ya estabas inscrito en esta actividad.",
        remainingCapacity: result.remainingCapacity,
      };
    }

    const messages = {
      disabled: "Las inscripciones todavía no están habilitadas.",
      upcoming: "El periodo de inscripción todavía no comienza.",
      closed: "El periodo de inscripción ya terminó.",
      full: "La actividad alcanzó su cupo máximo.",
      not_found: "La actividad ya no está disponible.",
    } as const;

    return {
      status: "error" as const,
      code: result.outcome,
      message: messages[result.outcome],
      remainingCapacity: result.remainingCapacity,
    };
  } catch (error) {
    console.error("No fue posible completar la inscripción:", error);
    return {
      status: "error" as const,
      code: "unavailable",
      message: "No fue posible procesar la inscripción. Intenta nuevamente.",
    };
  }
}

export async function cancelActivityEnrollment(activityId: number) {
  if (!Number.isInteger(activityId) || activityId < 1) {
    return { status: "error" as const, code: "invalid", message: "La actividad no es válida." };
  }

  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();

  if (!email) {
    return {
      status: "error" as const,
      code: "auth_required",
      message: "Tu sesión terminó. Vuelve a iniciar sesión.",
    };
  }

  const registrationLookup = await lookupRegistration(email);
  const registration = registrationLookup.registration;

  if (!registration) {
    return {
      status: "error" as const,
      code: "registration_required",
      message: "No encontramos tu registro general confirmado.",
    };
  }

  try {
    const result = await cancelParticipantEnrollment({
      activityId,
      participantId: registration.id,
      email,
    });

    revalidatePath("/");
    revalidatePath("/mi-cuenta");

    if (result.outcome === "cancelled") {
      return {
        status: "success" as const,
        code: result.outcome,
        message: "Tu inscripción fue cancelada y el lugar quedó disponible.",
      };
    }

    const messages = {
      already_cancelled: "Esta inscripción ya estaba cancelada.",
      cancellation_closed: "El periodo para cancelar esta inscripción terminó.",
      not_found: "No encontramos una inscripción activa para esta actividad.",
    } as const;

    return {
      status: "error" as const,
      code: result.outcome,
      message: messages[result.outcome],
    };
  } catch (error) {
    console.error("No fue posible cancelar la inscripción:", error);
    return {
      status: "error" as const,
      code: "unavailable",
      message: "No fue posible cancelar la inscripción. Intenta nuevamente.",
    };
  }
}
