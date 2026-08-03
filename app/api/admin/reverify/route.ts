import { NextRequest, NextResponse } from "next/server";
import { getRecentBroadcasts, setRecentBroadcasts, type LiveClaim } from "@/lib/live-kv";
import { lookupBenchmark, formatBenchValue, rateAgainstBenchmark } from "@/lib/benchmark-verify";
import { verifyClaimOnWeb } from "@/lib/web-verify";

export const maxDuration = 300;

/**
 * POST /api/admin/reverify  (auth: ADMIN_KEY)   { limit?: number }
 *
 * Re-runs the CURRENT verification chain over claims already sitting in the
 * 72-hour replay archive. Claims are stored with the verdict they got at
 * ingest time, so improvements to the pipeline don't reach yesterday's
 * broadcasts — this backfills them.
 *
 * Idempotent: only touches claims still marked UNVERIFIABLE, so it can be
 * called repeatedly until the archive is drained (each call is bounded so it
 * finishes well inside the function timeout).
 */
export async function POST(req: NextRequest) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || req.headers.get("authorization") !== `Bearer ${adminKey}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Number(body.limit) || 8, 12);
  const origin = new URL(req.url).origin;

  const broadcasts = await getRecentBroadcasts();
  const before = { UNVERIFIABLE: 0, other: 0 };
  for (const b of broadcasts) {
    for (const c of b.claims) {
      if (c.rating === "UNVERIFIABLE") before.UNVERIFIABLE++; else before.other++;
    }
  }

  // Collect the work queue across all broadcasts, oldest-first for stability.
  const queue: { b: (typeof broadcasts)[number]; c: LiveClaim }[] = [];
  for (const b of broadcasts) {
    for (const c of b.claims) {
      if (c.rating === "UNVERIFIABLE" && !c.webVerified) queue.push({ b, c });
    }
  }
  const batch = queue.slice(0, limit);

  let benchFixed = 0, webFixed = 0;
  await Promise.all(batch.map(async ({ c }) => {
    // Tier 1b — free, instant, authoritative. Try our own series first.
    if (c.metricKey) {
      const hit = await lookupBenchmark(origin, c.metricKey, c.admin ?? null, c.year ?? null);
      if (hit) {
        const shown = formatBenchValue(hit.value, hit.unit);
        c.actual = `${shown} — ${hit.label} for ${hit.adminName} at month ${hit.monthOfTerm} of the term (~${hit.approxYear}), per FRED.`;
        c.verifiedFromSource = true;
        c.groundTruth = { value: hit.value, year: hit.approxYear, metricKey: c.metricKey, source: "FRED" };
        if (typeof c.claimedValue === "number") {
          c.rating = rateAgainstBenchmark(c.claimedValue, hit.value, hit.unit);
          benchFixed++;
          return; // settled from our data — no need to spend a search
        }
      }
    }
    // Tier 3 — the live web, citations mandatory.
    const v = await verifyClaimOnWeb(c, { timeoutMs: 40_000, maxSearches: 3 });
    if (v) {
      c.rating = v.rating;
      c.confidence = v.confidence;
      c.actual = v.actual;
      c.explanation = v.explanation || c.explanation;
      c.sources = v.sources;
      c.webVerified = true;
      webFixed++;
    }
  }));

  // Persist the mutated array directly. (archiveBroadcast() would merge by
  // claim id and drop these in-place updates as "already seen".)
  await setRecentBroadcasts(broadcasts);

  const after = { UNVERIFIABLE: 0, other: 0 };
  for (const b of await getRecentBroadcasts()) {
    for (const c of b.claims) {
      if (c.rating === "UNVERIFIABLE") after.UNVERIFIABLE++; else after.other++;
    }
  }

  return NextResponse.json({
    ok: true,
    processed: batch.length,
    remaining: Math.max(0, queue.length - batch.length),
    benchFixed, webFixed,
    unverifiable: { before: before.UNVERIFIABLE, after: after.UNVERIFIABLE },
  });
}
