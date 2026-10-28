import type { Metadata } from "next";
import Link from "next/link";
import { C, SERIF, SANS } from "@/lib/design-tokens";
import { getNewsFeed, refreshNews } from "@/lib/news/store";
import { listTrendingClaims } from "@/lib/trending-claims";
import { toOutcome, VERDICT_COLOR, ratingLabel } from "@/lib/live-design";
import { LEAN_TOTALS } from "@/lib/news/outlets";
import ClaimsFeed from "@/components/trending/ClaimsFeed";
import { NewsChrome, CoverageBar, LeanPill, LEAN_COLOR, ago } from "@/components/news/NewsChrome";
import type { Story, StoryArticle } from "@/lib/news/engine";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "News: who's covering what, and how each side headlined it · Vote Unbiased",
  description: "Today's stories from left, center and right outlets side by side: how much of each side covered them, blindspots, and the official figures checked.",
  alternates: { canonical: "https://voteunbiased.org/news" },
};

const VIEWS = [["top", "Top"], ["blindspots", "Blindspots"], ["claims", "Claims"]] as const;
const TOPICS = ["Economy", "Elections", "Immigration", "Crime", "World", "Politics"];
const K: React.CSSProperties = { fontSize: 10.5, letterSpacing: "0.09em", textTransform: "uppercase", color: C.mute, fontWeight: 600 };
const pct = (x: number) => `${Math.round(x * 100)}%`;
const SIDES = ["left", "center", "right"] as const;

/** Each side's headline: stored when built, else the first article per side. */
function sidesOf(s: Story): Partial<Record<(typeof SIDES)[number], StoryArticle>> {
  if (s.sides && Object.keys(s.sides).length) return s.sides;
  const out: Partial<Record<(typeof SIDES)[number], StoryArticle>> = {};
  const plain = (t: string) => !/\b(live|watch|opinion|analysis|podcast|newsletter)\b|^[^:]{0,25}:/i.test(t);
  for (const a of s.articles) if (a.lean !== "unrated" && !out[a.lean] && plain(a.title)) out[a.lean] = a;
  return out;
}
const rates = (s: Story) => `${pct(s.rate.left)} of left outlets · ${pct(s.rate.center)} center · ${pct(s.rate.right)} right`;
const kicker = (s: Story) => s.numbers ? "Data release" : s.topic;

function Lead({ s }: { s: Story }) {
  const sides = sidesOf(s);
  return (
    <section>
      <div style={K}>Lead story · {kicker(s)} · {s.outlets} outlets · {ago(s.lastSeen)}</div>
      <Link href={`/news/${s.slug}`} style={{ color: C.ink, textDecoration: "none" }}>
        <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "clamp(23px,3.2vw,31px)", lineHeight: 1.14, margin: "6px 0 10px" }}>{s.title}</h2>
      </Link>
      <div className="nw-cov" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 140 }}><CoverageBar coverage={s.coverage} height={10} /></div>
        <span style={{ fontSize: 12.5, color: C.sub, whiteSpace: "nowrap" }}>{rates(s)}</span>
      </div>
      {s.numbers && (
        <div style={{ background: "#E6F1EF", color: "#0E5E61", borderRadius: 8, padding: "8px 12px", fontSize: 13.5, marginBottom: 12 }}>
          <b>Official: {s.numbers.official}{s.numbers.metric === "payrolls" ? "K" : "%"}</b> ({s.numbers.source}, {s.numbers.officialLabel}) · {s.numbers.counts.match + s.numbers.counts.approx} of {s.articles.length - s.numbers.counts.none} headlines with a figure matched
        </div>
      )}
      <div style={K}>How each side headlined it</div>
      <div className="nw-sides" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8, marginTop: 7 }}>
        {SIDES.map(l => {
          const a = sides[l];
          return a ? (
            <a key={l} href={a.link} target="_blank" rel="noopener noreferrer nofollow" style={{ display: "block", background: "#fff", border: `1px solid ${C.rule}`, borderTop: `3px solid ${LEAN_COLOR[l]}`, borderRadius: 8, padding: "10px 12px", textDecoration: "none", color: C.ink }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, color: C.mute, marginBottom: 4 }}><LeanPill lean={l} />{a.name}</div>
              <div style={{ fontSize: 14, lineHeight: 1.38 }}>{a.title}</div>
            </a>
          ) : (
            <div key={l} style={{ border: `1px dashed ${C.rule}`, borderRadius: 8, padding: "10px 12px", fontSize: 12.5, color: C.mute, display: "flex", alignItems: "center", gap: 6 }}><LeanPill lean={l} />No {l === "center" ? "center" : `${l}-leaning`} outlet covered it</div>
          );
        })}
      </div>
      <div style={{ fontSize: 12.5, color: C.sub, marginTop: 8 }}>
        <Link href={`/news/${s.slug}`} style={{ color: C.ink, fontWeight: 600 }}>Full coverage from all {s.outlets} outlets →</Link>
      </div>
    </section>
  );
}

