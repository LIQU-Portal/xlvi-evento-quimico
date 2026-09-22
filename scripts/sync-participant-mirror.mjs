import { neon } from "@neondatabase/serverless";

const connectionString =
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.POSTGRES_URL ??
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.DATABASE_URL;
const registrationUrl = process.env.REGISTRATION_API_URL?.trim();
const registrationSecret = process.env.REGISTRATION_API_SECRET?.trim();

if (!connectionString || !registrationUrl || !registrationSecret) {
  throw new Error(
    "Faltan las variables de Neon o del servicio privado de registros.",
  );
}

const sql = neon(connectionString);

async function callRegistrationService(payload) {
  const response = await fetch(registrationUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...payload, secret: registrationSecret }),
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.message ?? `El servicio respondió ${response.status}.`);
  }
  return result;
}

function isoDate(value, fallback = new Date().toISOString()) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

async function saveRegistration(registration) {
  await sql.query(
    `INSERT INTO participants (
       id, email, name, account_type, role, institutional_code, affiliation,
       status, qr_token, confirmation_email_sent_at, created_at, updated_at
     ) VALUES (
       $1, LOWER($2), $3, $4, $5, $6, $7, $8, $9,
       NULLIF($10, '')::TIMESTAMPTZ, $11::TIMESTAMPTZ, NOW()
     )
     ON CONFLICT (email) DO UPDATE SET
       id = EXCLUDED.id, name = EXCLUDED.name,
       account_type = EXCLUDED.account_type, role = EXCLUDED.role,
       institutional_code = EXCLUDED.institutional_code,
       affiliation = EXCLUDED.affiliation, status = EXCLUDED.status,
       qr_token = COALESCE(EXCLUDED.qr_token, participants.qr_token),
       confirmation_email_sent_at = COALESCE(
         EXCLUDED.confirmation_email_sent_at,
         participants.confirmation_email_sent_at
       ),
       created_at = EXCLUDED.created_at, updated_at = NOW()`,
    [
      registration.id,
      registration.email,
      registration.name,
      registration.accountType === "Alumno" ? "Alumno" : "Profesor",
      ["Alumno", "Profesor", "Staff"].includes(registration.role)
        ? registration.role
        : "Profesor",
      registration.institutionalCode,
      registration.affiliation,
      registration.status === "Cancelado" ? "Cancelado" : "Confirmado",
      registration.qrToken ?? null,
      registration.confirmationEmailSentAt
        ? isoDate(registration.confirmationEmailSentAt, "")
        : "",
      isoDate(registration.createdAt),
    ],
  );
}

async function getRegistrations() {
  try {
    const snapshot = await callRegistrationService({
      action: "listRegistrations",
    });
    return { registrations: snapshot.registrations ?? [], complete: true };
  } catch {
    const rows = await sql.query(
      `SELECT DISTINCT LOWER(participant_email) AS email
         FROM activity_enrollments
        WHERE status = 'Confirmado'
        ORDER BY email`,
    );
    const emails = rows.map((row) => row.email);
    const registrations = [];

    for (let index = 0; index < emails.length; index += 5) {
      const results = await Promise.all(
        emails.slice(index, index + 5).map((email) =>
          callRegistrationService({ action: "lookup", email }),
        ),
      );
      for (const result of results) {
        if (result.registration) registrations.push(result.registration);
      }
    }

    return { registrations, complete: false };
  }
}

const { registrations, complete } = await getRegistrations();
for (const registration of registrations) {
  await saveRegistration(registration);
}

const [mirrorStatus] = await sql.query(
  `SELECT COUNT(*)::INTEGER AS total,
          COUNT(qr_token)::INTEGER AS with_qr
     FROM participants`,
);

console.log(
  `${registrations.length} participantes sincronizados. ` +
    (complete
      ? "La copia completa quedó actualizada."
      : "Se sincronizaron los participantes con inscripciones; publica Code.gs para habilitar la copia completa.") +
    ` Espejo actual: ${mirrorStatus.total} participantes, ${mirrorStatus.with_qr} con QR.`,
);
