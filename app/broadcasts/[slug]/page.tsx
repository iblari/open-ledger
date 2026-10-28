import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBroadcastRecap, getBroadcastRecaps, ratingName, mmss } from "@/lib/broadcast-pages";
import { claimReviewLd } from "@/lib/claim-review";
import { toOutcome, VERDICT_COLOR } from "@/lib/live-design";
import { C, SERIF, SANS } from "@/lib/design-tokens";
import SeoHeader from "@/components/seo/SeoHeader";
import JsonLd from "@/components/seo/JsonLd";
import CopyCitation from "@/components/seo/CopyCitation";

export const revalidate = 1800;
const SITE = "https://voteunbiased.org";
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const b = await getBroadcastRecap(slug);
  if (!b) return {};
  const title = `Fact Check: ${b.title} (${fmtDate(b.date)})${b.matchedPct != null ? ` — ${b.matchedPct}% Matched the Data` : ""}`;
  const description = `${b.claims.length} claims${b.speaker ? ` by ${b.speaker}` : ""} checked against official data: ${b.counts.true} true, ${b.counts.misleading} misleading, ${b.counts.false} false. Every claim with the figure on record and its source.`;
  const url = `${SITE}/broadcasts/${b.slug}`;
  return { title: `${title} | Vote Unbiased`, description, alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "Vote Unbiased", type: "article" }, twitter: { card: "summary_large_image", title, description } };
}

export default async function BroadcastPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = await getBroadcastRecap(slug);
  if (!b) notFound();
  const url = `${SITE}/broadcasts/${b.slug}`;
  if (slug !== b.slug) { const { permanentRedirect } = await import("next/navigation"); permanentRedirect(`/broadcasts/${b.slug}`); }
  const ld = b.claims.map(c => claimReviewLd({ url: SITE + c.path, quote: c.quote, rating: c.rating, speaker: b.speaker, date: b.date, appearance: b.title, appearanceUrl: `https://www.youtube.com/watch?v=${b.videoId}`, reviewBody: c.actual }));
  const all = await getBroadcastRecaps();
  const i = all.findIndex(x => x.videoId === b.videoId);
  const near = [all[i - 1], all[i + 1]].filter(Boolean);
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: SANS }}>
      <JsonLd data={ld} />
      <SeoHeader />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "26px 20px 70px" }}>
        <div data-nosnippet style={{ fontSize: 13, color: C.sub }}><Link href="/broadcasts" style={{ color: C.sub }}>Fact-checked broadcasts</Link> › {fmtDate(b.date)}</div>
        <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "clamp(26px,4.2vw,38px)", lineHeight: 1.15, margin: "8px 0 6px" }}>Fact check: {b.title}</h1>
        <p style={{ fontSize: 15, color: C.sub, margin: 0 }}>{b.speaker ? `${b.speaker} · ` : ""}{fmtDate(b.date)}{b.durationSec ? ` · ${Math.round(b.durationSec / 60)} min` : ""}</p>
        <section aria-label="Scorecard" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, margin: "18px 0" }}>
          {[["Matched the data", b.matchedPct != null ? `${b.matchedPct}%` : "—", C.ink], ["True", String(b.counts.true), VERDICT_COLOR.true], ["Misleading", String(b.counts.misleading), VERDICT_COLOR.misleading], ["False", String(b.counts.false), VERDICT_COLOR.false]].map(([k, v, col]) => (
            <div key={k} style={{ background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 10, padding: "10px 14px" }}><div style={{ fontSize: 12, color: C.sub }}>{k}</div><div style={{ fontSize: 26, fontWeight: 700, color: col }}>{v}</div></div>
          ))}
        </section>
        <div data-nosnippet style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          <Link href={`/live?v=${b.videoId}`} style={{ padding: "8px 14px", borderRadius: 8, background: C.ink, color: "#fff", textDecoration: "none", fontWeight: 600, fontSize: 13 }}>Watch with live fact-checks →</Link>
          <CopyCitation text={`📊 ${b.title} (${fmtDate(b.date)}): ${b.matchedPct ?? "—"}% of checkable claims matched official data (${b.counts.true} true, ${b.counts.misleading} misleading, ${b.counts.false} false). Every claim and source: ${url}`} />
        </div>
        <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 22, margin: "8px 0 10px" }}>Every claim, in order</h2>
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {b.claims.map(c => {
            const col = VERDICT_COLOR[toOutcome(c.rating)];
            return (
              <li key={c.key} id={c.key} style={{ background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12.5, color: C.sub }}>
                  <span style={{ fontWeight: 700, color: "#fff", background: col, borderRadius: 4, padding: "2px 7px", fontSize: 11.5, letterSpacing: ".05em" }}>{ratingName(c.rating).toUpperCase()}</span>
                  {c.videoTime != null && <span>at {mmss(c.videoTime)}</span>}
                  {c.repeats > 1 && <span>· said in {c.repeats} broadcasts</span>}
                </div>
                <blockquote style={{ fontFamily: SERIF, fontSize: 17, lineHeight: 1.45, margin: "8px 0 6px" }}>“{c.quote}”</blockquote>
                {c.actual && <p style={{ fontSize: 14.5, lineHeight: 1.55, margin: 0 }}><b>What the data shows:</b> {c.actual}</p>}
                <div style={{ fontSize: 12.5, marginTop: 6 }}><Link href={c.path} style={{ color: C.sub }}>Full fact-check and sources →</Link></div>
              </li>
            );
          })}
        </ol>
        {near.length > 0 && <p style={{ marginTop: 22, fontSize: 13.5 }}>More: {near.map((x, k) => <span key={x.videoId}>{k ? " · " : ""}<Link href={`/broadcasts/${x.slug}`} style={{ color: C.sub }}>{x.title}</Link></span>)}</p>}
      </main>
    </div>
  );
}
