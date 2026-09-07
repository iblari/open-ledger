import { NextResponse } from "next/server";
import { getLedger } from "@/lib/live-kv";
import { findRepeats, type RepeatOccurrence } from "@/lib/repeat-claims";

/**
 * GET /api/repeats — claims the same speaker (or another) has made before.
 *
 * Deliberately descriptive. Counts of things that happened need no sample-size
 * caveat, unlike the accuracy rates elsewhere in the ledger, which at ten
 * broadcasts cannot support a trend.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const ledger = await getLedger();
  const all: RepeatOccurrence[] = [];
  for (const e of ledger) {
    for (const c of e.claims) {
      if (!c.quote) continue;
      all.push({
        quote: c.quote,
        rating: (c.rating || "").toUpperCase(),
        speaker: e.speaker,
        day: e.startedAt.slice(0, 10),
        videoId: e.videoId,
        title: e.title,
      });
    }
  }

  const { clusters, drift } = findRepeats(all);
  const repeated = clusters.reduce((n, c) => n + c.occurrences.length, 0);

  return NextResponse.json({
    ok: true,
    totals: {
      claims: all.length,
      repeatedClaims: repeated,
      clusters: clusters.length,
      // How often one assertion drew different verdicts on different days.
      // This measures OUR consistency, not the speaker's.
      inconsistentlyRated: clusters.filter(c => c.verdictInconsistent).length,
    },
    clusters,
    drift,
  });
}
