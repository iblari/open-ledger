import { NextResponse } from "next/server";
import { MID } from "@/lib/midterms";
import { getResults, setResult, pollsCloseAt, raceById, type RaceResult } from "@/lib/results";

/**
 * GET  /api/results?st=NJ          → that state's races: polls-close time + latest official counts (if any)
 * POST /api/results (ADMIN_KEY)    → { raceId, pctCounted, cands:[{name,votes}], called?, source, sourceUrl? }
 */
export const dynamic = "force-dynamic";
const RESULTS_DESK_HASH = "deccc64c4fa585db99700967c7fd02c115bb829997552de3f7dc70b46fcc4e9e";

export async function GET(req: Request) {
  const st = (new URL(req.url).searchParams.get("st") || "").toUpperCase();
  const races = MID.races.filter(r => r.st === st);
  const res = await getResults(races.map(r => r.id));
  return NextResponse.json({
    st, closesAt: pollsCloseAt(st),
    races: races.map(r => ({ id: r.id, office: r.office, special: r.special, result: res[r.id] })),
  }, { headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40" } });
}

export async function POST(req: Request) {
  // ADMIN_KEY, or the results-desk key (only its SHA-256 lives here).
  const auth = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const k = process.env.ADMIN_KEY;
  const h = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(auth))).toString("hex");
  if (!auth || !((k && auth === k) || h === RESULTS_DESK_HASH)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null) as Partial<RaceResult> | null;
  const race = b?.raceId ? raceById(b.raceId) : undefined;
  if (!race || !Array.isArray(b?.cands) || !b?.source) return NextResponse.json({ error: "raceId, cands, source required" }, { status: 400 });
  const known = new Map(race.candidates.map(c => [c.name.toLowerCase(), c]));
  const cands = b.cands.map(c => ({ name: String(c.name), p: known.get(String(c.name).toLowerCase())?.p || String(c.p || ""), votes: Math.max(0, Math.round(Number(c.votes) || 0)) }));
  const r: RaceResult = { raceId: race.id, updatedAt: new Date().toISOString(), pctCounted: b.pctCounted == null ? null : Math.max(0, Math.min(100, Number(b.pctCounted))), cands, called: b.called ?? null, source: String(b.source), sourceUrl: b.sourceUrl ?? null };
  await setResult(r);
  return NextResponse.json({ ok: true, result: r });
}
