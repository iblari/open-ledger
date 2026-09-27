import { getLiveState, getLedger } from "@/lib/live-kv";
import LiveTakeover, { type LiveNow } from "@/components/LiveTakeover";
import LandingPage from "@/components/landing/LandingPage";
import type { LatestBroadcast } from "@/components/landing/LivePromo";

/**
 * / — the landing page, with a live broadcast band above it when one is running.
 *
 * This file exists to be a SERVER component. The landing itself is client-side
 * (charts, toggles, a mobile branch), and a live check made there would paint
 * the ordinary hero and swap it after hydration — showing the wrong page to
 * exactly the visitor the band is for. Resolving it here means the band is in
 * the first byte of HTML, which is what /live already does for its two states.
 *
 * force-dynamic because the answer changes the moment a broadcast starts or
 * ends, and a cached homepage would advertise a broadcast that finished or miss
 * one that began.
 */
export const dynamic = "force-dynamic";

async function liveNow(): Promise<LiveNow | null> {
  try {
    const s = await getLiveState();
    if (!s || s.status !== "live") return null;
    return {
      title: s.title || "Live broadcast",
      startedAt: s.startedAt || new Date().toISOString(),
    };
  } catch {
    // A KV failure must not take the homepage down with it. No band is a
    // correct-looking page; an error is not.
    return null;
  }
}

/** Newest broadcast that produced claims — the card in the mobile Live
 *  Broadcast teaser. Server-side so the card is in the first paint. */
async function latestBroadcast(): Promise<LatestBroadcast | null> {
  try {
    // Ledger order is when a broadcast was RECORDED; a recovered replay can be
    // recorded after a newer one. The card should show the newest event.
    const e = (await getLedger())
      .filter(x => x.counts.total > 0)
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
    if (!e) return null;
    return {
      videoId: e.videoId, title: e.title, startedAt: e.startedAt, speaker: e.speaker,
      counts: { t: e.counts.true, m: e.counts.misleading, f: e.counts.false }, total: e.counts.total,
    };
  } catch {
    return null;
  }
}

export default async function Page() {
  const [live, latest] = await Promise.all([liveNow(), latestBroadcast()]);
  return (
    <>
      <LiveTakeover live={live} />
      <LandingPage latest={latest} />
    </>
  );
}
