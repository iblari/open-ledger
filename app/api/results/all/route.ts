import { NextResponse } from "next/server";
import { MID, raceTitle } from "@/lib/midterms";
import { getResults } from "@/lib/results";

/** GET /api/results/all → every Senate/governor race with its latest official counts (null if none yet). */
export const dynamic = "force-dynamic";

export async function GET() {
  const res = await getResults(MID.races.map(r => r.id));
  const races = MID.races.map(r => ({
    id: r.id, st: r.st, state: r.state, office: r.office, title: raceTitle(r),
    cands: r.candidates.filter(c => c.main).map(c => ({ name: c.name, p: c.p })),
    result: res[r.id],
  }));
  return NextResponse.json({ races, at: new Date().toISOString() }, { headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40" } });
}
