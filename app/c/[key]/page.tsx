import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CheetahMark from "@/components/CheetahMark";
import ShareClaimButton from "@/components/ShareClaimButton";
import { getSharedClaim } from "@/lib/claim-lookup";
import { hashFromKey, claimPath } from "@/lib/claim-link";
import { toOutcome, VERDICT_COLOR, VERDICT_LABEL } from "@/lib/live-design";
import { SERIF, SANS } from "@/lib/design-tokens";

/**
 * /c/[key] — one fact-check, on its own page.
 *
 * The page a shared link opens. Everything a reader needs to judge the claim
 * without the broadcast: the words, the verdict, the figure on record, the
 * sources, how often it has been said — and, while the speaker is still on
 * air, a way into the live feed.
 */
export const dynamic = "force-dynamic";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const r = await getSharedClaim(hashFromKey(key));
  if (!r) return { title: "Fact-check · Vote Unbiased" };
  const c = r.claim;
  const label = VERDICT_LABEL[toOutcome(c.rating)];
  const verdict = label.charAt(0) + label.slice(1).toLowerCase();
  const short = c.quote.length > 90 ? c.quote.slice(0, 87).replace(/\s+\S*$/, "") + "…" : c.quote;
  const title = `${verdict}: “${short}”`;
  const description = (c.actual || "Checked against official data, sources cited.").slice(0, 200);
  const url = `https://voteunbiased.org${claimPath(c.videoId, c.quote)}`;
  return {
    title: `${title} · Vote Unbiased`,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "Vote Unbiased", type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ClaimPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const r = await getSharedClaim(hashFromKey(key));
  if (!r) notFound();
  const { claim: c, repeats } = r;
  const v = toOutcome(c.rating);
  const color = VERDICT_COLOR[v];
  const times = repeats.length + 1;
  const path = claimPath(c.videoId, c.quote);

  return (
    <div style={{ minHeight: "100vh", background: "#F8F5F0", color: "#14110E", fontFamily: SANS }}>
      {c.live && (
        <Link href="/live" style={{
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
          background: "#C2410C", color: "#fff", textDecoration: "none", padding: "12px 20px", fontSize: 14, fontWeight: 600,
        }}>
          <span>● {c.speaker ? `${c.speaker} is` : "This broadcast is"} live right now</span>
          <span>Watch the fact-checks →</span>
        </Link>
      )}
      <header style={{ maxWidth: 720, margin: "0 auto", padding: "18px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, color: "#14110E", textDecoration: "none" }}>
          <CheetahMark height={18} />
          <span style={{ fontFamily: SERIF, fontSize: 19 }}>Vote <em style={{ color: "#B8372D" }}>Unbiased</em></span>
        </Link>
        <Link href="/live" style={{ fontSize: 13, fontWeight: 600, color: "#14110E", textDecoration: "none", border: "1px solid #E2DED6", borderRadius: 6, padding: "7px 12px", background: "#fff" }}>Live fact-checks</Link>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "8px 20px 60px" }}>
        <div style={{ fontSize: 13, color: "#6F675E" }}>
          Fact-check · {fmtDate(c.date)}{c.speaker ? ` · ${c.speaker}` : ""}
        </div>
        <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: "clamp(28px, 5.4vw, 42px)", lineHeight: 1.15, letterSpacing: "-0.015em", margin: "10px 0 16px" }}>
          “{c.quote.charAt(0).toUpperCase() + c.quote.slice(1)}”
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ background: color, color: "#fff", fontWeight: 700, fontSize: 14, letterSpacing: "0.08em", padding: "6px 12px", borderRadius: 6 }}>
            {VERDICT_LABEL[v]}
          </span>
          {times > 1 && <span style={{ fontSize: 14, color: "#5F5850" }}>Said in {times} broadcasts</span>}
        </div>

        {c.actual && (
          <section style={{ background: "#fff", border: "1px solid #E2DED6", borderLeft: `4px solid ${color}`, borderRadius: 8, padding: "16px 18px", marginTop: 22 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8C8479", marginBottom: 6 }}>What the record shows</div>
            <div style={{ fontFamily: SERIF, fontSize: 18, lineHeight: 1.5 }}>{c.actual}</div>
            {c.explanation && c.explanation !== c.actual && (
              <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "#3D3833", margin: "12px 0 0" }}>{c.explanation}</p>
            )}
          </section>
        )}

        {c.sources.length > 0 && (
          <section style={{ marginTop: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8C8479", marginBottom: 6 }}>Sources</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.7 }}>
              {c.sources.slice(0, 6).map(s => (
                <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: "#0E7477" }}>{s.title || new URL(s.url).hostname}</a></li>
              ))}
            </ul>
          </section>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 24 }}>
          <ShareClaimButton path={path} quote={c.quote} verdict={VERDICT_LABEL[v]} variant="light" />
          <Link href={`/live?v=${encodeURIComponent(c.videoId)}`} style={{
            fontSize: 14, fontWeight: 600, color: "#14110E", textDecoration: "none",
            border: "1px solid #D9D3C8", background: "#fff", borderRadius: 8, padding: "11px 16px",
          }}>▶ {c.live ? "Watch live" : "Watch the broadcast"}</Link>
        </div>
        <div style={{ fontSize: 12.5, color: "#8C8479", marginTop: 10 }}>From: {c.title}</div>

        {repeats.length > 0 && (
          <section style={{ marginTop: 34 }}>
            <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 21, margin: "0 0 10px" }}>Every time it was said</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[{ path, date: c.date, rating: c.rating, title: c.title, same: true, here: true }, ...repeats.map(x => ({ ...x, here: false }))]
                .sort((a, b) => a.date.localeCompare(b.date))
                .map(x => {
                  const o = toOutcome(x.rating);
                  const row = (
                    <span style={{ display: "flex", alignItems: "center", gap: 10, background: x.here ? "#FFFEFC" : "#fff", border: `1px solid ${x.here ? "#14110E" : "#E2DED6"}`, borderRadius: 8, padding: "9px 12px", fontSize: 13.5, color: "#14110E" }}>
                      <span style={{ width: 92, flex: "none", color: "#6F675E" }}>{fmtDate(x.date)}</span>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.title}</span>
                      <span style={{ flex: "none", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: VERDICT_COLOR[o] }}>{VERDICT_LABEL[o]}</span>
                    </span>
                  );
                  return x.here ? <div key={x.path}>{row}</div> : <Link key={x.path} href={x.path} style={{ textDecoration: "none" }}>{row}</Link>;
                })}
            </div>
          </section>
        )}

        <p style={{ fontSize: 12.5, color: "#8C8479", lineHeight: 1.6, marginTop: 36, borderTop: "1px solid #E2DED6", paddingTop: 14 }}>
          Vote Unbiased checks what officials say against government data — BLS, BEA, Census, Treasury, the Fed — with sources cited.
          Every speaker, every party, same standard. <Link href="/" style={{ color: "#14110E" }}>See the data →</Link>
        </p>
      </main>
    </div>
  );
}
