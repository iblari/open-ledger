import type { Metadata } from "next";
import Link from "next/link";
import { getBroadcastRecaps } from "@/lib/broadcast-pages";
import { C, SERIF, SANS } from "@/lib/design-tokens";
import SeoHeader from "@/components/seo/SeoHeader";

export const revalidate = 1800;
export async function generateMetadata(): Promise<Metadata> {
  const all = await getBroadcastRecaps().catch(() => []);
  const n = all.reduce((s, b) => s + b.claims.length, 0);
  return { title: `Live Fact-Checks of ${all.length} Broadcasts, ${n.toLocaleString()} Claims | Vote Unbiased`,
    description: `Every speech and press briefing we've fact-checked live against BLS, BEA, Census and Fed data: ${all.length} broadcasts, ${n.toLocaleString()} rated claims, each with the figure on record and its source.`,
    alternates: { canonical: "https://voteunbiased.org/broadcasts" } };
}
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
export default async function BroadcastsIndex() {
  const all = await getBroadcastRecaps().catch(() => []);
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: SANS }}>
      <SeoHeader />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px 70px" }}>
        <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "clamp(28px,4.5vw,40px)", margin: "0 0 6px" }}>Fact-checked broadcasts</h1>
        <p style={{ fontSize: 15.5, color: C.sub, margin: "0 0 18px" }}>Every claim checked live against official data, newest first.</p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {all.map(b => (
            <li key={b.videoId} style={{ borderTop: `1px solid ${C.rule}`, padding: "12px 0" }}>
              <Link href={`/broadcasts/${b.slug}`} style={{ color: C.ink, fontWeight: 600, fontSize: 16, textDecoration: "none" }}>{b.title}</Link>
              <div style={{ fontSize: 13, color: C.sub, marginTop: 3 }}>{fmtDate(b.date)}{b.speaker ? ` · ${b.speaker}` : ""} · {b.claims.length} claims · {b.matchedPct != null ? `${b.matchedPct}% matched the data` : ""}</div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
