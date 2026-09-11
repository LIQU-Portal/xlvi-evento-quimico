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

export async function getProgramFromSheets(): Promise<ProgramItem[]> {
  const url = process.env.GOOGLE_SHEETS_PROGRAM_CSV_URL;

  if (!url) {
    return fallbackProgram();
  }

  try {
    const response = await fetch(url, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Google Sheets respondió ${response.status}`);
    }

    const rows = parseCsv(await response.text());
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