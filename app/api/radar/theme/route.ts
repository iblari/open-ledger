import { NextResponse } from "next/server";
import { getThemeBrief } from "@/lib/theme-brief";

/** GET /api/radar/theme?key=oil_gas — 2–3 bullet summary of what is being
 *  said about one radar theme, each bullet linked to its moment. */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") || "";
  try {
    const b = await getThemeBrief(key);
    if (!b) return NextResponse.json({ error: "unavailable" }, { status: 404 });
    return NextResponse.json(b, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
