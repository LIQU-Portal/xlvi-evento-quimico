import QRCode from "qrcode";

export type AccountType = "Alumno" | "Profesor";
export type ParticipantRole = AccountType | "Staff";

export type EventRegistration = {
  id: string;
  createdAt: string;
  email: string;
  name: string;
  accountType: AccountType;
  role: ParticipantRole;
  institutionalCode: string;
  affiliation: string;
  status: "Confirmado" | "Cancelado";
  qrToken?: string;
  confirmationEmailSentAt?: string;
};

export type RegistrationLookup = {
  state: "registered" | "not_registered" | "unavailable";
  registration: EventRegistration | null;
  isStaff: boolean;
  message?: string;
};

type AppsScriptResponse = {
  ok: boolean;
  message?: string;
  registration?: EventRegistration | null;
  isStaff?: boolean;
  alreadyRegistered?: boolean;
  confirmationEmailSent?: boolean;
  emailMessage?: string;
};

export class RegistrationServiceError extends Error {}

export function getAccountType(email: string): AccountType {
  return email.toLowerCase().endsWith("@alumnos.udg.mx")
    ? "Alumno"
    : "Profesor";
}

function getConfiguration() {
  const url = process.env.REGISTRATION_API_URL?.trim();
  const secret = process.env.REGISTRATION_API_SECRET?.trim();

  return { url, secret, configured: Boolean(url && secret) };
}

async function callAppsScript(
  payload: Record<string, unknown>,
  timeoutMs = 12_000,
): Promise<AppsScriptResponse> {
  const { url, secret, configured } = getConfiguration();

  if (!configured || !url || !secret) {
    throw new RegistrationServiceError(
      "El servicio de registro aún no está conectado con Google Sheets.",
    );
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...payload, secret }),
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new RegistrationServiceError(
      `Google Sheets respondió con el estado ${response.status}.`,
    );
  }

  const result = (await response.json()) as AppsScriptResponse;

  if (!result.ok) {
    throw new RegistrationServiceError(
      result.message ?? "No fue posible completar el registro.",
    );
  }

  return result;
}

export async function lookupRegistration(
  email: string,
): Promise<RegistrationLookup> {
  if (!getConfiguration().configured) {
    return {
      state: "unavailable",
      registration: null,
      isStaff: false,
      message: "Falta conectar la hoja privada de registros.",
    };
  }

  try {
    const result = await callAppsScript({ action: "lookup", email });
    const registration = result.registration ?? null;

    return {
      state: registration ? "registered" : "not_registered",
      registration,
      isStaff: result.isStaff === true,
    };
  } catch (error) {
    console.error("No fue posible consultar el registro:", error);

    return {
      state: "unavailable",
      registration: null,
      isStaff: false,
      message:
        error instanceof Error
          ? error.message
          : "No fue posible consultar Google Sheets.",
    };
  }
}

export async function createRegistration(input: {
  email: string;
  name: string;
  institutionalCode: string;
  affiliation: string;
}) {
  const accountType = getAccountType(input.email);
  const result = await callAppsScript({
    action: "register",
    ...input,
    accountType,
  });

  if (!result.registration) {
    throw new RegistrationServiceError(
      "La hoja no devolvió la confirmación del registro.",
    );
  }

  let registration = result.registration;
  let confirmationEmailSent = result.confirmationEmailSent === true;
  let emailMessage = result.emailMessage;

  if (!confirmationEmailSent && registration.qrToken) {
    try {
      const emailResult = await deliverConfirmationEmail(registration);
      registration = emailResult.registration;
      confirmationEmailSent = emailResult.confirmationEmailSent;
      emailMessage = emailResult.emailMessage;
    } catch (error) {
      console.error("No fue posible enviar el correo de confirmación:", error);
      emailMessage =
        "Tu registro quedó confirmado. El correo no pudo enviarse, pero tu QR está disponible en Mi cuenta.";
    }
  }

  return {
    registration,
    alreadyRegistered: result.alreadyRegistered === true,
    confirmationEmailSent,
    emailMessage,
  };
}

async function deliverConfirmationEmail(registration: EventRegistration) {
  if (!registration.qrToken) {
    throw new RegistrationServiceError(
      "El registro todavía no tiene un código QR disponible.",
    );
  }

  const qrDataUrl = await QRCode.toDataURL(registration.qrToken, {
    errorCorrectionLevel: "H",
    margin: 3,
    width: 500,
    color: { dark: "#121f48", light: "#ffffff" },
  });
  const qrImageBase64 = qrDataUrl.split(",")[1];
  const result = await callAppsScript(
    {
      action: "sendConfirmation",
      email: registration.email,
      qrToken: registration.qrToken,
      qrImageBase64,
    },
    30_000,
  );

  return {
    registration: result.registration ?? registration,
    confirmationEmailSent: result.confirmationEmailSent === true,
    emailMessage:
      result.emailMessage ?? "Enviamos el correo de confirmación con tu QR.",
  };
}

export async function sendRegistrationConfirmation(email: string) {
  const result = await callAppsScript({ action: "lookup", email });

  if (!result.registration) {
    throw new RegistrationServiceError("No encontramos tu registro confirmado.");
  }

  if (result.registration.confirmationEmailSentAt) {
    return {
      registration: result.registration,
      confirmationEmailSent: true,
      emailMessage: "El correo de confirmación ya había sido enviado.",
    };
  }

  return deliverConfirmationEmail(result.registration);
}
