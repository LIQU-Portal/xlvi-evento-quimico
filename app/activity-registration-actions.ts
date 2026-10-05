"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { getProgramFromSheets } from "@/lib/sheets";
import {
  cancelParticipantEnrollment,
  enrollParticipant,
  enrollTeam,
  syncProgramActivity,
} from "@/lib/activity-registration";
import { lookupRegistration, lookupRegistrations } from "@/lib/registration";
import { containsEmailAddress } from "@/lib/team-registration";

function normalizeTeamEmails(emails: string[]) {
  return emails.map((email) => email.trim().toLowerCase()).filter(Boolean);
}

function acceptsTeamRegistration(activity: {
  type: string;
  minMembers?: number;
  maxMembers?: number;
}) {
  return (
    activity.type === "Concurso" &&
    ((activity.minMembers ?? 1) > 1 || (activity.maxMembers ?? 1) > 1)
  );
}

export async function validateTeamMembers(activityId: number, emails: string[]) {
  const session = await auth();
  const captainEmail = session?.user?.email?.trim().toLowerCase();
  if (!captainEmail) return { status: "error" as const, message: "Inicia sesión para continuar.", members: [] };

  let program: Awaited<ReturnType<typeof getProgramFromSheets>>;
  try {
    program = await getProgramFromSheets({ allowFallback: false });
  } catch (error) {
    console.error("No fue posible cargar el programa para validar el equipo:", error);
    return { status: "error" as const, message: "No pudimos consultar el programa. Intenta nuevamente.", members: [] };
  }
  const activity = program.find((item) => item.id === activityId);
  if (!activity || !acceptsTeamRegistration(activity)) {
    return { status: "error" as const, message: "Este concurso no admite equipos.", members: [] };
  }

  const memberEmails = [captainEmail, ...normalizeTeamEmails(emails)];
  if (new Set(memberEmails).size !== memberEmails.length) {
    return { status: "error" as const, message: "No repitas correos.", members: [] };
  }

  try {
    const registrations = await lookupRegistrations(memberEmails);
    const members = registrations.map(({ email, registration }) => ({
      email,
      valid: registration?.status === "Confirmado",
      name: registration?.name ?? "",
    }));
    const valid = members.every((member) => member.valid);
    return {
      status: valid ? "success" as const : "error" as const,
      message: valid ? "Equipo validado." : "Algún integrante debe completar primero su registro general.",
      members,
    };
  } catch (error) {
    console.error("No fue posible validar los integrantes del equipo:", error);
    return {
      status: "error" as const,
      message: "No fue posible validar el equipo. Intenta nuevamente en unos minutos.",
      members: [],
    };
  }
}

