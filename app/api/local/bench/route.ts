import { NextResponse } from "next/server";
import { getLocalBench, STATE_BY_CODE, LOCAL_BENCH } from "@/lib/local";
import { ADMINS } from "@/lib/seo-catalog";

/** GET /api/local/bench?metric=inflation&state=OH&month=20 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const metric = u.searchParams.get("metric") || "";
  const state = (u.searchParams.get("state") || "").toUpperCase();
  const month = Math.max(0, Math.min(47, parseInt(u.searchParams.get("month") || "0", 10) || 0));
  if (!LOCAL_BENCH.has(metric) || !STATE_BY_CODE.has(state)) return NextResponse.json({ ok: false }, { status: 400 });
  const r = await getLocalBench(metric, state, month, ADMINS).catch(() => null);
  if (!r) return NextResponse.json({ ok: false }, { status: 503 });
  return NextResponse.json({ ok: true, ...r }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=21600" } });
}
