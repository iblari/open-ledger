import type { Metadata } from "next";
import Link from "next/link";
import { C, SERIF, SANS } from "@/lib/design-tokens";
import { getNewsFeed, refreshNews } from "@/lib/news/store";
import { listTrendingClaims } from "@/lib/trending-claims";
import { toOutcome, VERDICT_COLOR, ratingLabel } from "@/lib/live-design";
import { LEAN_TOTALS } from "@/lib/news/outlets";
import ClaimsFeed from "@/components/trending/ClaimsFeed";
import { NewsChrome, CoverageBar, LeanPill, LEAN_COLOR, LEAN_TEXT, ago } from "@/components/news/NewsChrome";
import { blindspotLabel, type Story, type StoryArticle } from "@/lib/news/engine";
import Photo from "@/components/news/Photo";

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
const kicker = (s: Story) => s.numbers ? "Data release" : s.topic;
const H: React.CSSProperties = { fontFamily: SANS, fontWeight: 700, letterSpacing: "-0.01em", color: C.ink, margin: 0 };
const RED = "#C8102E";
/** "Covered by 26% of left-leaning, 38% of center and 24% of right-leaning outlets" */
const dek = (s: Story) => `Covered by ${s.coverage.left} of the ${LEAN_TOTALS.left} left-leaning, ${s.coverage.center} of ${LEAN_TOTALS.center} center and ${s.coverage.right} of ${LEAN_TOTALS.right} right-leaning outlets we read`;
const mins = (iso: string) => { const m = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000)); return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} hr` : `${Math.round(m / 1440)} d`; };
const P = (s: Story, o: { ratio?: string; priority?: boolean } = {}) => <Photo src={s.photo?.url} alt="" topic={s.topic} credit={s.photo?.name} alts={s.photo?.alts} ratio={o.ratio} priority={o.priority} />;

function Tags({ s }: { s: Story }) {
  return (
    <>
      {s.blindspot && <span style={{ fontSize: 11, fontWeight: 600, color: "#4D3E8F", marginRight: 10 }}>{blindspotLabel(s.blindspot)}</span>}
      {s.numbers && <span style={{ fontSize: 11, fontWeight: 600, color: "#0E7477", marginRight: 10 }}>Official figure {s.numbers.official}{s.numbers.metric === "payrolls" ? "K" : "%"}</span>}
    </>
  );
}

function Lead({ s }: { s: Story }) {
  const sides = sidesOf(s);
  return (
    <article>
      <Link href={`/news/${s.slug}`} style={{ display: "block", textDecoration: "none" }}>{P(s, { ratio: "3 / 2", priority: true })}</Link>
      <div style={{ ...K, color: C.sub, marginTop: 12 }}>{kicker(s)} · {s.outlets} outlets</div>
      <Link href={`/news/${s.slug}`} style={{ textDecoration: "none" }}>
        <h2 style={{ ...H, fontSize: "clamp(26px,2.7vw,34px)", lineHeight: 1.08, margin: "6px 0 10px" }}>{s.title}</h2>
      </Link>
      <p style={{ fontSize: 16, lineHeight: 1.45, color: "#3d3833", margin: "0 0 10px" }}>{dek(s)}.</p>
      <div style={{ maxWidth: 520 }}><CoverageBar coverage={s.coverage} size="lg" /></div>
      <div style={{ marginTop: 8 }}><Tags s={s} /></div>
      {Object.keys(sides).length >= 2 && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${C.rule}` }}>
          {SIDES.filter(l => sides[l]).map(l => (
            <a key={l} href={sides[l]!.link} target="_blank" rel="noopener noreferrer nofollow" style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "8px 0", borderBottom: `1px solid ${C.rule}`, textDecoration: "none", color: C.ink }}>
              <span style={{ flex: "0 0 108px", fontSize: 11, fontWeight: 600, color: LEAN_TEXT[l], textTransform: "uppercase", letterSpacing: "0.06em" }}>{l === "center" ? "Center" : `${l[0].toUpperCase()}${l.slice(1)}-leaning`}</span>
              <span style={{ fontSize: 14, lineHeight: 1.35 }}>“{sides[l]!.title}” <span style={{ color: C.mute, fontSize: 12 }}>{sides[l]!.name}</span></span>
            </a>
          ))}
        </div>
      )}
    </article>
  );
}

