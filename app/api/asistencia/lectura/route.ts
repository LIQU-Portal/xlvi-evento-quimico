import { auth } from "@/auth";
import { scanAttendance } from "@/lib/attendance";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!process.env.ATTENDANCE_ADMIN_EMAILS?.trim()) {
    return Response.json({ message: "El control de asistencia todavía no está habilitado." }, { status: 503, headers });
  }
  // Solo JSON del mismo origen; evita que un formulario externo registre lecturas.
  if (request.headers.get("origin") !== new URL(request.url).origin
    || !request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ message: "Solicitud no autorizada." }, { status: 403, headers });
  }
  const session = await auth();
  if (!session?.user?.email) return Response.json({ message: "Inicia sesión de nuevo." }, { status: 401, headers });
  try {
    const bodyText = await request.text();
    if (bodyText.length > 2500) return Response.json({ message: "Solicitud demasiado grande." }, { status: 413, headers });
    const body = JSON.parse(bodyText);
    const input = {
      sessionId: String(body.sessionId ?? "").slice(0, 120),
      reference: String(body.reference ?? "").trim().slice(0, 200),
      direction: String(body.direction ?? ""), source: String(body.source ?? ""),
      reason: String(body.reason ?? "").trim().slice(0, 240), operatorEmail: session.user.email,
      requestId: String(body.requestId ?? "").slice(0, 60),
    };
    return Response.json(await scanAttendance(input), { headers });
  } catch (error) {
    // Nunca registrar tokens QR ni datos de participantes en logs.
    console.error("Error del servicio de asistencia", error instanceof Error ? error.name : "Error");
    return Response.json({ message: "No pudimos confirmar el registro. Vuelve a escanear; no se duplicará." }, { status: 503, headers });
  }
}
