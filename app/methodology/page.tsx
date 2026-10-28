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
        <p style={p}>When a line is repeated, its claim page shows a timeline of every time it was said. Each point keeps the verdict it was given at the time and shows the figure that had been published on that day (from the ALFRED archive), before later revisions. The timeline doesn't re-judge anything. Verdicts on the same line can differ between dates: sometimes because new data came out, sometimes because the wording or the evidence a check found was different.</p>
        <h2 id="consistency" style={h2}>Keeping verdicts consistent</h2>
        <p style={p}>The same claim, checked against the same official data, should get the same verdict. Two rules make sure it does:</p>
        <ul style={{ ...p, paddingLeft: 20 }}>
          <li><b>Carry-over.</b> When a speaker repeats a claim we have already checked, in substantially the same words, and no new official figure has been published since (for claims with no data series, within 60 days), the earlier verdict carries over. The claim page says so and links to the earlier check. Claims checked against our own data series are recomputed every time, because that calculation always gives the same answer.</li>
          <li><b>Review.</b> Where earlier checks of the same claim, made while the official data was unchanged, reached different verdicts, they are reviewed together. The reviewer sees every check's evidence and gives the group one verdict. The original verdict stays on record and is shown on the claim page, and every change is listed publicly at <a href="/api/consistency" style={{ color: C.sub }}>/api/consistency</a>.</li>
        </ul>
        <p style={p}>Verdicts still change when the data does. If a new release moves the figure, the next time the claim is made it is checked fresh.</p>
        <h2 id="localize" style={h2}>Localizing the data</h2>
        <p style={p}>Readers can pick a state and whether they rent or own. The site then adds the official figure for their area next to the national one, wherever one exists. This is context only. Claims are about national figures, so verdicts always use the national number. The setting is stored in a cookie on the reader's device. We never infer location from an IP address.</p>
        <p style={p}>Official data isn't published at state level for everything, so we use the smallest area that exists and say which one:</p>
        <ul style={{ ...p, paddingLeft: 20 }}>
          <li><b>Prices (inflation, rent, owners' equivalent rent):</b> BLS publishes CPI for 4 Census regions, not for states. We show the region the state belongs to: all items since 1967, rent since 1978, owners' equivalent rent since 1983 (12-month changes). Region and US figures both use the not-seasonally-adjusted series, the basis BLS uses for its 12-month change, so the US figure here can differ by about 0.1 point from the seasonally adjusted one used in the benchmarks.</li>
          <li><b>Gas:</b> EIA weekly and monthly retail prices for regular gasoline in 5 regions (PADDs), since 1992.</li>
          <li><b>Wages:</b> BLS average hourly earnings of private-sector workers, by state, since 2007 (12-month change). This is a true state figure.</li>
          <li><b>Home prices (owners):</b> the FHFA all-transactions house price index by state, quarterly, against the FHFA US index.</li>
        </ul>
        <p style={p}>Renters see the rent component of CPI; owners see owners' equivalent rent (the BLS estimate of what owning a home would cost as rent, not a cash payment) and state home prices. We don't build a blended "personal inflation" number, because that would need weights we would have to choose.</p>
        <h2 style={h2}>Corrections</h2>
        <p style={p}>Official data is revised. When a revision changes a figure we show the latest published value and, where it matters, the value as first published.</p>
      </main>
    </div>
  );
}
