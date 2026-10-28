import { NextResponse } from "next/server";
import { getLocalAnnual, STATE_BY_CODE, LOCAL_ANNUAL } from "@/lib/local";

/** GET /api/local/annual?metric=gas&state=CO — regional annual series for the Data tab. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const metric = u.searchParams.get("metric") || "";
  const state = (u.searchParams.get("state") || "").toUpperCase();
  if (!LOCAL_ANNUAL.has(metric) || !STATE_BY_CODE.has(state)) return NextResponse.json({ ok: false }, { status: 400 });
  const r = await getLocalAnnual(metric, state).catch(() => null);
  if (!r) return NextResponse.json({ ok: false }, { status: 503 });
  return NextResponse.json({ ok: true, ...r }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=21600" } });
}
