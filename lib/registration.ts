import QRCode from "qrcode";

import { getSql, hasDatabaseConfiguration } from "@/lib/db";

export type AccountType = "Alumno" | "Profesor";
export type ParticipantRole = AccountType | "Staff";
export type StaffType = "Alumno" | "Académico";

export type EventRegistration = {
  id: string;
  createdAt: string;
  email: string;
  name: string;
  accountType: AccountType;
  role: ParticipantRole;
  staffType?: StaffType;
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
  registrations?: Array<{
    email: string;
    registration: EventRegistration | null;
  }>;
};

export class RegistrationServiceError extends Error {}

export function getAccountType(email: string): AccountType {
  return email.toLowerCase().endsWith("@alumnos.udg.mx")
    ? "Alumno"
    : "Profesor";
}

function registrationFromRow(row: Record<string, unknown>): EventRegistration {
  return {
    id: String(row.id),
    createdAt: new Date(String(row.created_at)).toISOString(),
    email: String(row.email),
    name: String(row.name),
    accountType: row.account_type === "Alumno" ? "Alumno" : "Profesor",
    role:
      row.role === "Staff" || row.role === "Alumno"
        ? row.role
        : "Profesor",
    ...(row.staff_type === "Alumno" || row.staff_type === "Académico"
      ? { staffType: row.staff_type }
      : {}),
    institutionalCode: String(row.institutional_code),
    affiliation: String(row.affiliation),
    status: row.status === "Cancelado" ? "Cancelado" : "Confirmado",
    ...(row.qr_token ? { qrToken: String(row.qr_token) } : {}),
    ...(row.confirmation_email_sent_at
      ? {
          confirmationEmailSentAt: new Date(
            String(row.confirmation_email_sent_at),
          ).toISOString(),
        }
      : {}),
  };
}

async function findMirroredRegistration(email: string) {
  const sql = getSql();
  const rows = await sql.query(
    `SELECT id, created_at, email, name, account_type, role, staff_type,
            institutional_code, affiliation, status, qr_token,
            confirmation_email_sent_at
       FROM participants
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1`,
    [email],
  );

  return rows[0]
    ? registrationFromRow(rows[0] as Record<string, unknown>)
    : null;
}

async function findMirroredRegistrations(emails: string[]) {
  if (!emails.length) return new Map<string, EventRegistration>();

  const sql = getSql();
  const rows = await sql.query(
    `SELECT id, created_at, email, name, account_type, role, staff_type,
            institutional_code, affiliation, status, qr_token,
            confirmation_email_sent_at
       FROM participants
      WHERE LOWER(email) = ANY($1::TEXT[])`,
    [emails],
  );

  return new Map(
    rows.map((row) => {
      const registration = registrationFromRow(
        row as Record<string, unknown>,
      );
      return [registration.email.toLowerCase(), registration] as const;
    }),
  );
}

async function mirrorRegistration(registration: EventRegistration) {
  if (!hasDatabaseConfiguration()) return;

  const sql = getSql();
  await sql.query(
    `INSERT INTO participants (
       id, email, name, account_type, role, staff_type, institutional_code, affiliation,
       status, qr_token, confirmation_email_sent_at, created_at, updated_at
     ) VALUES (
       $1, LOWER($2), $3, $4, $5, NULLIF($6, ''), $7, $8, $9, $10,
       NULLIF($11, '')::TIMESTAMPTZ, $12::TIMESTAMPTZ, NOW()
     )
     ON CONFLICT (email) DO UPDATE SET
       id = EXCLUDED.id,
       name = EXCLUDED.name,
       account_type = EXCLUDED.account_type,
       role = EXCLUDED.role,
       staff_type = EXCLUDED.staff_type,
       institutional_code = EXCLUDED.institutional_code,
       affiliation = EXCLUDED.affiliation,
       status = EXCLUDED.status,
       qr_token = COALESCE(EXCLUDED.qr_token, participants.qr_token),
       confirmation_email_sent_at = COALESCE(
         EXCLUDED.confirmation_email_sent_at,
         participants.confirmation_email_sent_at
       ),
       created_at = EXCLUDED.created_at,
       updated_at = NOW()`,
    [
      registration.id,
      registration.email,
      registration.name,
      registration.accountType,
      registration.role,
      registration.staffType ?? "",
      registration.institutionalCode,
      registration.affiliation,
      registration.status,
      registration.qrToken ?? null,
      registration.confirmationEmailSentAt ?? "",
      registration.createdAt,
    ],
  );
}

