import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { METRICS, metricBySlug, metricForDash, benchmarkUrl, SITE, ADMINS } from "@/lib/seo-catalog";
import { getBench, rankAt, currentMonth, benchSummary, fmtV, fmtPct, adminName } from "@/lib/seo-bench";
import { C, SERIF, SANS } from "@/lib/design-tokens";
import SeoHeader from "@/components/seo/SeoHeader";
import BenchChart from "@/components/seo/BenchChart";
import RankTableView from "@/components/seo/RankTableView";
import Methodology from "@/components/seo/Methodology";
import JsonLd from "@/components/seo/JsonLd";
import CopyCitation from "@/components/seo/CopyCitation";
import EmbedButton from "@/components/seo/EmbedButton";
import LocalBench from "@/components/local/LocalBench";

export const revalidate = 3600;
export function generateStaticParams() { return METRICS.map(m => ({ metric: m.slug })); }

async function load(slug: string) {
  const info = metricBySlug(slug);
  if (!info) return null;
  const bench = await getBench();
  const m = bench?.metrics[info.key];
  if (!m) return { info, m: null, t: null };
  const month = currentMonth(m) ?? 0;
  return { info, m, t: rankAt(m, info.key, month) };
}

export async function generateMetadata({ params }: { params: Promise<{ metric: string }> }): Promise<Metadata> {
  const { metric } = await params;
  const r = await load(metric);
  if (!r) return {};
  const title = `${r.info.name} Under Every President (Month-by-Month Data)`;
  const description = r.m && r.t
    ? `Compare ${r.info.name} across ${r.t.n} modern U.S. presidential administrations at the exact same month in office. ${benchSummary(r.info, r.m, r.t)}`
    : `${r.info.name} across U.S. presidential administrations, month by month, from official ${r.info.agency} data.`;
  const url = benchmarkUrl(r.info);
  const image = `${SITE}/api/og?type=metric&m=${r.info.slug}`;
  return {
    title: `${title} | Vote Unbiased`, description, alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "Vote Unbiased", type: "article", images: [{ url: image, width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function BenchmarkPage({ params }: { params: Promise<{ metric: string }> }) {
  const { metric } = await params;
  // Old dashboard keys (/benchmark/debt_gdp) → the clean slug.
  if (!metricBySlug(metric)) { const alt = metricForDash(metric); if (alt) permanentRedirect(`/benchmark/${alt.slug}`); }
  const r = await load(metric);
  if (!r) notFound();
  const { info, m, t } = r;
  const url = benchmarkUrl(info);
  const cur = t?.rows.find(x => x.current);
  const citation = m && t && cur
    ? `📊 ${info.name} at month ${t.month + 1} in office: ${adminName(cur.id)} ${t.byChange ? fmtPct(cur.change) + " since taking office" : fmtV(m, cur.value)} (Rank: #${cur.rank} of ${t.n} modern administrations at Month ${t.month + 1}). Source: ${info.agency}, FRED ${info.series.join("/")} via ${url}`
    : `📊 ${info.name} under every president, month by month. Source: ${info.agency} via ${url}`;
  const dataset = {
    "@context": "https://schema.org", "@type": "Dataset",
    name: `${info.name} Across U.S. Presidential Administrations`,
    description: `${info.name} for ${t?.n ?? ADMINS.length} U.S. presidential administrations, aligned month by month from each inauguration (months 1–48). ${info.method}`,
    url, creator: { "@type": "Organization", name: "Vote Unbiased", url: SITE }, publisher: { "@type": "Organization", name: "Vote Unbiased", url: SITE },
    isBasedOn: [info.agencyUrl, ...info.series.map(s => `https://fred.stlouisfed.org/series/${s}`)],
    variableMeasured: { "@type": "PropertyValue", name: info.name, unitText: m?.unit || undefined },
    temporalCoverage: `${ADMINS[0].start}-01/..`, license: "https://creativecommons.org/licenses/by/4.0/",
    isAccessibleForFree: true, dateModified: (m?.published?.d) || undefined,
  };
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: SANS }}>
      <JsonLd data={dataset} />
      <SeoHeader />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "26px 20px 70px" }}>
        <div data-nosnippet style={{ fontSize: 13, color: C.sub }}><Link href="/benchmark" style={{ color: C.sub }}>Benchmarks</Link> › {info.name}</div>
        <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "clamp(28px,4.5vw,40px)", lineHeight: 1.12, margin: "8px 0 8px" }}>{info.name} under every president, month by month</h1>
        <p style={{ fontSize: 16, color: C.sub, lineHeight: 1.6, maxWidth: 760, margin: 0 }}>{m && t ? benchSummary(info, m, t) : `Official ${info.agency} data.`}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0" }}>
          <CopyCitation text={citation} />
          <EmbedButton src={`${SITE}/embed/benchmark/${info.slug}`} href={url} title={`${info.name} under every president — Vote Unbiased`} />
          {info.dash && <Link data-nosnippet href={`/dashboard?view=month&metric=${info.dash}`} style={{ padding: "8px 14px", borderRadius: 8, background: C.ink, color: "#fff", textDecoration: "none", fontWeight: 600, fontSize: 13 }}>Open interactive dashboard →</Link>}
        </div>
        {m && t ? (
          <>
            <div style={{ background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 12, padding: "16px 18px" }}><BenchChart m={m} metricKey={info.key} /></div>
            {(info.key === "inflation" || info.key === "gas") && <LocalBench metric={info.key} month={t.month} admins={ADMINS.map(a => ({ id: a.id, name: a.name }))} />}
            <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 22, margin: "26px 0 10px" }}>Every administration at month {t.month + 1}</h2>
            <RankTableView info={info} m={m} t={t} />
          </>
        ) : <p style={{ color: C.sub }}>Live data is loading from FRED. Try again in a minute.</p>}
        <Methodology info={info} published={m?.published} />
        <section style={{ marginTop: 26 }}>
          <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 20, margin: "0 0 8px" }}>{info.name} by president</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{ADMINS.map(a => <Link key={a.id} href={`/economy/${a.slug}/${info.slug}`} style={{ padding: "6px 12px", borderRadius: 999, background: "#fff", border: `1px solid ${C.rule}`, color: C.ink, textDecoration: "none", fontSize: 13 }}>{info.name} under {a.full}</Link>)}</div>
          <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 20, margin: "22px 0 8px" }}>Other benchmarks</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{METRICS.filter(x => x.slug !== info.slug).map(x => <Link key={x.slug} href={`/benchmark/${x.slug}`} style={{ fontSize: 13, color: C.sub }}>{x.name}</Link>)}</div>
        </section>
      </main>
    </div>
  );
}
