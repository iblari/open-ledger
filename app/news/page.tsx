import type { Metadata } from "next";
import Link from "next/link";
import { C, SERIF, SANS } from "@/lib/design-tokens";
import { getNewsFeed, refreshNews } from "@/lib/news/store";
import { listTrendingClaims } from "@/lib/trending-claims";
import { toOutcome, VERDICT_COLOR, ratingLabel } from "@/lib/live-design";
import { LEAN_TOTALS } from "@/lib/news/outlets";
import ClaimsFeed from "@/components/trending/ClaimsFeed";
import { NewsChrome, CoverageBar, ago } from "@/components/news/NewsChrome";
import type { Story } from "@/lib/news/engine";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "News: who's covering what, and do the numbers check out? · Vote Unbiased",
  description: "Today's stories from left, center and right outlets, with how much of each side covered them, blindspots, and the official figures checked against what was reported.",
  alternates: { canonical: "https://voteunbiased.org/news" },
};

const VIEWS = [["top", "Top stories"], ["blindspots", "Blindspots"], ["claims", "Claims"]] as const;
const TOPICS = ["Economy", "Elections", "Immigration", "Crime", "World", "Politics"];

function chip(active: boolean): React.CSSProperties {
  return { fontSize: 12.5, padding: "5px 12px", borderRadius: 999, textDecoration: "none", whiteSpace: "nowrap",
    background: active ? C.ink : "#fff", color: active ? "#fff" : C.sub, border: `1px solid ${active ? C.ink : C.rule}` };
}

