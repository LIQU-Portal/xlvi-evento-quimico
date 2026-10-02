import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getParticipantActivityEnrollments } from "@/lib/activity-registration";
import {
  getSafeSubmissionUrl,
  isSubmissionBeforeDeadline,
} from "@/lib/activity-resources";
import { lookupRegistration } from "@/lib/registration";
import { getActivityResourceConfig } from "@/lib/sheets";

export const dynamic = "force-dynamic";

function message(message: string, status: number) {
  return new NextResponse(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ activityId: string }> },
) {
  const { activityId: rawActivityId } = await context.params;
  const activityId = Number(rawActivityId);
  if (!Number.isInteger(activityId) || activityId <= 0) {
    return message("Actividad no válida.", 400);
  }

  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.redirect(new URL("/iniciar-sesion", request.url));
  }

  const registration = await lookupRegistration(email);
  if (registration.registration?.status !== "Confirmado") {
    return message("Necesitas completar tu registro general antes de entregar.", 403);
  }

  try {
    const resource = await getActivityResourceConfig(activityId, {
      fresh: true,
      allowFallback: false,
    });
    const submissionUrl = getSafeSubmissionUrl(resource?.submissionUrl);

    if (!resource || !submissionUrl) {
      return message("Esta actividad no tiene un formulario de entrega válido.", 404);
    }
    if (!resource.submissionEnabled) {
      return message("La recepción de trabajos no está habilitada.", 403);
    }
    if (!isSubmissionBeforeDeadline(resource.submissionDeadline)) {
      return message("La fecha límite de entrega ya terminó.", 410);
    }

    const enrollment = (await getParticipantActivityEnrollments(email)).find(
      (entry) => entry.activityId === activityId,
    );
    if (!enrollment) {
      return message("Primero debes inscribirte a esta actividad.", 403);
    }
    if (enrollment.isTeamCaptain === false) {
      return message("La entrega debe hacerla quien registró al equipo.", 403);
    }

    return NextResponse.redirect(submissionUrl);
  } catch (error) {
    console.error("No fue posible abrir el formulario de entrega:", error);
    return message("No fue posible validar la entrega en este momento.", 503);
  }
}
