import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { METRICS, ADMINS, adminBySlug, adminByAlias, metricBySlug, metricForDash, economyUrl, benchmarkUrl, SITE } from "@/lib/seo-catalog";
import { getBench, rankAt, fmtV, fmtChange, valueAt } from "@/lib/seo-bench";
import { C, SERIF, SANS } from "@/lib/design-tokens";
import SeoHeader from "@/components/seo/SeoHeader";
import BenchChart from "@/components/seo/BenchChart";
import RankTableView from "@/components/seo/RankTableView";
import Methodology from "@/components/seo/Methodology";
import JsonLd from "@/components/seo/JsonLd";
import CopyCitation from "@/components/seo/CopyCitation";

export const revalidate = 3600;
export const dynamicParams = true;

async function load(adminSlug: string, metricSlug: string) {
  const a = adminBySlug(adminSlug), info = metricBySlug(metricSlug);
  if (!a || !info) return null;
  const bench = await getBench();
  const m = bench?.metrics[info.key];
  const s = m?.series.find(x => x.id === a.id);
  if (!m || !s || s.data.length < 2) return { a, info, m: null, t: null, s: null, last: 0 };
  const last = Math.min(47, Math.max(...s.data.map(d => d.month)));
  return { a, info, m, s, last, t: rankAt(m, info.key, last) };
}

function facts(r: NonNullable<Awaited<ReturnType<typeof load>>>) {
  if (!r.m || !r.s || !r.t) return null;
  const start = valueAt(r.s.data, 0), end = valueAt(r.s.data, r.last);
  const row = r.t.rows.find(x => x.id === r.a.id);
  if (start == null || end == null || !row) return null;
  const inOffice = r.a.id === "trump2";
  return { start, end, change: fmtChange(r.m, start, end), row, inOffice };
}

