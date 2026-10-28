import type { Metadata } from "next";
import Link from "next/link";
import { METRICS, ADMIN_COUNT, METRIC_COUNT, FIRST_YEAR, SITE } from "@/lib/seo-catalog";
import { C, SERIF, SANS } from "@/lib/design-tokens";
import SeoHeader from "@/components/seo/SeoHeader";

export const metadata: Metadata = {
  title: `The Economy Under Every President: ${METRIC_COUNT} Benchmarks, Month by Month | Vote Unbiased`,
  description: `${METRIC_COUNT} official economic measures compared across ${ADMIN_COUNT} U.S. presidential administrations since ${FIRST_YEAR}, each at the same month in office. BLS, BEA, Census, Treasury and Federal Reserve data.`,
  alternates: { canonical: `${SITE}/benchmark` },
};

export default function BenchmarkIndex() {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: SANS }}>
      <SeoHeader />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px 70px" }}>
        <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "clamp(28px,4.5vw,42px)", margin: "0 0 8px" }}>The economy under every president, month by month</h1>
        <p style={{ fontSize: 16, color: C.sub, lineHeight: 1.6, maxWidth: 760 }}>{METRIC_COUNT} official measures, {ADMIN_COUNT} administrations since {FIRST_YEAR}, each compared at the same month in office. Pick a measure:</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 10, marginTop: 16 }}>
          {METRICS.map(m => (
            <Link key={m.slug} href={`/benchmark/${m.slug}`} style={{ display: "block", background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 10, padding: "12px 14px", textDecoration: "none", color: C.ink }}>
              <div style={{ fontWeight: 600 }}>{m.name}</div>
              <div style={{ fontSize: 12.5, color: C.sub, marginTop: 3 }}>{m.agency}</div>
            </Link>
          ))}
        </div>
        <p style={{ marginTop: 22, fontSize: 14 }}><Link href="/economy" style={{ color: C.sub }}>Browse by president →</Link> · <Link href="/methodology" style={{ color: C.sub }}>Methodology →</Link></p>
      </main>
    </div>
  );
}
