export type SpeakerProfile = {
  activityId: number;
  order: number;
  name: string;
  biography: string;
  photoFileId?: string;
};

const driveFileIdPattern = /^[A-Za-z0-9_-]{10,200}$/;

function driveFileId(value: string) {
  const input = value.trim();
  if (driveFileIdPattern.test(input)) return input;
  const path = input.match(/\/d\/([A-Za-z0-9_-]{10,200})/);
  if (path) return path[1];
  try {
    const id = new URL(input).searchParams.get("id") ?? "";
    return driveFileIdPattern.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}

export function parseSpeakerProfiles(rows: string[][]): SpeakerProfile[] {
  const headerIndex = rows.findIndex((row) => {
    const headers = row.map((value) => value.trim().toLowerCase());
    return headers.includes("idactividad") && headers.includes("nombre") &&
      headers.includes("semblanza") && headers.includes("visible");
  });
  if (headerIndex < 0) throw new Error("Faltan los encabezados de la hoja Ponentes.");
  const headers = rows[headerIndex].map((value) => value.trim().toLowerCase());
  const column = (name: string) => headers.indexOf(name);
  const profiles = rows.slice(headerIndex + 1).flatMap((row): SpeakerProfile[] => {
    const visible = row[column("visible")]?.trim().toLowerCase();
    const activityId = Number(row[column("idactividad")]);
    const name = row[column("nombre")]?.trim() ?? "";
    const biography = row[column("semblanza")]?.trim() ?? "";
    if (!["sí", "si", "true", "1"].includes(visible) ||
      !Number.isSafeInteger(activityId) || activityId < 1 || !name || !biography) return [];
    const rawOrder = Number(row[column("orden")]);
    const order = Number.isSafeInteger(rawOrder) && rawOrder > 0 ? rawOrder : 1;
    const photoFileId = driveFileId(row[column("fotofileid")] ?? "");
    return [{ activityId, order, name: name.slice(0, 160),
      biography: biography.slice(0, 1200), ...(photoFileId ? { photoFileId } : {}) }];
  });
  return profiles.sort((a, b) => a.activityId - b.activityId || a.order - b.order ||
    a.name.localeCompare(b.name, "es"));
}