export async function generateMetadata({ params }: { params: Promise<{ admin: string; metric: string }> }): Promise<Metadata> {
  const { admin, metric } = await params;
  const r = await load(admin, metric);
  if (!r) return {};
  const f = facts(r);
  const src = r.info.agency.replace(/ \(.*\)$/, "");
  const title = `${r.info.name} Under ${r.a.full}: Official ${src} Data & Historical Rank`;
  const description = f && r.m && r.t
    ? `${r.info.name} under ${r.a.full}: ${fmtV(r.m, f.start)} in month 1 to ${fmtV(r.m, f.end)} at month ${r.last + 1}${f.inOffice ? " (latest)" : ""}, a change of ${f.change}. Ranks #${f.row.rank} of ${r.t.n} administrations at the same point in office. Source: ${r.info.agency}.`
    : `${r.info.name} under ${r.a.full}, month by month, from official ${r.info.agency} data.`;
  const url = economyUrl(r.a, r.info);
  const image = `${SITE}/api/og?type=metric&m=${r.info.slug}&a=${r.a.slug}`;
  return { title: `${title} | Vote Unbiased`, description, alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "Vote Unbiased", type: "article", images: [{ url: image, width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [image] } };
}

export default async function AdminMetricPage({ params }: { params: Promise<{ admin: string; metric: string }> }) {
  const { admin, metric } = await params;
  if (!adminBySlug(admin) || !metricBySlug(metric)) {
    const a = adminByAlias(admin), mi = metricBySlug(metric) ?? metricForDash(metric);
    if (a && mi) permanentRedirect(`/economy/${a.slug}/${mi.slug}`);
  }
  const r = await load(admin, metric);
  if (!r) notFound();
  if (!r.m) notFound();
  const { a, info, m, t } = r;
  const f = facts(r);
  const url = economyUrl(a, info);
  const src = info.agency;
  const summary = f && t
    ? `${info.name} went from ${fmtV(m, f.start)} in ${a.full}'s first month to ${fmtV(m, f.end)} at month ${r.last + 1}${f.inOffice ? " (the latest reading)" : ""}: a change of ${f.change}. At that point in office it ranks #${f.row.rank} of ${t.n} administrations since ${ADMINS[0].start}.`
    : "";
  const citation = f && t ? `📊 ${info.name} under ${a.full}: ${fmtV(m, f.start)} → ${fmtV(m, f.end)} (month 1 → ${r.last + 1}) (Rank: #${f.row.rank} of ${t.n} modern administrations at Month ${r.last + 1}). Source: ${src}, FRED ${info.series.join("/")} via ${url}` : `${info.name} under ${a.full} via ${url}`;
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: SANS }}>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "Dataset", name: `${info.name} Under ${a.full}`, description: `${summary} ${info.method}`.trim(), url,
        creator: { "@type": "Organization", name: "Vote Unbiased", url: SITE }, publisher: { "@type": "Organization", name: "Vote Unbiased", url: SITE },
        isBasedOn: [info.agencyUrl, ...info.series.map(s => `https://fred.stlouisfed.org/series/${s}`)],
        variableMeasured: { "@type": "PropertyValue", name: info.name, unitText: m.unit || undefined }, temporalCoverage: `${a.start}-01/P${r.last + 1}M`, isAccessibleForFree: true }} />
      <SeoHeader />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "26px 20px 70px" }}>
        <div data-nosnippet style={{ fontSize: 13, color: C.sub }}><Link href="/economy" style={{ color: C.sub }}>Presidents</Link> › <Link href={`/economy/${a.slug}`} style={{ color: C.sub }}>{a.full}</Link> › {info.name}</div>
        <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "clamp(28px,4.5vw,40px)", lineHeight: 1.12, margin: "8px 0 8px" }}>{info.name} under {a.full}</h1>
        <p style={{ fontSize: 16, color: C.sub, lineHeight: 1.6, maxWidth: 780, margin: 0 }}>{summary} Official data from the {src}.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0" }}>
          <CopyCitation text={citation} />
          <Link data-nosnippet href={`/benchmark/${info.slug}`} style={{ padding: "8px 14px", borderRadius: 8, background: "#fff", border: `1px solid ${C.rule}`, color: C.ink, textDecoration: "none", fontWeight: 600, fontSize: 13 }}>Compare all presidents →</Link>
        </div>
        {f && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginBottom: 16 }}>
            {[["Month 1", fmtV(m, f.start)], [`Month ${r.last + 1}${f.inOffice ? " (latest)" : ""}`, fmtV(m, f.end)], ["Change", f.change], ["Rank at that point", `#${f.row.rank} of ${t!.n}`]].map(([k, v]) => (
              <div key={k} style={{ background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 10, padding: "10px 14px" }}><div style={{ fontSize: 12, color: C.sub }}>{k}</div><div style={{ fontSize: 22, fontWeight: 600, marginTop: 2 }}>{v}</div></div>
            ))}
          </div>
        )}
        <div style={{ background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 12, padding: "16px 18px" }}><BenchChart m={m} metricKey={info.key} highlight={a.id} /></div>
        {t && <><h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 22, margin: "26px 0 10px" }}>All administrations at month {t.month + 1}</h2><RankTableView info={info} m={m} t={t} highlight={a.id} /></>}
        <Methodology info={info} published={m.published} />
        <section style={{ marginTop: 26 }}>
          <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 20, margin: "0 0 8px" }}>More on {a.full}</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>{METRICS.filter(x => x.slug !== info.slug).map(x => <Link key={x.slug} href={`/economy/${a.slug}/${x.slug}`} style={{ fontSize: 13, color: C.sub }}>{x.name}</Link>)}</div>
          <p style={{ marginTop: 14, fontSize: 13 }}><Link href={benchmarkUrl(info).replace(SITE, "")} style={{ color: C.sub }}>{info.name} under every president →</Link></p>
        </section>
      </main>
    </div>
  );
}
