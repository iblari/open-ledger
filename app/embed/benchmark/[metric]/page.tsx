import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { METRICS, metricBySlug, benchmarkUrl } from "@/lib/seo-catalog";
import { getBench, rankAt, currentMonth, benchSummary } from "@/lib/seo-bench";
import BenchChart from "@/components/seo/BenchChart";

/** Chromeless chart for iframes on other sites; every embed links back. */
export const revalidate = 3600;
export function generateStaticParams() { return METRICS.map(m => ({ metric: m.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ metric: string }> }): Promise<Metadata> {
  const { metric } = await params; const info = metricBySlug(metric);
  return { title: info ? `${info.name} under every president · Vote Unbiased` : "Vote Unbiased", robots: { index: false, follow: true }, alternates: info ? { canonical: benchmarkUrl(info) } : undefined };
}
export default async function Embed({ params }: { params: Promise<{ metric: string }> }) {
  const { metric } = await params;
  const info = metricBySlug(metric);
  if (!info) notFound();
  const bench = await getBench(); const m = bench?.metrics[info.key];
  const t = m ? rankAt(m, info.key, currentMonth(m) ?? 0) : null;
  const href = benchmarkUrl(info);
  return (
    <div style={{ background: "#fff", color: "#1a1a1a", fontFamily: "'DM Sans',system-ui,sans-serif", padding: "14px 16px 10px", minHeight: "100vh", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
      <div style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontSize: 20, fontWeight: 600 }}>{info.name} under every president</div>
      {m && t && <div style={{ fontSize: 13, color: "#5c5856", margin: "3px 0 8px" }}>{benchSummary(info, m, t)}</div>}
      {m ? <BenchChart m={m} metricKey={info.key} height={280} /> : <div style={{ color: "#5c5856" }}>Data loading…</div>}
      <div style={{ marginTop: "auto", paddingTop: 8, borderTop: "1px solid #ece7df", fontSize: 12, color: "#5c5856" }}>
        Interactive data by <a href={href} target="_blank" rel="noopener" style={{ color: "#b8372d", fontWeight: 600 }}>Vote Unbiased (voteunbiased.org)</a> · Source: {info.agency}
      </div>
    </div>
  );
}
