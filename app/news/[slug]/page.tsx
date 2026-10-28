import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { C, SERIF, SANS } from "@/lib/design-tokens";
import { getStory } from "@/lib/news/store";
import { LEAN_TOTALS, type Lean } from "@/lib/news/outlets";
import { blindspotLabel, type Story, type StoryArticle } from "@/lib/news/engine";
import { storyImage, storyDataLine } from "@/lib/news/share";
import { NewsChrome, LeanPill, LEAN_COLOR, LEAN_LABEL, ago } from "@/components/news/NewsChrome";
import { CoverageGraphic } from "@/components/news/Visuals";
import Photo from "@/components/news/Photo";
import { OUTLET_BY_ID } from "@/lib/news/outlets";

export const revalidate = 300;
const idOf = (slug: string) => slug.split("-").pop() || "";
const time = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const s = await getStory(idOf((await params).slug));
  if (!s) return { title: "Story · Vote Unbiased" };
  const desc = `${storyDataLine(s)}.${s.numbers ? ` Official figure: ${s.numbers.official}${s.numbers.metric === "payrolls" ? "K" : "%"} (${s.numbers.source}).` : ""}`;
  const url = `https://voteunbiased.org/news/${s.slug}`;
  const image = { url: storyImage(s), width: 1200, height: 630, alt: `Who covered it: ${s.title}` };
  return {
    title: `${s.title} · Coverage · Vote Unbiased`, description: desc, alternates: { canonical: url }, robots: { index: s.outlets >= 5 },
    openGraph: { title: s.title, description: desc, url, siteName: "Vote Unbiased", type: "article", images: [image] },
    twitter: { card: "summary_large_image", title: s.title, description: desc, images: [image.url] },
  };
}

const VERDICT: Record<string, { t: string; c: string }> = {
  match: { t: "matches", c: "#0E7477" }, approx: { t: "rounded", c: "#8a6d1f" }, monthly: { t: "monthly rate as yearly", c: "#C2410C" }, different: { t: "different figure", c: "#C2410C" },
};

