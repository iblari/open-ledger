import type { Metadata } from "next";
import DashboardPage from "./DashboardClient";
import { getSeries } from "@/lib/series";
import { shareSeriesFor, shortName } from "@/lib/metric-share";
import { buildOgChart } from "@/lib/og-chart";
import { metricForDash, adminByAlias, METRIC_COUNT, ADMIN_COUNT, FIRST_YEAR, SITE } from "@/lib/seo-catalog";

/** Every dashboard state points search engines at its one clean page:
 *  ?metric=X → /benchmark/X, ?metric=X&admin=Y → /economy/Y/X, else /dashboard. */
function canonicalFor(sp: Record<string, string | string[] | undefined>): string {
  const metric = typeof sp.metric === "string" ? sp.metric : null;
  const admin = typeof sp.admin === "string" ? sp.admin : null;
  const m = metric ? metricForDash(metric) : null;
  const a = admin ? adminByAlias(admin) : null;
  if (m && a) return `${SITE}/economy/${a.slug}/${m.slug}`;
  if (m) return `${SITE}/benchmark/${m.slug}`;
  return `${SITE}/dashboard`;
}

/**
 * Server wrapper so a shared dashboard link (?metric=gas) gets that
 * metric's own chart as its preview card on X, iMessage, Slack. The page
 * itself is unchanged (DashboardClient).
 */
export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const sp = await searchParams;
  const metric = typeof sp.metric === "string" ? sp.metric : null;
  const id = shareSeriesFor(metric);
  const canonical = canonicalFor(sp);
  if (!id) return {
    title: `Economic Dashboard: ${METRIC_COUNT} Measures Under Every President Since ${FIRST_YEAR} | Vote Unbiased`,
    description: `Interactive dashboard of ${METRIC_COUNT} official economic measures (BLS, BEA, Census, Treasury, Fed) across ${ADMIN_COUNT} U.S. administrations, compared at the same month in office.`,
    alternates: { canonical },
  };
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
    alternates: { canonical },
    openGraph: { title, description, siteName: "Vote Unbiased", type: "website", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default function Page() {
  return <DashboardPage />;
}