function StoryCard({ s }: { s: Story }) {
  const n = s.numbers;
  return (
    <Link href={`/news/${s.slug}`} style={{ display: "block", background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 12, padding: "14px 16px", textDecoration: "none", color: C.ink }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>
        {n ? <span style={{ color: "#0E7477", background: "#E6F1EF", borderRadius: 999, padding: "2px 8px" }}>Data release</span>
          : s.blindspot ? <span style={{ color: "#4D3E8F", background: "#EEECF6", borderRadius: 999, padding: "2px 8px" }}>Blindspot · mostly {s.blindspot === "left" ? "right" : "left"}-leaning coverage</span>
          : <span style={{ color: C.mute }}>{s.topic}</span>}
        <span style={{ color: C.mute, fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>{ago(s.lastSeen)}</span>
      </div>
      <div style={{ fontFamily: SERIF, fontSize: 19, lineHeight: 1.28, margin: "7px 0 9px" }}>{s.title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "center" }}>
        <div style={{ fontSize: 12.5, color: C.sub, minWidth: 0 }}>
          {n ? <><span style={{ color: "#0E7477", fontWeight: 600 }}>● Official {n.metric === "payrolls" ? `${n.official}K` : `${n.official}%`} ({n.source}, {n.officialLabel})</span> · {n.counts.match + n.counts.approx} of {s.articles.length - n.counts.none} articles with a figure matched</>
            : <>{s.outlets} outlets · {s.coverage.left} left, {s.coverage.center} center, {s.coverage.right} right</>}
        </div>
        <div style={{ width: 120 }}><CoverageBar coverage={s.coverage} /></div>
      </div>
    </Link>
  );
}

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ view?: string; topic?: string }> }) {
  const sp = await searchParams;
  const view = (VIEWS.find(([k]) => k === sp.view)?.[0]) || "top";
  const topic = TOPICS.find(t => t.toLowerCase() === (sp.topic || "").toLowerCase()) || null;
  let feed = view === "claims" ? null : await getNewsFeed().catch(() => null);
  if (view !== "claims" && !feed) feed = await refreshNews().catch(() => null);
  let stories = feed?.stories || [];
  if (view === "blindspots") stories = stories.filter(s => s.blindspot);
  if (topic) stories = stories.filter(s => s.topic === topic);
  const claims = view === "top" && !topic ? (await listTrendingClaims().catch(() => [])).filter(c => !c.live).slice(0, 4) : [];

  // Top stories: one checked claim after every three stories.
  const items: ({ k: "s"; s: Story } | { k: "c"; c: (typeof claims)[number] })[] = [];
  let ci = 0;
  stories.slice(0, 40).forEach((s, i) => { items.push({ k: "s", s }); if (i % 3 === 2 && claims[ci]) items.push({ k: "c", c: claims[ci++] }); });

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: SANS }}>
      <NewsChrome active="news" />
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "18px 20px 6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "clamp(26px,4vw,34px)", margin: "4px 0 4px" }}>Who's covering what</h1>
            <p style={{ margin: 0, color: C.sub, fontSize: 14.5, maxWidth: 680 }}>Today's stories from {LEAN_TOTALS.left + LEAN_TOTALS.center + LEAN_TOTALS.right + LEAN_TOTALS.unrated} outlets across the spectrum: how much of each side covered them, and whether the official numbers in them check out.</p>
          </div>
          {feed && <div style={{ fontSize: 12, color: C.mute }}>Updated {ago(feed.at)} · {feed.articles.toLocaleString()} articles read</div>}
        </div>
        <div data-nosnippet style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "16px 0 6px" }}>
          {VIEWS.map(([k, l]) => <Link key={k} href={k === "top" ? "/news" : `/news?view=${k}`} style={chip(view === k && !topic)}>{l}</Link>)}
          <span style={{ width: 1, background: C.rule, margin: "0 4px" }} />
          {TOPICS.map(t => <Link key={t} href={`/news?topic=${t.toLowerCase()}`} style={chip(topic === t)}>{t}</Link>)}
        </div>
      </main>
      {view === "claims" ? <ClaimsFeed /> : (
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "8px 20px 60px" }}>
          {view === "blindspots" && <p style={{ fontSize: 13, color: C.sub, margin: "0 0 12px", maxWidth: 760 }}>A blindspot is a story one side's outlets largely skipped: those outlets covered it at a quarter of the rate of the other side's or less, and the other side's coverage reached at least 20% of its outlets. <Link href="/methodology#news" style={{ color: C.sub }}>How it's measured</Link></p>}
          {!items.length && <p style={{ color: C.sub }}>No stories here right now.</p>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 520px), 1fr))", gap: 12 }}>
            {items.map((it, i) => it.k === "s" ? <StoryCard key={it.s.id} s={it.s} /> : (
              <Link key={"c" + i} href={it.c.path} style={{ display: "block", background: "#fff", border: `1px solid ${C.rule}`, borderLeft: `3px solid ${VERDICT_COLOR[toOutcome(it.c.rating)]}`, borderRadius: 0, padding: "14px 16px", textDecoration: "none", color: C.ink }}>
                <div style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600, color: "#B45309" }}>Claim · {it.c.speaker || "Broadcast"} <span style={{ color: C.mute, fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>{ago(it.c.date)}</span></div>
                <div style={{ fontFamily: SERIF, fontSize: 18, lineHeight: 1.3, margin: "7px 0 8px" }}>“{it.c.quote.length > 140 ? it.c.quote.slice(0, 137).replace(/\s+\S*$/, "") + "…" : it.c.quote}”</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: C.sub }}>
                  <span style={{ background: VERDICT_COLOR[toOutcome(it.c.rating)], color: "#fff", fontWeight: 700, fontSize: 10.5, letterSpacing: "0.06em", padding: "2px 7px", borderRadius: 4 }}>{ratingLabel(it.c.rating)}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.c.actual}</span>
                </div>
              </Link>
            ))}
          </div>
          <p style={{ fontSize: 12, color: C.mute, marginTop: 18, lineHeight: 1.6, maxWidth: 820 }}>We link to each outlet's own article and show only headlines. Left / center / right comes from published research on each outlet's audience (Robertson et al., 2018), not our judgment; outlets it didn't score are counted as not rated. <Link href="/methodology#news" style={{ color: C.mute }}>Method</Link></p>
        </div>
      )}
    </div>
  );
}
