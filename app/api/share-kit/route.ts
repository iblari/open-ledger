import { NextResponse } from "next/server";
import { buildShareKit } from "@/lib/share-kit";

/** GET /api/share-kit — Sam's posting feed (see SAM.md). Public data only. */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json(await buildShareKit(), { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800", "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
