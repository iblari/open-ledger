import { getLiveState } from "@/lib/live-kv";
import LiveTakeover, { type LiveNow } from "@/components/LiveTakeover";
import LandingPage from "@/components/landing/LandingPage";

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

export default async function Page() {
  const live = await liveNow();
  return (
    <>
      <LiveTakeover live={live} />
      <LandingPage />
    </>
  );
}
