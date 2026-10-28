import { NextResponse } from "next/server";
import { getLocalTerm, STATE_BY_CODE, LOCAL_BENCH } from "@/lib/local";
import { ADMINS } from "@/lib/seo-catalog";

/** GET /api/local/term?metric=gas&state=CO — your region across the current term. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const metric = u.searchParams.get("metric") || "";
  const state = (u.searchParams.get("state") || "").toUpperCase();
  if (!LOCAL_BENCH.has(metric) || !STATE_BY_CODE.has(state)) return NextResponse.json({ ok: false }, { status: 400 });
  const start = ADMINS[ADMINS.length - 1].start;
  const r = await getLocalTerm(metric, state, start).catch(() => null);
  if (!r) return NextResponse.json({ ok: false }, { status: 503 });
  return NextResponse.json({ ok: true, ...r }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=21600" } });
}
