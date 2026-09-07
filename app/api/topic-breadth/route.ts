import { NextResponse } from "next/server";
import { getLedgerHealed } from "@/lib/live-kv";
import { computeBreadth, rollingBreadth, eligible, broadcastsNeeded } from "@/lib/topic-breadth";

/**
 * GET /api/topic-breadth — how widely each subject is being raised.
 *
 * Breadth counts BROADCASTS, not claims: one themed speech scores the same as
 * any other appearance, so a single long event cannot pass for salience the way
 * it does in claim share.
 *
 * `?topic=X&window=5` adds the rolling series for one subject, indexed by
 * broadcast rather than by date — coverage is uneven and a day without a
 * broadcast says nothing about attention.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const topic = url.searchParams.get("topic");
  const window = Math.min(20, Math.max(2, Number(url.searchParams.get("window")) || 5));

  const ledger = await getLedgerHealed();
  const broadcasts = ledger.map(e => ({
    videoId: e.videoId, title: e.title, startedAt: e.startedAt,
    claims: e.claims.map(c => ({ quote: c.quote })),
  }));

  const topics = computeBreadth(broadcasts);
  const usable = eligible(broadcasts);

  return NextResponse.json({
    ok: true,
    broadcasts: usable.length,
    // Stated because it is the denominator, and a broadcast that produced no
    // claims is a coverage failure rather than evidence a topic went unmentioned.
    excludedNoClaims: broadcasts.length - usable.length,
    topics,
    ...(topic ? { series: { topic, window, points: rollingBreadth(broadcasts, topic, window) } } : {}),
    // Shipped with the data so a reader cannot take a wobble for a trend: a
    // 40%-to-60% move looks convincing long before it is distinguishable.
    power: {
      note: "broadcasts needed per period, two-proportion, alpha .05, power .8",
      "20%->70%": broadcastsNeeded(0.2, 0.7),
      "30%->60%": broadcastsNeeded(0.3, 0.6),
      "40%->60%": broadcastsNeeded(0.4, 0.6),
    },
  });
}
