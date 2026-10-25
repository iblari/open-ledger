import { NextResponse } from "next/server";
import { buildShareKit } from "@/lib/share-kit";

/** GET /api/share-kit[?updated_since=ISO] — Sam's posting feed (see SAM.md).
 *  Public data only. Items carry stable ids; updated_since returns only
 *  claims first published, and metrics with new data, after that time. */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const updatedSince = new URL(req.url).searchParams.get("updated_since");
    return NextResponse.json(await buildShareKit({ updatedSince }), { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300", "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