export async function enrollTeamInActivity(activityId: number, teamName: string, emails: string[]) {
  const session = await auth();
  const captainEmail = session?.user?.email?.trim().toLowerCase();
  if (!captainEmail) return { status: "error" as const, code: "auth_required", message: "Inicia sesión para inscribir al equipo." };

  let program: Awaited<ReturnType<typeof getProgramFromSheets>>;
  try {
    program = await getProgramFromSheets({ allowFallback: false });
  } catch (error) {
    console.error("No fue posible cargar el programa para inscribir el equipo:", error);
    return { status: "error" as const, code: "unavailable", message: "No pudimos consultar el programa. Intenta nuevamente." };
  }
  const activity = program.find((item) => item.id === activityId);
  if (!activity || !acceptsTeamRegistration(activity)) return { status: "error" as const, code: "not_found", message: "El concurso ya no está disponible." };

  const memberEmails = [captainEmail, ...normalizeTeamEmails(emails)];
  const min = activity.minMembers ?? 1;
  const max = activity.maxMembers ?? 1;
  if (memberEmails.length < min || memberEmails.length > max || new Set(memberEmails).size !== memberEmails.length) {
    return { status: "error" as const, code: "invalid_team", message: `El equipo debe tener entre ${min} y ${max} integrantes sin correos repetidos.` };
  }
  const cleanTeamName = teamName.trim();
  if (containsEmailAddress(cleanTeamName)) {
    return { status: "error" as const, code: "invalid_team", message: "Escribe un nombre para tu equipo, no un correo." };
  }
  if (memberEmails.length > 1 && cleanTeamName.length < 2) return { status: "error" as const, code: "invalid_team", message: "Escribe el nombre del equipo." };

  let registrations: Awaited<ReturnType<typeof lookupRegistrations>>;
  try {
    registrations = await lookupRegistrations(memberEmails);
  } catch (error) {
    console.error("No fue posible consultar los registros del equipo:", error);
    return { status: "error" as const, code: "unavailable", message: "No fue posible validar el equipo. Intenta nuevamente en unos minutos." };
  }
  const members = registrations.map(({ registration }) => registration).filter((registration): registration is NonNullable<typeof registration> => Boolean(registration && registration.status === "Confirmado"));
  if (members.length !== memberEmails.length) return { status: "error" as const, code: "registration_required", message: "Todos deben registrarse primero al evento." };

  const result = await enrollTeam({ activity, teamName: cleanTeamName || members[0].name, members: members.map((member) => ({ id: member.id, email: member.email, name: member.name })) });
  revalidatePath("/"); revalidatePath("/mi-cuenta");
  if (result.outcome === "confirmed" || result.outcome === "already_enrolled") return { status: "success" as const, code: result.outcome, message: "Inscripción del equipo confirmada.", remainingCapacity: result.remainingCapacity };
  const messages: Record<string, string> = { invalid_team: "Revisa el número de integrantes.", member_already_enrolled: "Uno de los integrantes ya está inscrito en este concurso.", disabled: "Las inscripciones no están habilitadas.", upcoming: "Las inscripciones todavía no comienzan.", closed: "Las inscripciones ya cerraron.", full: "El concurso alcanzó su cupo.", not_found: "El concurso ya no está disponible." };
  return { status: "error" as const, code: result.outcome, message: messages[result.outcome] ?? "No fue posible completar la inscripción.", remainingCapacity: result.remainingCapacity };
}

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

  let program: Awaited<ReturnType<typeof getProgramFromSheets>>;
  try {
    program = await getProgramFromSheets({ allowFallback: false });
  } catch (error) {
    console.error("No fue posible cargar el programa para la inscripcion:", error);
    return {
      status: "error" as const,
      code: "unavailable",
      message: "No pudimos consultar el programa. Intenta nuevamente.",
    };
  }
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

  try {
    let refreshFailed = false;

    try {
      const program = await getProgramFromSheets({
        fresh: true,
        allowFallback: false,
      });
      const activity = program.find((item) => item.id === activityId);
      if (activity) await syncProgramActivity(activity);
    } catch (error) {
      refreshFailed = true;
      console.error(
        "No fue posible refrescar la configuracion antes de cancelar:",
        error,
      );
    }

    const result = await cancelParticipantEnrollment({
      activityId,
      email,
    });

    revalidatePath("/");
    revalidatePath("/mi-cuenta");

    if (
      result.outcome === "cancelled" ||
      result.outcome === "member_left" ||
      result.outcome === "team_cancelled_minimum"
    ) {
      const successMessages = {
        cancelled: "La inscripción fue cancelada y el cupo quedó disponible.",
        member_left: "Saliste del equipo y tu lugar quedó disponible.",
        team_cancelled_minimum:
          "Saliste del equipo. Como quedó por debajo del mínimo, su inscripción completa fue cancelada.",
      } as const;

      return {
        status: "success" as const,
        code: result.outcome,
        message: successMessages[result.outcome],
      };
    }

    const messages = {
      already_cancelled: "Esta inscripción ya estaba cancelada.",
      cancellation_closed: "El periodo para cancelar esta inscripción terminó.",
      captain_required: "Solo el capitán puede cancelar la inscripción del equipo.",
      not_found: "No encontramos una inscripción activa para esta actividad.",
    } as const;

    if (result.outcome === "cancellation_closed" && refreshFailed) {
      return {
        status: "error" as const,
        code: "unavailable",
        message:
          "No pudimos comprobar el horario actualizado. Intenta nuevamente en un momento.",
      };
    }

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
