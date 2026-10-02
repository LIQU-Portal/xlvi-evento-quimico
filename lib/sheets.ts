import { content, type ProgramItem, type ProgramType } from "@/config/content";

const programTypes = new Set<ProgramType>([
  "Conferencia",
  "Taller",
  "Concurso",
  "Actividad",
]);

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let insideQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    const nextCharacter = csv[index + 1];

    if (character === '"' && insideQuotes && nextCharacter === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      insideQuotes = !insideQuotes;
    } else if (character === "," && !insideQuotes) {
      row.push(value);
      value = "";
    } else if (character === "\n" && !insideQuotes) {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (value || row.length) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows;
}

function fallbackProgram(): ProgramItem[] {
  return content.program.map((item) => ({ ...item }));
}

function parseCheckbox(value: string | undefined): boolean {
  return ["sí", "si", "true", "1"].includes(
    String(value ?? "")
      .trim()
      .toLowerCase(),
  );
}

function getDriveFileId(value: string | undefined): string | undefined {
  const input = String(value ?? "").trim();

  if (/^[A-Za-z0-9_-]{10,200}$/.test(input)) return input;

  const pathMatch = input.match(/\/d\/([A-Za-z0-9_-]{10,200})/);
  if (pathMatch) return pathMatch[1];

  try {
    const fileId = new URL(input).searchParams.get("id") ?? "";
    return /^[A-Za-z0-9_-]{10,200}$/.test(fileId) ? fileId : undefined;
  } catch {
    return undefined;
  }
}

type ProgramLoadOptions = {
  fresh?: boolean;
  allowFallback?: boolean;
};

type ProgramSheet = {
  rows: string[][];
  column: (name: string) => number;
};

export type ActivityResourceConfig = {
  activityId: number;
  title: string;
  type: ProgramType;
  callForEntriesFileId?: string;
  submissionUrl?: string;
  submissionLabel: string;
  submissionDeadline?: string;
  submissionEnabled: boolean;
};