function Second({ s }: { s: Story }) {
  return (
    <article>
      <Link href={`/news/${s.slug}`} style={{ display: "block", textDecoration: "none" }}>{P(s, { priority: true })}</Link>
      <Link href={`/news/${s.slug}`} style={{ textDecoration: "none" }}>
        <h3 style={{ ...H, fontSize: 21, lineHeight: 1.18, margin: "10px 0 6px" }}>{s.title}</h3>
      </Link>
      <div style={{ margin: "4px 0 8px" }}><CoverageBar coverage={s.coverage} /></div>
      <p style={{ fontSize: 13.5, lineHeight: 1.45, color: C.sub, margin: 0 }}>{dek(s)}.</p>
      <div style={{ marginTop: 4 }}><Tags s={s} /></div>
    </article>
  );
}

function TextItem({ s }: { s: Story }) {
  return (
    <Link href={`/news/${s.slug}`} style={{ display: "block", textDecoration: "none", padding: "13px 0", borderTop: `1px solid ${C.rule}` }}>
      <div style={{ fontSize: 12, color: C.sub, marginBottom: 3 }}>{kicker(s)}</div>
      <div style={{ ...H, fontSize: 17, lineHeight: 1.25 }}>{s.title}</div>
      <div style={{ marginTop: 8 }}><CoverageBar coverage={s.coverage} size="sm" /></div>
    </Link>
  );
}

function Latest({ stories }: { stories: Story[] }) {
  const list = [...stories].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)).slice(0, 8);
  return (
    <section>
      <h2 style={{ ...H, fontSize: 24, color: RED, margin: "0 0 4px" }}>Latest</h2>
      {list.map(s => (
        <Link key={s.id} href={`/news/${s.slug}`} style={{ display: "grid", gridTemplateColumns: "58px minmax(0,1fr)", gap: 10, padding: "11px 0", borderBottom: `1px solid ${C.rule}`, textDecoration: "none" }}>
          <span style={{ fontSize: 13, color: RED, fontWeight: 500, paddingTop: 2 }}>{mins(s.lastSeen)}</span>
          <span>
            <span style={{ ...H, display: "block", fontSize: 15.5, lineHeight: 1.28 }}>{s.title}</span>
            <span style={{ display: "block", marginTop: 7 }}><CoverageBar coverage={s.coverage} size="sm" /></span>
          </span>
        </Link>
      ))}
    </section>
  );
}

function Card({ s }: { s: Story }) {
  return (
    <Link href={`/news/${s.slug}`} className="nw-card" style={{ display: "block", textDecoration: "none", color: C.ink }}>
      <span className="nw-card-img">{P(s)}</span>
      <span style={{ display: "block", minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12, color: C.sub, margin: "9px 0 3px" }} className="nw-card-k">{kicker(s)} · {s.outlets} outlets · {ago(s.lastSeen)}</span>
        <span style={{ ...H, display: "block", fontSize: 17, lineHeight: 1.24 }}>{s.title}</span>
        <span style={{ display: "block", marginTop: 9 }}><CoverageBar coverage={s.coverage} /></span>
        <span style={{ display: "block", marginTop: 5 }}><Tags s={s} /></span>
      </span>
    </Link>
  );
}

