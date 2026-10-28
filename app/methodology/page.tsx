import type { Metadata } from "next";
import Link from "next/link";
import { METRICS, ADMINS, METRIC_COUNT, ADMIN_COUNT, SITE, fredUrl } from "@/lib/seo-catalog";
import { C, SERIF, SANS } from "@/lib/design-tokens";
import SeoHeader from "@/components/seo/SeoHeader";
import JsonLd from "@/components/seo/JsonLd";

export const metadata: Metadata = {
  title: "Methodology and Data Sources | Vote Unbiased",
  description: `How Vote Unbiased compares ${METRIC_COUNT} economic measures across ${ADMIN_COUNT} administrations and fact-checks live broadcasts: primary federal sources (BLS, BEA, Census, Treasury, Federal Reserve), alignment rules and verdict definitions.`,
  alternates: { canonical: `${SITE}/methodology` },
};

export default function Methodology() {
  const h2: React.CSSProperties = { fontFamily: SERIF, fontWeight: 500, fontSize: 24, margin: "30px 0 8px" };
  const p: React.CSSProperties = { fontSize: 15.5, lineHeight: 1.7, margin: "0 0 10px", maxWidth: 780 };
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: SANS }}>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "AboutPage", name: "Methodology and data sources", url: `${SITE}/methodology`, publisher: { "@type": "Organization", name: "Vote Unbiased", url: SITE } }} />
      <SeoHeader />
      <main style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 20px 70px" }}>
        <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "clamp(30px,4.5vw,42px)", margin: "0 0 10px" }}>Methodology and data sources</h1>
        <p style={p}>Vote Unbiased publishes official government data and checks what politicians say against it. We don't model, forecast or score anyone: every number on the site traces to a primary federal (or official) publisher, and every page links to it.</p>
        <h2 style={h2}>Comparing administrations</h2>
        <p style={p}>The benchmark compares {ADMIN_COUNT} administrations, from {ADMINS[0].full} ({ADMINS[0].start}) to {ADMINS[ADMINS.length - 1].full}. Each is aligned to its own inauguration: month 1 is the month it took office, and the comparison runs to month 48, the first term. Administrations are compared at the <b>same month in office</b>, so a sitting president is never measured against another's full four years.</p>
        <p style={p}>Measures that grow with the economy over decades (real GDP, retail sales, manufacturing jobs, gas prices, purchasing power, trade) are ranked on the % change since each president's first month, not on the level, so a recent president isn't "#1" simply because the economy is bigger. Rates (unemployment, inflation, interest rates) are ranked on the level; where lower is better (unemployment, inflation, debt-to-GDP, rates), the lowest ranks first.</p>
        <p style={p}>Presidents do not control most of these numbers: the Federal Reserve, Congress, global conditions and the business cycle often matter more. The rankings describe what happened on each watch, not who caused it.</p>
        <h2 style={h2}>The {METRIC_COUNT} measures and their sources</h2>
        <div style={{ overflowX: "auto", background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead><tr>{["Measure", "Primary source", "FRED series", "How it's calculated"].map(h => <th key={h} style={{ textAlign: "left", padding: "9px 12px", fontSize: 12, color: C.sub, borderBottom: `1px solid ${C.rule}` }}>{h}</th>)}</tr></thead>
            <tbody>{METRICS.map(m => (
              <tr key={m.slug}>
                <td style={{ padding: "9px 12px", borderBottom: `1px solid ${C.rule}`, fontSize: 14, fontWeight: 600 }}><Link href={`/benchmark/${m.slug}`} style={{ color: C.ink }}>{m.name}</Link></td>
                <td style={{ padding: "9px 12px", borderBottom: `1px solid ${C.rule}`, fontSize: 13.5 }}><a href={m.agencyUrl} style={{ color: C.sub }}>{m.agency}</a></td>
                <td style={{ padding: "9px 12px", borderBottom: `1px solid ${C.rule}`, fontSize: 13 }}>{m.series.map((s, i) => <span key={s}>{i ? ", " : ""}<a href={fredUrl(s)} style={{ color: C.sub }}>{s}</a></span>)}</td>
                <td style={{ padding: "9px 12px", borderBottom: `1px solid ${C.rule}`, fontSize: 13.5, lineHeight: 1.5 }}>{m.method}</td>
              </tr>))}</tbody>
          </table>
        </div>
        <p style={{ ...p, marginTop: 10, fontSize: 14, color: C.sub }}>Data is retrieved from the Federal Reserve Bank of St. Louis (FRED), which republishes the agencies' releases, and refreshed hourly. Where available we record when each latest observation was first published (ALFRED vintages).</p>
        <h2 style={h2}>Live fact-checks</h2>
        <p style={p}>During live broadcasts, every checkable claim with a number or a verifiable fact is compared with the official figure on record. Verdicts: <b>True</b> (matches the record), <b>Mostly true</b> (right in substance, off in a detail), <b>Misleading</b> (accurate number, wrong impression or missing context), <b>False</b> (contradicted by the record). Claims that can't yet be settled, such as forecasts, are labelled and left out of the "matched the data" score, which is true ÷ (true + misleading + false).</p>
        <p style={p}>Repeated claims are grouped across broadcasts, so each fact-check shows how many times a line has been said. Every claim has its own page with sources: see <Link href="/broadcasts" style={{ color: C.sub }}>fact-checked broadcasts</Link>.</p>
        <h2 style={h2}>Corrections</h2>
        <p style={p}>Official data is revised. When a revision changes a figure we show the latest published value and, where it matters, the value as first published.</p>
      </main>
    </div>
  );
}