async function loadProgramSheet(
  options: ProgramLoadOptions = {},
): Promise<ProgramSheet> {
  const documentId = process.env.GOOGLE_SHEETS_DOCUMENT_ID?.trim();
  const url = process.env.GOOGLE_SHEETS_PROGRAM_CSV_URL?.trim();
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY?.trim();

  if (!url && !(documentId && apiKey)) {
    throw new Error("Falta configurar la fuente del programa.");
  }

  const response = await fetch(
    url ??
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(documentId!)}/values/${encodeURIComponent("Programa!A:Z")}?key=${encodeURIComponent(apiKey!)}`,
    options.fresh ? { cache: "no-store" } : { next: { revalidate: 60 } },
  );

  if (!response.ok) {
    throw new Error(`Google Sheets respondió ${response.status}`);
  }

  const allRows = url
    ? parseCsv(await response.text())
    : ((await response.json()) as { values?: string[][] }).values ?? [];
  const headerIndex = allRows.findIndex(
    (row) => row.includes("id") && row.includes("tipo") && row.includes("título"),
  );

  if (headerIndex === -1) {
    throw new Error("No se encontraron los encabezados del programa.");
  }

  const headers = allRows[headerIndex].map((header) =>
    header.trim().toLowerCase(),
  );

  return {
    rows: allRows.slice(headerIndex + 1),
    column: (name: string) => headers.indexOf(name),
  };
}

export async function getProgramFromSheets(
  options: ProgramLoadOptions = {},
): Promise<ProgramItem[]> {
  if (
    !process.env.GOOGLE_SHEETS_PROGRAM_CSV_URL?.trim() &&
    !(
      process.env.GOOGLE_SHEETS_DOCUMENT_ID?.trim() &&
      process.env.GOOGLE_SHEETS_API_KEY?.trim()
    )
  ) {
    if (options.allowFallback === false) {
      throw new Error("Falta configurar la fuente del programa.");
    }
    return fallbackProgram();
  }

  try {
    const { rows, column } = await loadProgramSheet(options);

    const program = rows
      .filter((row) => row.some((cell) => cell.trim()))
      .filter((row) => {
        const visible = row[column("visible")]?.trim().toLowerCase();
        const status = row[column("estado")]?.trim().toLowerCase();

        return (
          ["sí", "si", "true", "1"].includes(visible) &&
          ["provisional", "confirmado"].includes(status)
        );
      })
      .map((row, index): ProgramItem | null => {
        const type = row[column("tipo")]?.trim() as ProgramType;
        const title = row[column("título")]?.trim();

        if (!programTypes.has(type) || !title) {
          return null;
        }

        const capacity = row[column("cupo")]?.trim();
        const flyerFileId = getDriveFileId(row[column("flyerfileid")]);
        const registrationCapacity = Number(
          row[column("capacidad")]?.trim(),
        );
        const capacityUnit =
          row[column("unidadcupo")]?.trim().toLowerCase() === "equipos"
            ? "equipos"
            : "personas";
        const minMembers = Number(row[column("minintegrantes")]?.trim());
        const maxMembers = Number(row[column("maxintegrantes")]?.trim());
        const date = row[column("fecha")]?.trim();
        const statusValue = row[column("estado")]?.trim().toLowerCase();
        const callForEntriesFileId = getDriveFileId(
          row[column("convocatoriafileid")],
        );
        const submissionUrl = row[column("enlaceentrega")]?.trim();
        const submissionLabel = row[column("textoenlaceentrega")]?.trim();
        const submissionDeadline = row[column("fechalimiteentrega")]?.trim();

        return {
          id: Number(row[column("id")]) || index + 1,
          date: date || undefined,
          day: row[column("día")]?.trim() || "Fecha por confirmar",
          time: row[column("hora")]?.trim() || "Horario por confirmar",
          type,
          title,
          description:
            row[column("descripción")]?.trim() ||
            "Descripción por confirmar",
          person:
            row[column("ponente/responsable")]?.trim() ||
            "Responsable por confirmar",
          place:
            row[column("lugar")]?.trim() || "Lugar por confirmar",
          status: statusValue === "confirmado" ? "Confirmado" : "Provisional",
          ...(capacity ? { capacity } : {}),
          ...(flyerFileId ? { flyerFileId } : {}),
          ...(row[column("descripcioncompleta")]?.trim()
            ? {
                fullDescription: row[column("descripcioncompleta")].trim(),
              }
            : {}),
          ...(Number.isInteger(registrationCapacity) &&
          registrationCapacity > 0
            ? { registrationCapacity }
            : {}),
          registrationEnabled: parseCheckbox(
            row[column("inscripcionhabilitada")],
          ),
          capacityUnit,
          minMembers:
            Number.isInteger(minMembers) && minMembers > 0 ? minMembers : 1,
          maxMembers:
            Number.isInteger(maxMembers) && maxMembers >= minMembers
              ? maxMembers
              : 1,
          hasCallForEntries: Boolean(callForEntriesFileId),
          hasSubmissionLink: Boolean(submissionUrl),
          submissionEnabled: parseCheckbox(
            row[column("entregahabilitada")],
          ),
          ...(submissionLabel ? { submissionLabel } : {}),
          ...(submissionDeadline ? { submissionDeadline } : {}),
          ...(row[column("aperturaregistro")]?.trim()
            ? {
                registrationOpenAt: row[column("aperturaregistro")].trim(),
              }
            : {}),
          ...(row[column("cierreregistro")]?.trim()
            ? {
                registrationCloseAt: row[column("cierreregistro")].trim(),
              }
            : {}),
        };
      })
      .filter((item): item is ProgramItem => item !== null);

    //return program.length ? program : fallbackProgram();
    return program;
  } catch (error) {
    console.error("No fue posible cargar el programa desde Sheets:", error);
    if (options.allowFallback === false) throw error;
    return fallbackProgram();
  }
}

export async function getActivityResourceConfig(
  activityId: number,
  options: ProgramLoadOptions = { fresh: true, allowFallback: false },
): Promise<ActivityResourceConfig | null> {
  const { rows, column } = await loadProgramSheet(options);
  const row = rows.find(
    (candidate) => Number(candidate[column("id")]) === activityId,
  );

  if (!row) return null;

  const type = row[column("tipo")]?.trim() as ProgramType;
  const title = row[column("título")]?.trim();
  if (!programTypes.has(type) || !title) return null;

  const callForEntriesFileId = getDriveFileId(
    row[column("convocatoriafileid")],
  );
  const submissionUrl = row[column("enlaceentrega")]?.trim();
  const submissionDeadline = row[column("fechalimiteentrega")]?.trim();
  const submissionLabel =
    row[column("textoenlaceentrega")]?.trim() || "Enviar participación";

  return {
    activityId,
    title,
    type,
    ...(callForEntriesFileId ? { callForEntriesFileId } : {}),
    ...(submissionUrl ? { submissionUrl } : {}),
    submissionLabel,
    ...(submissionDeadline ? { submissionDeadline } : {}),
    submissionEnabled: parseCheckbox(row[column("entregahabilitada")]),
  };
}