function Secondary({ s }: { s: Story }) {
  const sides = sidesOf(s);
  const contrast = sides.left && sides.right;
  return (
    <div>
      <div style={K}>{kicker(s)} · {s.outlets} outlets</div>
      <Link href={`/news/${s.slug}`} style={{ color: C.ink, textDecoration: "none" }}>
        <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 19, lineHeight: 1.24, margin: "5px 0 8px" }}>{s.title}</h3>
      </Link>
      {contrast ? (
        (["left", "right"] as const).map(l => (
          <div key={l} style={{ fontSize: 13, lineHeight: 1.45, color: "#3d3833", marginTop: 4 }}>
            <LeanPill lean={l} /> “{sides[l]!.title}” <span style={{ color: C.mute }}>{sides[l]!.name}</span>
          </div>
        ))
      ) : (
        <>
          <CoverageBar coverage={s.coverage} />
          <div style={{ fontSize: 12.5, color: C.sub, marginTop: 6 }}>{rates(s)}</div>
        </>
      )}
    </div>
  );
}

function Row({ s }: { s: Story }) {
  return (
    <Link href={`/news/${s.slug}`} className="nw-row" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 96px 54px", gap: 14, alignItems: "center", padding: "12px 0", borderTop: `1px solid ${C.rule}`, textDecoration: "none", color: C.ink }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.3 }}>{s.title}</span>
        {s.blindspot && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 999, background: "#EEECF6", color: "#4D3E8F", whiteSpace: "nowrap", verticalAlign: 2 }}>Blindspot</span>}
        {s.numbers && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 999, background: "#E6F1EF", color: "#0E7477", whiteSpace: "nowrap", verticalAlign: 2 }}>Official {s.numbers.official}{s.numbers.metric === "payrolls" ? "K" : "%"}</span>}
        <span className="nw-meta" style={{ display: "block", fontSize: 11.5, color: C.mute, marginTop: 2 }}>{kicker(s)} · {ago(s.lastSeen)}</span>
      </span>
      <CoverageBar coverage={s.coverage} height={6} />
      <span className="nw-n" style={{ textAlign: "right", fontSize: 12.5, color: C.sub }}>{s.outlets}</span>
    </Link>
  );
}