function BlindspotRail({ stories }: { stories: Story[] }) {
  const missed = (side: "left" | "right") => stories.filter(s => s.blindspot === side).slice(0, 3);
  return (
    <section style={{ borderTop: `3px solid ${C.ink}`, paddingTop: 10 }}>
      <h2 style={{ ...H, fontSize: 18 }}>Blindspots</h2>
      <div style={{ fontSize: 12.5, color: C.sub, margin: "2px 0 8px" }}>Stories one side's outlets mostly skipped</div>
      {(["left", "right"] as const).map(side => {
        const list = missed(side);
        return (
          <div key={side} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11.5, color: C.mute, marginBottom: 4 }}>{blindspotLabel(side)}</div>
            {!list.length && <div style={{ fontSize: 12.5, color: C.mute }}>None right now</div>}
            {list.map(s => (
              <Link key={s.id} href={`/news/${s.slug}`} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 72px", gap: 10, textDecoration: "none", padding: "8px 0", borderBottom: `1px solid ${C.rule}` }}>
                <span>
                  <span style={{ ...H, display: "block", fontSize: 14, lineHeight: 1.28 }}>{s.title}</span>
                  <span style={{ display: "block", marginTop: 6 }}><CoverageBar coverage={s.coverage} size="sm" /></span>
                </span>
                {P(s, { ratio: "1 / 1" })}
              </Link>
            ))}
          </div>
        );
      })}
      <Link href="/news?view=blindspots" style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>All blindspots →</Link>
    </section>
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

  // Front band: the lead (top story with a photo and two sides' headlines),
  // a second photo story, then text headlines; everything else as cards.
  const band = stories.length >= 4;
  const hasP = (s: Story) => !!s.photo;
  const lead = band ? stories.find(s => hasP(s) && Object.keys(sidesOf(s)).length >= 2) || stories.find(hasP) || stories[0] : null;
  const second = band ? stories.find(s => s !== lead && hasP(s)) || null : null;
  const texts = band ? stories.filter(s => s !== lead && s !== second).slice(0, 4) : [];
  const used = new Set([lead, second, ...texts].filter(Boolean));
  const cards = stories.filter(s => !used.has(s)).slice(0, 40);
  const outlets = LEAN_TOTALS.left + LEAN_TOTALS.center + LEAN_TOTALS.right + LEAN_TOTALS.unrated;

  const tabLink = (active: boolean): React.CSSProperties => ({ fontSize: 13, textDecoration: "none", color: active ? C.ink : C.sub, fontWeight: active ? 600 : 500, padding: "4px 0", borderBottom: active ? `2px solid ${C.ink}` : "2px solid transparent", whiteSpace: "nowrap" });

  const claimsBox = claims.length > 0 && (
    <section style={{ borderTop: `3px solid ${C.ink}`, paddingTop: 10 }}>
      <h2 style={{ ...H, fontSize: 18 }}>Checked claims</h2>
      {claims.map(c => (
        <Link key={c.key} href={c.path} style={{ display: "block", textDecoration: "none", color: C.ink, padding: "10px 0", borderBottom: `1px solid ${C.rule}` }}>
          <span style={{ background: VERDICT_COLOR[toOutcome(c.rating)], color: "#fff", fontWeight: 700, fontSize: 9.5, letterSpacing: "0.06em", padding: "2px 6px", borderRadius: 3, whiteSpace: "nowrap" }}>{ratingLabel(c.rating)}</span>
          <div style={{ ...H, fontSize: 14.5, lineHeight: 1.3, marginTop: 5 }}>“{c.quote.length > 90 ? c.quote.slice(0, 87).replace(/\s+\S*$/, "") + "…" : c.quote}”</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{c.actual}</div>
        </Link>
      ))}
      <Link href="/news?view=claims" style={{ display: "block", fontSize: 13, color: C.ink, fontWeight: 600, marginTop: 10 }}>All checked claims →</Link>
    </section>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#fff", color: C.ink, fontFamily: SANS }}>
      <style>{`
        .nw-band{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr) 300px;gap:0;align-items:start}
        .nw-band>*{padding:0 22px;border-left:1px solid ${C.rule}}
        .nw-band>*:first-child{padding-left:0;border-left:0}
        .nw-band>*:last-child{padding-right:0}
        .nw-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:26px 22px}
        .nw-lower{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:32px;align-items:start}
        .nw-card:hover span[style*="font-weight: 700"]{text-decoration:underline}
        @media (max-width:1080px){.nw-band{grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)}.nw-band>.nw-latest{grid-column:1/-1;padding:22px 0 0;border-left:0}.nw-cards{grid-template-columns:repeat(3,minmax(0,1fr))}}
        @media (max-width:900px){.nw-lower{grid-template-columns:minmax(0,1fr)}.nw-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media (max-width:640px){
          .nw-band{grid-template-columns:minmax(0,1fr)}
          .nw-band>*{padding:0!important;border-left:0!important}
          .nw-band>.nw-mid{padding-top:22px!important}
          .nw-band>.nw-latest{padding-top:22px!important}
          .nw-cards{grid-template-columns:minmax(0,1fr);gap:0}
          .nw-card{display:grid!important;grid-template-columns:minmax(0,1fr) 112px;gap:12px;padding:14px 0;border-top:1px solid ${C.rule}}
          .nw-card-img{order:2}
          .nw-card-k{margin-top:0!important}
          .nw-card-img .ph-credit{display:none}
        }
      `}</style>
      <NewsChrome active="news" />
      <main style={{ maxWidth: 1240, margin: "0 auto", padding: view === "claims" ? "14px 20px 0" : "14px 20px 60px" }}>
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

        {view === "claims" ? <ClaimsFeed embedded /> : (
          <>
            {view === "blindspots" && <p style={{ fontSize: 14, color: C.sub, margin: "0 0 16px", maxWidth: 760 }}>Stories one side's outlets largely skipped: they covered it at a quarter of the other side's rate or less. <Link href="/methodology#news" style={{ color: C.sub }}>How it's measured</Link></p>}
            {topic && <h1 style={{ ...H, fontSize: 30, margin: "0 0 14px" }}>{topic}</h1>}
            {lead && (
              <div className="nw-band">
                <div><Lead s={lead} /></div>
                <div className="nw-mid">
                  {second && <Second s={second} />}
                  <div style={{ marginTop: second ? 14 : 0 }}>{texts.map(s => <TextItem key={s.id} s={s} />)}</div>
                </div>
                <div className="nw-latest"><Latest stories={all.filter(x => !used.has(x))} /></div>
              </div>
            )}
            <div className="nw-lower" style={{ marginTop: lead ? 34 : 0, paddingTop: lead ? 18 : 0, borderTop: lead ? `3px solid ${C.ink}` : 0 }}>
              <div style={{ minWidth: 0 }}>
                {lead && cards.length > 0 && <h2 style={{ ...H, fontSize: 22, margin: "0 0 14px" }}>More stories</h2>}
                <div className="nw-cards">{cards.map(s => <Card key={s.id} s={s} />)}</div>
                {!stories.length && <p style={{ color: C.sub }}>No stories here right now.</p>}
              </div>
              <aside style={{ display: "flex", flexDirection: "column", gap: 26 }}>
                {view !== "blindspots" && <BlindspotRail stories={all.filter(s => s !== lead)} />}
                {claimsBox}
                <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.55 }}>
                  <div style={{ display: "flex", gap: 12, marginBottom: 4 }}>
                    {(["left", "center", "right"] as const).map(l => <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><i style={{ width: 10, height: 10, borderRadius: 2, background: l === "center" ? "#fff" : LEAN_COLOR[l], border: "1px solid #CFC9BF", display: "inline-block" }} />{l[0].toUpperCase() + l.slice(1)}</span>)}
                  </div>
                  {outlets} outlets{feed ? ` · updated ${ago(feed.at)}` : ""} · <Link href="/methodology#news" style={{ color: C.sub }}>how lean is measured</Link>
                </div>
              </aside>
            </div>
          </>
        )}
      </main>
      {view !== "claims" && (
        <p style={{ maxWidth: 1240, margin: "-30px auto 40px", padding: "0 20px", fontSize: 12, color: C.mute, lineHeight: 1.6 }}>
          We link to each outlet's own article and show only headlines, plus one photo per story from an outlet's own feed (credited; a center-rated outlet's photo is used first). Left / center / right comes from published research on each outlet's audience (Robertson et al., 2018), not our judgment.
        </p>
      )}
    </div>
  );
}
