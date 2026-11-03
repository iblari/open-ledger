import { NextResponse } from "next/server";
import { MID } from "@/lib/midterms";
import { getResults, setResult, pollsCloseAt, raceById, type RaceResult } from "@/lib/results";

/**
 * GET  /api/results?st=NJ          → that state's races: polls-close time + latest official counts (if any)
 * POST /api/results (ADMIN_KEY)    → { raceId, pctCounted, cands:[{name,votes}], called?, source, sourceUrl? }
 */
export const dynamic = "force-dynamic";

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
  const k = process.env.ADMIN_KEY;
  if (!k || req.headers.get("authorization") !== `Bearer ${k}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null) as Partial<RaceResult> | null;
  const race = b?.raceId ? raceById(b.raceId) : undefined;
  if (!race || !Array.isArray(b?.cands) || !b?.source) return NextResponse.json({ error: "raceId, cands, source required" }, { status: 400 });
  const known = new Map(race.candidates.map(c => [c.name.toLowerCase(), c]));
  const cands = b.cands.map(c => ({ name: String(c.name), p: known.get(String(c.name).toLowerCase())?.p || String(c.p || ""), votes: Math.max(0, Math.round(Number(c.votes) || 0)) }));
  const r: RaceResult = { raceId: race.id, updatedAt: new Date().toISOString(), pctCounted: b.pctCounted == null ? null : Math.max(0, Math.min(100, Number(b.pctCounted))), cands, called: b.called ?? null, source: String(b.source), sourceUrl: b.sourceUrl ?? null };
  await setResult(r);
  return NextResponse.json({ ok: true, result: r });
}
