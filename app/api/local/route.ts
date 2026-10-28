import { NextResponse } from "next/server";
import { getLocalSnapshot, STATE_BY_CODE } from "@/lib/local";

/**
 * GET /api/local?state=OH&housing=renter
 * The official local figures for one state (regional where no state figure
 * exists). Public, cached at the edge for an hour.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const state = (u.searchParams.get("state") || "").toUpperCase();
  const housing = u.searchParams.get("housing") === "owner" ? "owner" : "renter";
  if (!STATE_BY_CODE.has(state)) return NextResponse.json({ ok: false, error: "Unknown state. Use a two-letter code, e.g. OH." }, { status: 400 });
  const snap = await getLocalSnapshot(state, housing).catch(() => null);
  if (!snap) return NextResponse.json({ ok: false, error: "Local data unavailable" }, { status: 503 });
  return NextResponse.json({ ok: true, ...snap }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=21600" } });
}
