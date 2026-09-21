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

export async function getProgramFromSheets(): Promise<ProgramItem[]> {
  const documentId = process.env.GOOGLE_SHEETS_DOCUMENT_ID?.trim();
  const url = process.env.GOOGLE_SHEETS_PROGRAM_CSV_URL?.trim();
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY?.trim();

  if (!url && !(documentId && apiKey)) {
    return fallbackProgram();
  }

  try {
    const response = await fetch(
      url ??
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(documentId!)}/values/${encodeURIComponent("Programa!A:U")}?key=${encodeURIComponent(apiKey!)}`,
      {
      next: { revalidate: 60 },
      },
    );

    if (!response.ok) {
      throw new Error(`Google Sheets respondió ${response.status}`);
    }

    const rows = url
      ? parseCsv(await response.text())
      : ((await response.json()) as { values?: string[][] }).values ?? [];
    const headerIndex = rows.findIndex(
      (row) =>
        row.includes("id") &&
        row.includes("tipo") &&
        row.includes("título"),
    );

    if (headerIndex === -1) {
      throw new Error("No se encontraron los encabezados del programa.");
    }

    const headers = rows[headerIndex].map((header) =>
      header.trim().toLowerCase(),
    );

    const column = (name: string) => headers.indexOf(name);

    const program = rows
      .slice(headerIndex + 1)
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
    return fallbackProgram();
  }
}
