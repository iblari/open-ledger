import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { METRICS, ADMINS, adminBySlug, adminByAlias, economyUrl } from "@/lib/seo-catalog";
import { getBench, rankAt, fmtV, fmtChange, valueAt } from "@/lib/seo-bench";
import { C, SERIF, SANS } from "@/lib/design-tokens";
import SeoHeader from "@/components/seo/SeoHeader";

export const revalidate = 3600;
export function generateStaticParams() { return ADMINS.map(a => ({ admin: a.slug })); }

async function rows(adminId: string) {
  const bench = await getBench();
  if (!bench) return [];
  return METRICS.flatMap(info => {
    const m = bench.metrics[info.key]; const s = m?.series.find(x => x.id === adminId);
    if (!m || !s || s.data.length < 2) return [];
    const last = Math.min(47, Math.max(...s.data.map(d => d.month)));
    const t = rankAt(m, info.key, last); const row = t.rows.find(r => r.id === adminId);
    const start = valueAt(s.data, 0), end = valueAt(s.data, last);
    if (!row || start == null || end == null) return [];
    return [{ info, m, last, rank: row.rank, n: t.n, start, end, change: fmtChange(m, start, end) }];
  });
}

export async function generateMetadata({ params }: { params: Promise<{ admin: string }> }): Promise<Metadata> {
  const { admin } = await params;
  const a = adminBySlug(admin);
  if (!a) return {};
  const rs = await rows(a.id);
  const top = rs.filter(r => r.rank === 1).map(r => r.info.name);
  return { title: `The Economy Under ${a.full}: ${rs.length} Official Measures, Ranked | Vote Unbiased`,
    description: `How the economy did under ${a.full} on ${rs.length} official measures (BLS, BEA, Census, Treasury, Fed), each ranked against ${ADMINS.length - 1} other administrations at the same month in office.${top.length ? ` Ranked #1 on: ${top.slice(0, 4).join(", ")}.` : ""}`,
    alternates: { canonical: economyUrl(a) } };
}

export default async function AdminPage({ params }: { params: Promise<{ admin: string }> }) {
  const { admin } = await params;
  const a = adminBySlug(admin);
  if (!a) { const alt = adminByAlias(admin); if (alt) permanentRedirect(`/economy/${alt.slug}`); notFound(); }
  const rs = await rows(a.id);
  const th: React.CSSProperties = { textAlign: "left", padding: "9px 12px", fontSize: 12, fontWeight: 700, color: C.sub, borderBottom: `1px solid ${C.rule}` };
  const td: React.CSSProperties = { padding: "9px 12px", fontSize: 14, borderBottom: `1px solid ${C.rule}` };
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: SANS }}>
      <SeoHeader />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "26px 20px 70px" }}>
        <div data-nosnippet style={{ fontSize: 13, color: C.sub }}><Link href="/economy" style={{ color: C.sub }}>Presidents</Link> › {a.full}</div>
        <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "clamp(28px,4.5vw,40px)", margin: "8px 0 8px" }}>The economy under {a.full}</h1>
        <p style={{ fontSize: 16, color: C.sub, lineHeight: 1.6, maxWidth: 780 }}>{rs.length} official measures, each from the first month in office ({a.start}) to month 48{a.id === "trump2" ? " or the latest reading" : ""}, ranked against every other administration at the same point.</p>
        <div style={{ overflowX: "auto", background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 12, marginTop: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
            <thead><tr><th style={th}>Measure</th><th style={th}>Month 1</th><th style={th}>Latest / month 48</th><th style={th}>Change</th><th style={th}>Rank at that point</th><th style={th}>Source</th></tr></thead>
            <tbody>{rs.map(r => (
              <tr key={r.info.slug}>
                <td style={td}><Link href={`/economy/${a.slug}/${r.info.slug}`} style={{ color: C.ink, fontWeight: 600 }}>{r.info.name}</Link></td>
                <td style={td}>{fmtV(r.m, r.start)}</td><td style={td}>{fmtV(r.m, r.end)} <span style={{ color: C.mute, fontSize: 12 }}>(m{r.last + 1})</span></td>
                <td style={td}>{r.change}</td><td style={td}>#{r.rank} of {r.n}</td><td style={{ ...td, fontSize: 12.5, color: C.sub }}>{r.info.agency.replace(/ \(.*\)$/, "")}</td>
              </tr>))}</tbody>
          </table>
        </div>
        <p style={{ marginTop: 18, fontSize: 13 }}>Other presidents: {ADMINS.filter(x => x.id !== a.id).map((x, i) => <span key={x.id}>{i ? " · " : ""}<Link href={`/economy/${x.slug}`} style={{ color: C.sub }}>{x.full}</Link></span>)}</p>
      </main>
    </div>
  );
}
