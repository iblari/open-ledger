import { NextResponse } from "next/server";
import { getRadar } from "@/lib/agenda-radar";

/** GET /api/radar — the agenda radar (cached 15 min). */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const radar = await getRadar();
    return NextResponse.json(radar, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