function BlindspotRail({ stories }: { stories: Story[] }) {
  const missed = (side: "left" | "right") => stories.filter(s => s.blindspot === side).slice(0, 3);
  const L = missed("left"), R = missed("right");
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 12, padding: "13px 15px" }}>
      <div style={{ ...K, color: "#4D3E8F" }}>Blindspots</div>
      <div style={{ fontSize: 12, color: C.sub, margin: "3px 0 10px" }}>Stories one side mostly skipped</div>
      {([["left", L], ["right", R]] as const).map(([side, list]) => (
        <div key={side} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 11.5, color: C.mute, marginBottom: 4 }}>Missed by the {side}</div>
          {!list.length && <div style={{ fontSize: 12.5, color: C.mute, marginBottom: 8 }}>None right now</div>}
          {list.map(s => (
            <Link key={s.id} href={`/news/${s.slug}`} style={{ display: "block", textDecoration: "none", color: C.ink, marginBottom: 10 }}>
              <div style={{ fontFamily: SERIF, fontSize: 14.5, lineHeight: 1.3 }}>{s.title}</div>
              <div style={{ fontSize: 11.5, color: C.sub, marginTop: 2 }}>{pct(s.rate[side])} of {side} outlets · {pct(s.rate[side === "left" ? "right" : "left"])} of {side === "left" ? "right" : "left"}</div>
            </Link>
          ))}
        </div>
      ))}
      <Link href="/news?view=blindspots" style={{ fontSize: 12.5, color: C.ink, fontWeight: 600 }}>All blindspots →</Link>
    </div>
  );
}

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ view?: string; topic?: string }> }) {
  const sp = await searchParams;
  const view = (VIEWS.find(([k]) => k === sp.view)?.[0]) || "top";
  const topic = TOPICS.find(t => t.toLowerCase() === (sp.topic || "").toLowerCase()) || null;
  let feed = view === "claims" ? null : await getNewsFeed().catch(() => null);
  if (view !== "claims" && !feed) feed = await refreshNews().catch(() => null);
  const all = feed?.stories || [];
  let stories = all;
  if (view === "blindspots") stories = stories.filter(s => s.blindspot);
  if (topic) stories = stories.filter(s => s.topic === topic);
  const claims = view === "top" ? (await listTrendingClaims().catch(() => [])).filter(c => !c.live).slice(0, 3) : [];

  // Lead: the top story with headlines from at least two sides.
  const front = view === "top" && !topic;
  const lead = front ? stories.find(s => Object.keys(sidesOf(s)).length >= 2) || stories[0] : null;
  const rest = stories.filter(s => s !== lead);
  const secondary = front ? rest.filter(s => sidesOf(s).left && sidesOf(s).right).slice(0, 2) : [];
  const list = rest.filter(s => !secondary.includes(s)).slice(0, 40);
  const outlets = LEAN_TOTALS.left + LEAN_TOTALS.center + LEAN_TOTALS.right + LEAN_TOTALS.unrated;

  const tabLink = (active: boolean): React.CSSProperties => ({ fontSize: 13, textDecoration: "none", color: active ? C.ink : C.sub, fontWeight: active ? 600 : 500, padding: "4px 0", borderBottom: active ? `2px solid ${C.ink}` : "2px solid transparent", whiteSpace: "nowrap" });

  const rail = (
    <aside className="nw-rail" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {view !== "blindspots" && <BlindspotRail stories={all} />}
      {claims.length > 0 && (
        <div style={{ background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 12, padding: "13px 15px" }}>
          <div style={{ ...K, color: "#B45309" }}>Checked claims</div>
          {claims.map(c => (
            <Link key={c.key} href={c.path} style={{ display: "block", textDecoration: "none", color: C.ink, marginTop: 10 }}>
              <div style={{ fontSize: 13.5, lineHeight: 1.35 }}>
                <span style={{ background: VERDICT_COLOR[toOutcome(c.rating)], color: "#fff", fontWeight: 700, fontSize: 9.5, letterSpacing: "0.06em", padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap", marginRight: 6 }}>{ratingLabel(c.rating)}</span>
                <span style={{ fontFamily: SERIF }}>“{c.quote.length > 90 ? c.quote.slice(0, 87).replace(/\s+\S*$/, "") + "…" : c.quote}”</span>
              </div>
              <div style={{ fontSize: 11.5, color: C.sub, marginTop: 3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{c.actual}</div>
            </Link>
          ))}
          <Link href="/news?view=claims" style={{ display: "block", fontSize: 12.5, color: C.ink, fontWeight: 600, marginTop: 10 }}>All checked claims →</Link>
        </div>
      )}
      <div style={{ background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 12, padding: "11px 15px", fontSize: 12, color: C.sub, lineHeight: 1.55 }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 4 }}>
          {(["left", "center", "right"] as const).map(l => <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: LEAN_COLOR[l], display: "inline-block" }} />{l[0].toUpperCase() + l.slice(1)}</span>)}
        </div>
        {outlets} outlets{feed ? ` · updated ${ago(feed.at)}` : ""} · <Link href="/methodology#news" style={{ color: C.sub }}>how lean is measured</Link>
      </div>
    </aside>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: SANS }}>
      <style>{`
        .nw-grid{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:28px;align-items:start}
        .nw-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}
        @media (max-width:900px){.nw-grid{grid-template-columns:minmax(0,1fr)}.nw-rail{order:2}}
        @media (max-width:640px){
          .nw-sides{display:flex!important;overflow-x:auto;scroll-snap-type:x mandatory;margin:7px -20px 0;padding:0 20px 4px;scrollbar-width:none}
          .nw-sides>*{flex:0 0 78%;scroll-snap-align:start}
          .nw-two{grid-template-columns:minmax(0,1fr)}
          .nw-row{grid-template-columns:minmax(0,1fr) 60px!important}
          .nw-n{display:none}
          .nw-cov{flex-wrap:wrap}
        }
      `}</style>
      <NewsChrome active="news" />
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "14px 20px 60px" }}>
        <div data-nosnippet style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", borderBottom: `1px solid ${C.rule}`, paddingBottom: 8, marginBottom: 18 }}>
          {VIEWS.map(([k, l]) => <Link key={k} href={k === "top" ? "/news" : `/news?view=${k}`} style={tabLink(view === k && !topic)}>{l}</Link>)}
          <details style={{ position: "relative" }}>
            <summary style={{ ...tabLink(!!topic), listStyle: "none", cursor: "pointer" }}>{topic || "Topics"} ▾</summary>
            <div style={{ position: "absolute", zIndex: 20, top: "calc(100% + 6px)", left: 0, background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 10, padding: 6, boxShadow: "0 10px 28px -12px rgba(20,17,14,.3)", minWidth: 150 }}>
              {TOPICS.map(t => <Link key={t} href={`/news?topic=${t.toLowerCase()}`} style={{ display: "block", padding: "6px 10px", fontSize: 13, color: C.ink, textDecoration: "none", borderRadius: 6, background: topic === t ? "#F3EFE8" : "transparent" }}>{t}</Link>)}
            </div>
          </details>
          {feed && <span style={{ marginLeft: "auto", fontSize: 12, color: C.mute }}>Updated {ago(feed.at)}</span>}
        </div>

        {view === "claims" ? null : (
          <div className="nw-grid">
            <div style={{ minWidth: 0 }}>
              {view === "blindspots" && <p style={{ fontSize: 13.5, color: C.sub, margin: "0 0 10px", maxWidth: 720 }}>Stories one side's outlets largely skipped: they covered it at a quarter of the other side's rate or less. <Link href="/methodology#news" style={{ color: C.sub }}>How it's measured</Link></p>}
              {topic && <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 26, margin: "0 0 6px" }}>{topic}</h1>}
              {lead && <Lead s={lead} />}
              {secondary.length > 0 && (
                <div className="nw-two" style={{ marginTop: 24, paddingTop: 18, borderTop: `1px solid ${C.rule}` }}>
                  {secondary.map(s => <Secondary key={s.id} s={s} />)}
                </div>
              )}
              {list.length > 0 && (
                <div style={{ marginTop: lead ? 26 : 0 }}>
                  {lead && <div style={{ ...K, marginBottom: 2 }}>More stories</div>}
                  {list.map(s => <Row key={s.id} s={s} />)}
                </div>
              )}
              {!stories.length && <p style={{ color: C.sub }}>No stories here right now.</p>}
            </div>
            {rail}
          </div>
        )}
      </main>
      {view === "claims" && <div style={{ marginTop: -40 }}><ClaimsFeed /></div>}
      {view !== "claims" && (
        <p style={{ maxWidth: 1180, margin: "-30px auto 40px", padding: "0 20px", fontSize: 12, color: C.mute, lineHeight: 1.6 }}>
          We link to each outlet's own article and show only headlines. Left / center / right comes from published research on each outlet's audience (Robertson et al., 2018), not our judgment.
        </p>
      )}
    </div>
  );
}
