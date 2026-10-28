import type { Metadata } from "next";
import Link from "next/link";
import { ADMINS, METRIC_COUNT, SITE } from "@/lib/seo-catalog";
import { C, SERIF, SANS } from "@/lib/design-tokens";
import SeoHeader from "@/components/seo/SeoHeader";

export const metadata: Metadata = {
  title: `The Economy Under Each President Since ${ADMINS[0].start} | Vote Unbiased`,
  description: `Pick a president: ${METRIC_COUNT} official economic measures for each of ${ADMINS.length} administrations, ranked at the same month in office.`,
  alternates: { canonical: `${SITE}/economy` },
};
export default function EconomyIndex() {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: SANS }}>
      <SeoHeader />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px 70px" }}>
        <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "clamp(28px,4.5vw,42px)", margin: "0 0 14px" }}>The economy under each president</h1>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
          {[...ADMINS].reverse().map(a => (
            <Link key={a.id} href={`/economy/${a.slug}`} style={{ display: "block", background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 10, padding: "12px 14px", textDecoration: "none", color: C.ink }}>
              <div style={{ fontWeight: 600 }}>{a.full}</div><div style={{ fontSize: 12.5, color: C.sub, marginTop: 3 }}>Took office {a.start}</div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
