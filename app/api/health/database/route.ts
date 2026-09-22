import { NextResponse } from "next/server";

import { getDatabaseUrl, getSql } from "@/lib/db";

export async function GET() {
  const connectionString = getDatabaseUrl();

  if (!connectionString) {
    return NextResponse.json(
      { configured: false, connected: false },
      { status: 503 },
    );
  }

  try {
    const rows = await getSql().query(
      "SELECT COUNT(*)::INTEGER AS activities FROM activities",
    );

    return NextResponse.json({
      configured: true,
      connected: true,
      activities: rows[0]?.activities ?? 0,
    });
  } catch (error) {
    console.error(
      "[database-health]",
      error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error",
    );
    return NextResponse.json(
      { configured: true, connected: false },
      { status: 503 },
    );
  }
}
