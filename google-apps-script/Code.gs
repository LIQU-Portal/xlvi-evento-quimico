const REGISTRATIONS_SHEET = "Registros";
const STAFF_SHEET = "Staff";
const REGISTRATION_HEADERS = [
  "id",
  "createdAt",
  "updatedAt",
  "email",
  "name",
  "accountType",
  "role",
  "institutionalCode",
  "affiliation",
  "status",
  "confirmationEmailSentAt",
];
const STAFF_HEADERS = ["email", "name", "active"];
const DEFAULT_EVENT_BASE_URL = "https://xlvi-evento-quimico.vercel.app";

function setupSheets() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error("Abre el script desde la hoja de registros.");

  PropertiesService.getScriptProperties().setProperty(
    "REGISTRATION_SPREADSHEET_ID",
    spreadsheet.getId(),
  );
  ensureSheet_(spreadsheet, REGISTRATIONS_SHEET, REGISTRATION_HEADERS);
  ensureSheet_(spreadsheet, STAFF_SHEET, STAFF_HEADERS);
}

function checkEmailQuota() {
  Logger.log(`Correos disponibles hoy: ${MailApp.getRemainingDailyQuota()}`);
}

function doPost(event) {
  const lock = LockService.getScriptLock();

  try {
    const payload = JSON.parse(event.postData.contents || "{}");
    validateSecret_(payload.secret);

    if (payload.action === "lookup") {
      return json_(lookup_(payload.email));
    }

    if (payload.action === "lookupMany") {
      return json_(lookupMany_(payload.emails));
    }

    if (payload.action === "register") {
      lock.waitLock(10000);
      return json_(register_(payload));
    }

    if (payload.action === "sendConfirmation") {
      lock.waitLock(10000);
      return json_(sendConfirmation_(payload));
    }

    return json_({ ok: false, message: "Acción no reconocida." });
  } catch (error) {
    return json_({
      ok: false,
      message: error && error.message ? error.message : String(error),
    });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function lookup_(rawEmail) {
  const email = normalizeEmail_(rawEmail);
  const spreadsheet = getSpreadsheet_();
  const registrations = ensureSheet_(
    spreadsheet,
    REGISTRATIONS_SHEET,
    REGISTRATION_HEADERS,
  );
  const staff = ensureSheet_(spreadsheet, STAFF_SHEET, STAFF_HEADERS);

  const entry = findRegistrationEntry_(registrations, email);

  return {
    ok: true,
    registration: entry ? entry.registration : null,
    isStaff: isStaff_(staff, email),
  };
}

function lookupMany_(rawEmails) {
  if (!Array.isArray(rawEmails) || rawEmails.length < 1 || rawEmails.length > 5) {
    throw new Error("EnvÃ­a entre 1 y 5 correos institucionales.");
  }

  const emails = rawEmails.map(normalizeEmail_);
  if (new Set(emails).size !== emails.length) {
    throw new Error("No repitas correos dentro del equipo.");
  }

  const spreadsheet = getSpreadsheet_();
  const registrations = ensureSheet_(spreadsheet, REGISTRATIONS_SHEET, REGISTRATION_HEADERS);
  const values = registrations.getDataRange().getDisplayValues();
  const byEmail = {};

  for (let row = 1; row < values.length; row += 1) {
    const email = String(values[row][3] || "").trim().toLowerCase();
    if (!emails.includes(email)) continue;
    byEmail[email] = {
      id: values[row][0], createdAt: values[row][1], email: values[row][3],
      name: values[row][4], accountType: values[row][5], role: values[row][6],
      institutionalCode: values[row][7], affiliation: values[row][8],
      status: values[row][9], confirmationEmailSentAt: values[row][10] || "",
    };
  }

  return {
    ok: true,
    registrations: emails.map(function (email) {
      const registration = byEmail[email] || null;
      return { email: email, registration: registration };
    }),
  };
}

function register_(payload) {
  const email = normalizeEmail_(payload.email);
  const name = requiredText_(payload.name, "nombre", 160);
  const accountType = payload.accountType === "Alumno" ? "Alumno" : "Profesor";
  const institutionalCode = requiredText_(
    payload.institutionalCode,
    "código de alumno o profesor",
    20,
  );
  const affiliation = requiredText_(payload.affiliation, "carrera", 120);
  const spreadsheet = getSpreadsheet_();
  const registrations = ensureSheet_(
    spreadsheet,
    REGISTRATIONS_SHEET,
    REGISTRATION_HEADERS,
  );
  const staff = ensureSheet_(spreadsheet, STAFF_SHEET, STAFF_HEADERS);
  const existingEntry = findRegistrationEntry_(registrations, email);

  if (existingEntry) {
    return {
      ok: true,
      registration: existingEntry.registration,
      isStaff: existingEntry.registration.role === "Staff",
      alreadyRegistered: true,
      confirmationEmailSent: Boolean(
        existingEntry.registration.confirmationEmailSentAt,
      ),
    };
  }

  const now = new Date();
  const role = isStaff_(staff, email) ? "Staff" : accountType;
  const registration = {
    id: createParticipantId_(),
    createdAt: now.toISOString(),
    email: email,
    name: name,
    accountType: accountType,
    role: role,
    institutionalCode: institutionalCode,
    affiliation: affiliation,
    status: "Confirmado",
    confirmationEmailSentAt: "",
  };
  registration.qrToken = createQrToken_(registration.id);

  registrations.appendRow([
    safeCellText_(registration.id),
    registration.createdAt,
    registration.createdAt,
    safeCellText_(registration.email),
    safeCellText_(registration.name),
    safeCellText_(registration.accountType),
    safeCellText_(registration.role),
    safeCellText_(registration.institutionalCode),
    safeCellText_(registration.affiliation),
    safeCellText_(registration.status),
    "",
  ]);

  return {
    ok: true,
    registration: registration,
    isStaff: role === "Staff",
    alreadyRegistered: false,
    confirmationEmailSent: false,
  };
}

function findRegistrationEntry_(sheet, email) {
  const values = sheet.getDataRange().getDisplayValues();

  for (let row = 1; row < values.length; row += 1) {
    if (normalizeEmail_(values[row][3]) === email) {
      const registration = {
        id: values[row][0],
        createdAt: values[row][1],
        email: values[row][3],
        name: values[row][4],
        accountType: values[row][5],
        role: values[row][6],
        institutionalCode: values[row][7],
        affiliation: values[row][8],
        status: values[row][9],
        confirmationEmailSentAt: values[row][10] || "",
      };
      registration.qrToken = createQrToken_(registration.id);

      return { registration: registration, rowNumber: row + 1 };
    }
  }

  return null;
}

function sendConfirmation_(payload) {
  const email = normalizeEmail_(payload.email);
  const qrToken = requiredText_(payload.qrToken, "token QR", 200);
  const qrImageBase64 = String(payload.qrImageBase64 || "").trim();
  const spreadsheet = getSpreadsheet_();
  const registrations = ensureSheet_(
    spreadsheet,
    REGISTRATIONS_SHEET,
    REGISTRATION_HEADERS,
  );
  const entry = findRegistrationEntry_(registrations, email);

  if (!entry || entry.registration.qrToken !== qrToken) {
    throw new Error("No fue posible validar el registro para enviar el correo.");
  }

  if (entry.registration.confirmationEmailSentAt) {
    return {
      ok: true,
      registration: entry.registration,
      confirmationEmailSent: true,
      emailMessage:
        "Tu registro ya existía y el correo de confirmación ya había sido enviado.",
    };
  }

  if (
    qrImageBase64.length < 100 ||
    qrImageBase64.length > 1500000 ||
    !/^[A-Za-z0-9+/=]+$/.test(qrImageBase64)
  ) {
    throw new Error("La imagen del QR no es válida.");
  }

  if (MailApp.getRemainingDailyQuota() < 1) {
    throw new Error("Se agotó la cuota diaria de correo.");
  }

  const qrBlob = Utilities.newBlob(
    Utilities.base64Decode(qrImageBase64),
    "image/png",
    `QR-${entry.registration.id}.png`,
  );
  sendConfirmationEmail_(entry.registration, qrBlob);

  const sentAt = new Date().toISOString();
  const emailColumn =
    REGISTRATION_HEADERS.indexOf("confirmationEmailSentAt") + 1;
  const updatedAtColumn = REGISTRATION_HEADERS.indexOf("updatedAt") + 1;
  registrations.getRange(entry.rowNumber, emailColumn).setValue(sentAt);
  registrations.getRange(entry.rowNumber, updatedAtColumn).setValue(sentAt);
  entry.registration.confirmationEmailSentAt = sentAt;

  return {
    ok: true,
    registration: entry.registration,
    confirmationEmailSent: true,
    emailMessage: "Tu registro quedó confirmado y enviamos tu código QR por correo.",
  };
}

function sendConfirmationEmail_(registration, qrBlob) {
  const accountUrl = `${getEventBaseUrl_()}/mi-cuenta`;
  const safeName = htmlEscape_(registration.name);
  const safeId = htmlEscape_(registration.id);
  const safeRole = htmlEscape_(registration.role);

  MailApp.sendEmail({
    to: registration.email,
    name: "Evento del Químico 2026",
    subject: "Registro confirmado | Evento del Químico 2026",
    body:
      `Hola ${registration.name},\n\n` +
      "Tu registro al Evento del Químico 2026 quedó confirmado.\n" +
      `ID de participante: ${registration.id}\n` +
      `Rol: ${registration.role}\n\n` +
      `Tu código QR personal está adjunto. También puedes consultarlo en ${accountUrl}\n\n` +
      "Química que evoluciona, futuro que se construye.",
    htmlBody:
      `<div style="font-family:Arial,sans-serif;color:#121f48;line-height:1.6;max-width:620px;margin:auto">` +
      `<p style="color:#6c2bd9;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Evento del Químico 2026</p>` +
      `<h1 style="font-size:30px;margin:0 0 18px">¡Tu registro está confirmado!</h1>` +
      `<p>Hola <strong>${safeName}</strong>, ya formas parte del XLVI Evento del Químico.</p>` +
      `<div style="background:#f4efff;border-radius:16px;padding:18px;margin:22px 0">` +
      `<div><strong>ID de participante:</strong> ${safeId}</div>` +
      `<div><strong>Rol:</strong> ${safeRole}</div>` +
      "</div>" +
      "<p>Este QR es único, personal e intransferible. Preséntalo para registrar tu acceso y asistencia.</p>" +
      `<p style="text-align:center"><img src="cid:participantQr" width="280" height="280" alt="Código QR personal"></p>` +
      `<p style="text-align:center"><a href="${accountUrl}" style="display:inline-block;background:#6c2bd9;color:white;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700">Abrir Mi cuenta</a></p>` +
      '<p style="margin-top:28px;color:#59627d">Química que evoluciona, futuro que se construye.</p>' +
      "</div>",
    inlineImages: { participantQr: qrBlob },
    attachments: [qrBlob.copyBlob()],
  });
}

function createQrToken_(participantId) {
  const secret = PropertiesService.getScriptProperties().getProperty(
    "REGISTRATION_QR_SECRET",
  );

  if (!secret) throw new Error("Falta configurar el secreto para firmar los QR.");

  const signature = Utilities.computeHmacSha256Signature(participantId, secret);
  const encodedSignature = Utilities.base64EncodeWebSafe(signature)
    .replace(/=+$/g, "")
    .slice(0, 32);

  return `EQ26:${participantId}:${encodedSignature}`;
}

function getEventBaseUrl_() {
  const configuredUrl = PropertiesService.getScriptProperties().getProperty(
    "EVENT_BASE_URL",
  );
  return String(configuredUrl || DEFAULT_EVENT_BASE_URL).replace(/\/$/, "");
}

function isStaff_(sheet, email) {
  const values = sheet.getDataRange().getDisplayValues();

  for (let row = 1; row < values.length; row += 1) {
    if (normalizeEmail_(values[row][0]) !== email) continue;

    const active = String(values[row][2]).trim().toLowerCase();
    return ["si", "sí", "true", "1", "activo"].includes(active);
  }

  return false;
}

function createParticipantId_() {
  return `EQ26-${Utilities.getUuid().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

function ensureSheet_(spreadsheet, name, headers) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  const currentHeaders = sheet
    .getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length))
    .getDisplayValues()[0];

  headers.forEach(function (header, index) {
    const currentHeader = String(currentHeaders[index] || "").trim();

    if (currentHeader && currentHeader !== header) {
      throw new Error(
        `La columna ${index + 1} de ${name} debe llamarse ${header}.`,
      );
    }

    if (!currentHeader) sheet.getRange(1, index + 1).setValue(header);
  });

  sheet.setFrozenRows(1);

  return sheet;
}

function getSpreadsheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(
    "REGISTRATION_SPREADSHEET_ID",
  );

  if (!spreadsheetId) {
    throw new Error("Primero ejecuta setupSheets desde la hoja de registros.");
  }

  return SpreadsheetApp.openById(spreadsheetId);
}

function validateSecret_(receivedSecret) {
  const expectedSecret = PropertiesService.getScriptProperties().getProperty(
    "REGISTRATION_API_SECRET",
  );

  if (!expectedSecret || receivedSecret !== expectedSecret) {
    throw new Error("Solicitud no autorizada.");
  }
}

function normalizeEmail_(value) {
  const email = String(value || "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    throw new Error("Correo institucional inválido.");
  }

  return email;
}

function requiredText_(value, fieldName, maxLength) {
  const text = String(value || "").trim();

  if (text.length < 2 || text.length > maxLength) {
    throw new Error(`El campo ${fieldName} no es válido.`);
  }

  return text;
}

function safeCellText_(value) {
  const text = String(value || "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function htmlEscape_(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
