import type { AttendanceDirection, AttendanceResult } from "./attendance-rules";

export const CAMERA_CONFIRMATION_MS = 1000;
export function attendanceReadDelta(result: AttendanceResult | null, busy: boolean) {
  return !busy && result?.outcome === "recorded" ? 1 : 0;
}

export function attendanceFeedback(result: AttendanceResult | null, direction: AttendanceDirection, busy: boolean) {
  if (busy) return { tone: "pending", title: "Comprobando QR…", detail: "Espera la confirmación antes de continuar." };
  if (!result) return { tone: "idle", title: "Listo para leer", detail: "Acerca el QR personal del participante." };
  if (result.outcome === "recorded") return {
    tone: "success", title: direction === "entry" ? "ENTRADA REGISTRADA" : "SALIDA REGISTRADA",
    detail: "Confirmado · retira este QR y acerca el siguiente.",
  };
  if (result.outcome === "duplicate") return {
    tone: "duplicate", title: direction === "entry" ? "ENTRADA YA REGISTRADA" : "SALIDA YA REGISTRADA",
    detail: "No se agregó otra lectura. Continúa con la siguiente persona.",
  };
  if (result.outcome === "error") return {
    tone: "uncertain", title: "SIN CONFIRMACIÓN", detail: result.message,
  };
  return { tone: "error", title: "NO SE REGISTRÓ", detail: result.message };
}

export type CameraReadGate = { lastCode: string | null; missingSince: number | null };
export const newCameraReadGate = (): CameraReadGate => ({ lastCode: null, missingSince: null });

// Keep a held QR from replacing success with duplicate feedback. Different QRs
// can be processed immediately; the same QR is rearmed after a second away.
export function acceptCameraRead(gate: CameraReadGate, code: string | null, now: number) {
  if (code === null) {
    gate.missingSince ??= now;
    if (now - gate.missingSince >= 750) gate.lastCode = null;
    return false;
  }
  const awayLongEnough = gate.missingSince !== null && now - gate.missingSince >= 750;
  gate.missingSince = null;
  if (gate.lastCode === code && !awayLongEnough) return false;
  gate.lastCode = code;
  return true;
}
