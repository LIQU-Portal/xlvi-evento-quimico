const EVENT_TIME_ZONE_OFFSET = "-06:00";
const ALLOWED_SUBMISSION_HOSTS = new Set(["docs.google.com", "forms.gle"]);

export function parseEventDateTime(value?: string): Date | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  const match = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))$/,
  );
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const parsed = new Date(
    `${year}-${month}-${day}T${hour.padStart(2, "0")}:${minute}:00${EVENT_TIME_ZONE_OFFSET}`,
  );

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isSubmissionBeforeDeadline(
  deadline: string | undefined,
  now = new Date(),
): boolean {
  if (!String(deadline ?? "").trim()) return true;
  const parsed = parseEventDateTime(deadline);
  return Boolean(parsed && now.getTime() < parsed.getTime());
}

export function getSafeSubmissionUrl(value?: string): URL | null {
  try {
    const url = new URL(String(value ?? "").trim());
    if (url.protocol !== "https:" || !ALLOWED_SUBMISSION_HOSTS.has(url.hostname)) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}
