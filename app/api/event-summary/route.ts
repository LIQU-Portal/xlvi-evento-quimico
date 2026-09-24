import { getParticipantSummary } from "@/lib/event-summary";

export async function GET() {
  const summary = await getParticipantSummary();
  return Response.json(summary, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30" },
  });
}
