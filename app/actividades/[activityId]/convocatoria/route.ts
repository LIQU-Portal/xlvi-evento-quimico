import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
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
  request: NextRequest,
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
    const loginUrl = new URL("/iniciar-sesion", request.url);
    return NextResponse.redirect(loginUrl);
  }

  const registration = await lookupRegistration(email);
  if (registration.registration?.status !== "Confirmado") {
    return message(
      "Necesitas completar tu registro general al Evento del Químico para consultar esta convocatoria.",
      403,
    );
  }

  try {
    const resource = await getActivityResourceConfig(activityId, {
      fresh: true,
      allowFallback: false,
    });
    if (!resource?.callForEntriesFileId) {
      return message("Esta actividad no tiene una convocatoria disponible.", 404);
    }

    return NextResponse.redirect(
      `https://drive.google.com/file/d/${encodeURIComponent(resource.callForEntriesFileId)}/view`,
    );
  } catch (error) {
    console.error("No fue posible abrir la convocatoria:", error);
    return message("No fue posible consultar la convocatoria en este momento.", 503);
  }
}
