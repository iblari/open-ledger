import type { Metadata } from "next";
import DashboardPage from "./DashboardClient";
import { getSeries } from "@/lib/series";
import { shareSeriesFor, shortName } from "@/lib/metric-share";
import { buildOgChart } from "@/lib/og-chart";

/**
 * Server wrapper so a shared dashboard link (?metric=gas) gets that
 * metric's own chart as its preview card on X, iMessage, Slack. The page
 * itself is unchanged (DashboardClient).
 */
export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const sp = await searchParams;
  const metric = typeof sp.metric === "string" ? sp.metric : null;
  const id = shareSeriesFor(metric);
  if (!id) return {};
  const sd = await getSeries(id).catch(() => null);
  const c = sd ? buildOgChart(sd) : null;
  const name = shortName(id);
  const title = c ? `${name}: ${c.value} (${c.valueDate})` : name;
  const description = c
    ? `${c.change ? c.change.replace(/^▲ /, "Up ").replace(/^▼ /, "Down ").replace(/^a year/, "A year") + ". " : ""}Five years of official ${sd!.source} data, and how every president compares.`
    : "Official data, charted. How every president compares.";
  const image = { url: `https://voteunbiased.org/og/m/${metric!.toLowerCase()}.png`, width: 1200, height: 630, alt: `${name} — chart of the last five years` };
  return {
    title: `${title} · Vote Unbiased`,
    description,
    openGraph: { title, description, siteName: "Vote Unbiased", type: "website", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default function Page() {
  return <DashboardPage />;
}