async function mirrorRegistrationSafely(registration: EventRegistration) {
  try {
    await mirrorRegistration(registration);
  } catch (error) {
    console.error("No fue posible actualizar el espejo de participantes:", error);
  }
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
  const normalizedEmail = email.trim().toLowerCase();
  let mirroredRegistration: EventRegistration | null = null;

  if (hasDatabaseConfiguration()) {
    try {
      mirroredRegistration = await findMirroredRegistration(normalizedEmail);

      if (mirroredRegistration?.qrToken) {
        return {
          state: "registered",
          registration: mirroredRegistration,
          isStaff: mirroredRegistration.role === "Staff",
        };
      }
    } catch (error) {
      console.error("No fue posible consultar el registro en Neon:", error);
    }
  }

  if (!getConfiguration().configured) {
    if (mirroredRegistration) {
      return {
        state: "registered",
        registration: mirroredRegistration,
        isStaff: mirroredRegistration.role === "Staff",
      };
    }

    return {
      state: "unavailable",
      registration: null,
      isStaff: false,
      message: "Falta conectar la hoja privada de registros.",
    };
  }

  try {
    const result = await callAppsScript(
      { action: "lookup", email: normalizedEmail },
      8_000,
    );
    const registration = result.registration ?? null;

    if (registration) await mirrorRegistrationSafely(registration);

    return {
      state: registration ? "registered" : "not_registered",
      registration,
      isStaff: result.isStaff === true,
    };
  } catch (error) {
    console.error("No fue posible consultar el registro:", error);

    if (mirroredRegistration) {
      return {
        state: "registered",
        registration: mirroredRegistration,
        isStaff: mirroredRegistration.role === "Staff",
        message: "Mostramos la copia disponible mientras Google Sheets responde.",
      };
    }

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

export async function lookupRegistrations(emails: string[]) {
  const normalized = emails.map((email) => email.trim().toLowerCase());
  let mirrored = new Map<string, EventRegistration>();

  if (hasDatabaseConfiguration()) {
    try {
      mirrored = await findMirroredRegistrations(normalized);
    } catch (error) {
      console.error("No fue posible consultar participantes en Neon:", error);
    }
  }

  const missingEmails = normalized.filter((email) => !mirrored.has(email));

  if (missingEmails.length) {
    const result = await callAppsScript(
      { action: "lookupMany", emails: missingEmails },
      8_000,
    );

    await Promise.all(
      (result.registrations ?? []).map(async ({ email, registration }) => {
        if (!registration) return;
        mirrored.set(email.toLowerCase(), registration);
        await mirrorRegistrationSafely(registration);
      }),
    );
  }

  return normalized.map((email) => ({
    email,
    registration: mirrored.get(email) ?? null,
  }));
}

export async function createRegistration(input: {
  email: string;
  name: string;
  institutionalCode: string;
  affiliation: string;
}) {
  const accountType = getAccountType(input.email);
  const result = await callAppsScript(
    {
      action: "register",
      ...input,
      accountType,
    },
    20_000,
  );

  if (!result.registration) {
    throw new RegistrationServiceError(
      "La hoja no devolvió la confirmación del registro.",
    );
  }

  let registration = result.registration;
  await mirrorRegistrationSafely(registration);
  let confirmationEmailSent = result.confirmationEmailSent === true;
  let emailMessage = result.emailMessage;

  if (!confirmationEmailSent && registration.qrToken) {
    try {
      const emailResult = await deliverConfirmationEmail(registration);
      registration = emailResult.registration;
      confirmationEmailSent = emailResult.confirmationEmailSent;
      emailMessage = emailResult.emailMessage;
      await mirrorRegistrationSafely(registration);
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
  const lookup = await lookupRegistration(email);
  const registration = lookup.registration;

  if (!registration) {
    throw new RegistrationServiceError("No encontramos tu registro confirmado.");
  }

  if (registration.confirmationEmailSentAt) {
    return {
      registration,
      confirmationEmailSent: true,
      emailMessage: "El correo de confirmación ya había sido enviado.",
    };
  }

  const result = await deliverConfirmationEmail(registration);
  await mirrorRegistrationSafely(result.registration);
  return result;
}
