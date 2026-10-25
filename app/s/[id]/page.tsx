import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CheetahMark from "@/components/CheetahMark";
import { getSeries } from "@/lib/series";
import { buildOgChart } from "@/lib/og-chart";
import { shareSeriesFor, shortName, dashboardMetricFor } from "@/lib/metric-share";
import { C, SERIF } from "@/lib/design-tokens";
import MetricChart from "./MetricChart";

/**
 * /s/{series} — one official series on its own page: the shareable home
 * for a chart (Sam's posts link here). Same interactive chart as Trending,
 * its own preview card, and a way into the presidents comparison.
 */
export const revalidate = 3600;

async function load(idParam: string) {
  const id = shareSeriesFor(idParam);
  if (!id) return null;
  const sd = await getSeries(id).catch(() => null);
  if (!sd) return null;
  return { id, sd, c: buildOgChart(sd) };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const r = await load(id);
  if (!r) return { title: "Chart · Vote Unbiased" };
  const name = shortName(r.id);
  const title = r.c ? `${name}: ${r.c.value} (${r.c.valueDate})` : name;
  const description = r.c?.change ? `${r.c.change.replace(/^▲ /, "Up ").replace(/^▼ /, "Down ").replace(/^a year/, "A year")}. Official ${r.sd.source} data, charted.` : `Official ${r.sd.source} data, charted.`;
  const image = { url: `https://voteunbiased.org/og/m/${r.id}.png`, width: 1200, height: 630, alt: `${name} — chart` };
  return {
    title: `${title} · Vote Unbiased`, description,
    alternates: { canonical: `https://voteunbiased.org/s/${r.id}` },
    openGraph: { title, description, url: `https://voteunbiased.org/s/${r.id}`, siteName: "Vote Unbiased", type: "website", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default async function SeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await load(id);
  if (!r) notFound();
  const dash = dashboardMetricFor(r.id);
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink }}>
      <div style={{ borderBottom: `1px solid ${C.rule}`, padding: "12px 0", background: "#fff" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <Link href="/" aria-label="Vote Unbiased home" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", color: C.ink, fontFamily: SERIF, fontSize: 19, fontWeight: 600 }}>
            <CheetahMark height={22} ink={C.ink} accent={C.accent} />
            <span className="vu-wordmark">Vote <em style={{ fontStyle: "italic", color: C.accent, fontWeight: 500 }}>Unbiased</em></span>
          </Link>
          <div style={{ display: "flex", gap: 16, fontSize: 13, fontWeight: 600 }}>
            <Link href="/trending" style={{ color: C.sub, textDecoration: "none" }}>Trending</Link>
            <Link href="/live" style={{ color: C.accent, textDecoration: "none" }}>Live</Link>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "26px 20px 60px" }}>
        <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 30, margin: "0 0 4px" }}>{shortName(r.id)}</h1>
        <p style={{ fontSize: 13.5, color: C.sub, margin: "0 0 16px" }}>{r.sd.label} · official data from {r.sd.source}, updated as it's published.</p>
        <div style={{ background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 12, padding: "16px 18px" }}>
          <MetricChart data={r.sd} />
        </div>
        {dash && (
          <Link href={`/dashboard?view=month&metric=${dash}`} style={{ display: "inline-block", marginTop: 16, padding: "11px 18px", borderRadius: 8, background: C.ink, color: "#fff", textDecoration: "none", fontWeight: 600, fontSize: 14 }}>
            Compare every president on this →
          </Link>
        )}
      </div>
    </div>
  );
}
