import { getSql, hasDatabaseConfiguration } from "@/lib/db";

export type ParticipantSummary = { count: number | null; checkedAt: string };

export async function getParticipantSummary(): Promise<ParticipantSummary> {
  const checkedAt = new Date().toISOString();
  if (!hasDatabaseConfiguration()) return { count: null, checkedAt };
  try {
    const rows = await getSql().query(
      "SELECT COUNT(DISTINCT LOWER(email))::INTEGER AS count FROM participants WHERE status = 'Confirmado'",
    );
    return { count: Number(rows[0].count), checkedAt };
  } catch {
    return { count: null, checkedAt };
  }
}
