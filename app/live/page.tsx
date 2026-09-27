import type { Metadata } from "next";
import { headers } from "next/headers";
import { loadLiveHome } from "@/lib/live-home";
import LiveShell from "@/components/live/LiveShell";

/**
 * /live — one page, two states, decided on the SERVER.
 *
 * Spec: "Live vs off-air is decided by liveBroadcast !== null — server-
 * rendered, so a live viewer never sees the landing page flash first."
 * That's the whole reason this is a server component: the state is resolved
 * before paint rather than after a client fetch.
 */

export const metadata: Metadata = {
  title: "Live Fact-Check — Vote Unbiased",
  description:
    "Official broadcasts transcribed live, every economic claim checked against BLS, BEA, Treasury and Fed data. Verbatim quotes, real figures, sources cited.",
};
export const dynamic = "force-dynamic";

/**
 * `?v=<videoId>` opens one named broadcast.
 *
 * This is what the live-alert email links to. Without it the mail could only
 * say "go to /live", meaning "whatever is live right now" — so once the
 * broadcast ended the alert led to a generic archive index, which reads as the
 * site being broken rather than the broadcast being over.
 *
 * Resolved here rather than in the client so the correct view is in the first
 * byte of HTML: no flash of the off-air page before a replay swaps in.
 */
export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const h = await headers();
  const host = h.get("host") || "voteunbiased.org";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const [data, params] = await Promise.all([
    loadLiveHome(`${proto}://${host}`),
    searchParams,
  ]);

  // Only honour an id we can actually show. An unknown or stale one falls
  // through to the normal off-air page, which is a working page — better than
  // a player pointed at nothing.
  const requested = params?.v?.trim() || null;
  const inArchive = requested ? data.archive.some(a => a.id === requested) : false;
  const isLiveNow = requested ? data.live?.videoId === requested : false;

  return (
    <LiveShell
      initial={data}
      requested={requested && (isLiveNow || inArchive) ? requested : null}
    />
  );
}