function Col({ lean, arts }: { lean: Lean; arts: StoryArticle[] }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.sub, marginBottom: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: 2, background: LEAN_COLOR[lean] }} />{LEAN_LABEL[lean]} <span style={{ fontWeight: 400, color: C.mute }}>· {arts.length}</span>
      </div>
      {!arts.length && <div style={{ fontSize: 12.5, color: C.mute, padding: "8px 0" }}>No coverage found.</div>}
      {arts.map(a => (
        <a key={a.link} href={a.link} target="_blank" rel="noopener noreferrer nofollow" style={{ display: "block", textDecoration: "none", color: C.ink, background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 8, padding: "9px 11px", marginBottom: 6 }}>
          <div style={{ fontSize: 11.5, color: C.mute, display: "flex", alignItems: "center", gap: 6 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/news/icon?d=${OUTLET_BY_ID.get(a.outlet)?.domain}`} alt="" width={14} height={14} loading="lazy" style={{ borderRadius: 3 }} />
            {a.name} · {ago(a.published)}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.35, marginTop: 2 }}>{a.title}</div>
          {a.number && <div style={{ fontSize: 11.5, marginTop: 4, color: VERDICT[a.number.verdict].c, fontWeight: 600 }}>{a.number.said}{a.number.said < 30 ? "%" : ""}: {VERDICT[a.number.verdict].t}</div>}
        </a>
      ))}
    </div>
  );
}

export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const s: Story | null = await getStory(idOf((await params).slug));
  if (!s) notFound();
  const by = (l: Lean) => s.articles.filter(a => a.lean === l);
  const firsts: StoryArticle[] = [];
  for (const a of s.articles) if (!firsts.some(f => f.outlet === a.outlet)) firsts.push(a);
  const n = s.numbers;
  const unit = n?.metric === "payrolls" ? "K" : "%";
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <div style={{ minHeight: "100vh", background: "#fff", color: C.ink, fontFamily: SANS }}>
      <NewsChrome active="news" />
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "18px 20px 60px" }}>
        <div data-nosnippet style={{ fontSize: 13, color: C.sub }}><Link href="/news" style={{ color: C.sub }}>News</Link> › {s.topic}</div>
        <h1 style={{ fontFamily: SANS, fontWeight: 700, letterSpacing: "-0.01em", fontSize: "clamp(26px,3.8vw,40px)", lineHeight: 1.08, margin: "8px 0 8px", maxWidth: 920 }}>{s.title}</h1>
        <div style={{ fontSize: 13, color: C.sub }}>First reported {time(s.firstSeen)} · {s.articles.length} articles from {s.outlets} outlets</div>
        {s.photo && (
          <figure style={{ margin: "16px 0 0", maxWidth: 920 }}>
            <Photo src={s.photo.url} alt="" topic={s.topic} credit={s.photo.name} alts={s.photo.alts} ratio="16 / 9" priority />
          </figure>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 14, marginTop: 16 }}>
          <section style={{ background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 12, padding: "14px 16px" }}>
            <CoverageGraphic s={s} />
            <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.6, marginTop: 10 }}>
              {pct(s.rate.left)} of the {LEAN_TOTALS.left} left-leaning outlets we read · {pct(s.rate.center)} of {LEAN_TOTALS.center} center · {pct(s.rate.right)} of {LEAN_TOTALS.right} right-leaning{s.coverage.unrated ? ` · plus ${s.coverage.unrated} not rated` : ""}
            </div>
            {s.blindspot && <div style={{ marginTop: 10, background: "#EEECF6", color: "#4D3E8F", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}><b>Blindspot:</b> {blindspotLabel(s.blindspot)?.toLowerCase()}. <Link href="/methodology#news" style={{ color: "#4D3E8F" }}>How it's measured</Link></div>}
          </section>
          <section style={{ background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 12, padding: "14px 16px" }}>
            {n ? (<>
              <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: C.mute, fontWeight: 600, marginBottom: 8 }}>The numbers in the coverage</div>
              <div style={{ fontSize: 15 }}><b>Official:</b> {n.label} <b style={{ color: "#0E7477" }}>{n.official}{unit}</b> ({n.officialLabel}, <a href={n.url} target="_blank" rel="noopener noreferrer" style={{ color: C.sub }}>{n.source}</a>)</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.8, marginTop: 6 }}>
                <div><span style={{ color: "#0E7477" }}>●</span> {n.counts.match} reported it correctly{n.monthly != null ? ` (the yearly ${n.official}%, the monthly ${n.monthly}%, or the month before)` : n.previous != null ? ` (or the month before, ${n.previous}${unit})` : ""}</div>
                {n.counts.approx > 0 && <div><span style={{ color: "#8a6d1f" }}>●</span> {n.counts.approx} rounded it ("nearly", "about")</div>}
                {n.counts.monthly > 0 && <div><span style={{ color: "#C2410C" }}>●</span> {n.counts.monthly} gave the monthly rate ({n.monthly}%) as if it were the yearly one</div>}
                {n.counts.different > 0 && <div><span style={{ color: "#C2410C" }}>●</span> {n.counts.different} used a different figure</div>}
                <div style={{ color: C.mute }}>● {n.counts.none} gave no figure in the headline or summary</div>
              </div>
              <div style={{ fontSize: 11.5, color: C.mute, marginTop: 6 }}>Checked against headlines and feed summaries only, not full articles.</div>
            </>) : (<>
              <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: C.mute, fontWeight: 600, marginBottom: 8 }}>Who reported it first</div>
              {firsts.slice(0, 5).map(a => (
                <div key={a.link} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, padding: "3px 0" }}>
                  <span style={{ width: 128, color: C.sub, flex: "none" }}>{time(a.published)}</span><span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span><LeanPill lean={a.lean} />
                </div>
              ))}
            </>)}
          </section>
        </div>

        <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 21, margin: "26px 0 10px" }}>Coverage</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 14 }}>
          <Col lean="left" arts={by("left")} /><Col lean="center" arts={by("center")} /><Col lean="right" arts={by("right")} />
          {by("unrated").length > 0 && <Col lean="unrated" arts={by("unrated")} />}
        </div>
        <p style={{ fontSize: 12, color: C.mute, marginTop: 18, lineHeight: 1.6, maxWidth: 820 }}>Headlines link to each outlet's own article. Lean is from published research on each outlet's audience (Robertson et al., 2018), not our judgment of its content. Stories are grouped automatically from {LEAN_TOTALS.left + LEAN_TOTALS.center + LEAN_TOTALS.right + LEAN_TOTALS.unrated} outlets' public feeds. <Link href="/methodology#news" style={{ color: C.mute }}>Method</Link></p>
      </main>
    </div>
  );
}
