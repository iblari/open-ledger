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

export default async function LivePage() {
  const h = await headers();
  const host = h.get("host") || "voteunbiased.org";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const data = await loadLiveHome(`${proto}://${host}`);
  return <LiveShell initial={data} />;
}
