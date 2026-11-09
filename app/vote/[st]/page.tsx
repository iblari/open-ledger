import { getResults, type RaceResult } from "@/lib/results";
import { outcomeOf, ResultCard } from "@/components/vote/FinalResults";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { STATES, stateByCode, raceTitle, factChecksFor } from "@/lib/midterms";
import { C, SANS, SERIF } from "@/lib/design-tokens";
import FeedbackBanner from "@/app/dashboard/FeedbackBanner";
import { NewsChrome } from "@/components/news/NewsChrome";
import { senatePolls } from "@/lib/polls";
import Metrics from "../Metrics";
import { stateTrends } from "@/lib/state-trends";
import RaceCompare from "../RaceCompare";

export const revalidate = 120;
export function generateStaticParams() { return STATES.map(s => ({ st: s.st.toLowerCase() })); }

const matchup = (st: string) => {
  const s = stateByCode(st); if (!s) return "";
  return s.races.map(r => `${raceTitle(r).replace(" (special election)", " special")}: ${r.candidates.filter(c => c.main).map(c => c.name).join(" vs ")}`).join(" · ");
};

/** "Ossoff 59.1%, Collins 40.9%" from the latest official counts, for titles and snippets. */
const lead = (r: RaceResult | null | undefined) => {
  if (!r) return null;
  const tot = r.cands.reduce((a, c) => a + c.votes, 0); if (!tot) return null;
  return [...r.cands].sort((a, b) => b.votes - a.votes).slice(0, 2).map(c => `${c.name.split(" ").slice(-1)[0]} ${((c.votes / tot) * 100).toFixed(1)}%`).join(", ");
};

export async function generateMetadata({ params }: { params: Promise<{ st: string }> }): Promise<Metadata> {
  const { st } = await params;
  const s = stateByCode(st);
  if (!s) return { title: "2026 ballot · Vote Unbiased" };
  const res = await getResults(s.races.map(r => r.id)).catch(() => ({} as Record<string, RaceResult | null>));
  const offices = s.races.map(r => r.office === "senate" ? "Senate" : "Governor");
  const live = s.races.map(r => ({ r, l: lead(res[r.id]), w: res[r.id]?.called?.name ?? null })).filter(x => x.l || x.w);
  // "<State> election results 2026" is what people search.
  const title = `${s.name} Election Results 2026: ${[...new Set(offices)].join(" & ")} Race${s.races.length > 1 ? "s" : ""}`;
  const description = live.length
    ? `${live.map(x => `${raceTitle(x.r).replace(" (special election)", " special")}: ${x.w ? `${x.w} won (AP call)` : "not called"}${x.l ? `, ${x.l}` : ""}`).join(" · ")}. Unofficial counts from the state, with sources. ${matchup(st)}.`
    : `${matchup(st)}. Results, plus each candidate's record and positions side by side. Facts only.`;
  const url = `https://voteunbiased.org/vote/${s.st.toLowerCase()}`;
  return { title: `${title} · Vote Unbiased`, description, alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "Vote Unbiased", type: "website" },
    twitter: { card: "summary_large_image", title, description } };
  // og:image comes from ./opengraph-image.tsx
}

export default async function StateBallot({ params }: { params: Promise<{ st: string }> }) {
  const { st } = await params;
  const s = stateByCode(st);
  if (!s) notFound();
  const initialRes = await getResults(s.races.map(r => r.id)).catch(() => ({} as Record<string, RaceResult | null>));
  const [polls, trends] = await Promise.all([senatePolls(), stateTrends(s.st)]);
  const pollsAt = Object.values(polls)[0]?.fetchedAt ?? null;
  const through = s.races.flatMap(r => r.candidates.map(c => c.fec?.through)).filter(Boolean).sort().pop() ?? null;
  const fc = await factChecksFor(s.races.flatMap(r => r.candidates.filter(c => c.main).map(c => c.name)));
  const url = `https://voteunbiased.org/vote/${s.st.toLowerCase()}`;
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: SANS }}>
      <style>{`
        .vc-wrap{background:#fff;border:1px solid ${C.rule};border-radius:14px}
        .vc-grid{display:grid;grid-template-columns:200px repeat(var(--n),minmax(190px,1fr))}
        .vc-l{padding:12px 16px;border-top:1px solid ${C.rule};color:${C.sub};font-size:13px;background:#fdfbf8}
        .vc-c{padding:12px 16px;border-top:1px solid ${C.rule};border-left:1px solid ${C.rule};font-size:14.5px;line-height:1.45;min-width:0}
        .vc-head{position:sticky;top:var(--vu-chrome-h, 0px);z-index:3;background:#fff;padding-top:12px;padding-bottom:10px;box-shadow:0 1px 0 ${C.rule}}
        .vc-l.vc-head{background:#fff;border-top:none}
        .vc-sec{grid-column:1/-1;padding:16px 16px 6px;font-family:${"'Source Serif 4',Georgia,serif"};font-size:20px;font-weight:500;color:${C.ink};border-top:1px solid ${C.rule};background:#fff}
        .vc-q{font-size:15px}
        .vc-note{grid-column:1/-1;padding:11px 16px;border-top:1px solid ${C.rule};font-size:13.5px;color:${C.sub};line-height:1.55}
        @media (max-width: 720px){
          .vc-wrap.vc-many{overflow-x:auto;-webkit-overflow-scrolling:touch}
          .vc-wrap.vc-many .vc-grid{min-width:calc(var(--n) * 150px)}
          .vc-wrap.vc-many .vc-head{position:static}
          .vc-grid{grid-template-columns:repeat(var(--n),minmax(0,1fr))}
          .vc-l{grid-column:1/-1;padding:10px 14px 2px;border-top:1px solid ${C.rule};background:#fff}
          .vc-l.vc-head{display:none}
          .vc-c{border-top:none;padding:4px 14px 12px;font-size:14px}
          .vc-c + .vc-c{border-left:1px solid ${C.rule}}
          .vc-c:not(.vc-c + .vc-c){border-left:none}
          .vc-head.vc-c{padding-top:10px;border-top-width:3px}
          .vc-sec{padding:14px 14px 4px;font-size:16px}
          .vc-q{font-size:13.5px}
          .vc-head.vc-c > div:first-child{font-size:15px!important}
        }
      `}</style>
      <NewsChrome active="vote" />
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "18px 20px 70px" }}>
        <div style={{ fontSize: 13, color: C.sub }}><Link href="/vote" style={{ color: C.sub }}>Vote</Link> › {s.name}</div>
        <h1 style={{ fontFamily: SERIF, fontWeight: 500, letterSpacing: "-0.015em", fontSize: "clamp(30px, 4.4vw, 46px)", lineHeight: 1.08, margin: "8px 0 0" }}>{s.name} election results 2026</h1>
        <div className="vs-tabs" style={{ display: "flex", gap: 18, alignItems: "center", borderBottom: `1px solid ${C.rule}`, marginTop: 16, overflowX: "auto", whiteSpace: "nowrap", scrollbarWidth: "none" }}>
          {s.races.map(r => <a key={r.id} href={`#${r.id}`} style={{ padding: "9px 0", color: C.ink, textDecoration: "none", fontSize: 14, fontWeight: 700, borderBottom: "2px solid transparent" }}>{raceTitle(r)} ↓</a>)}
          <a href="#before" style={{ padding: "9px 0", color: C.sub, textDecoration: "none", fontSize: 14, fontWeight: 600 }}>The candidates ↓</a>
          <a href={`https://x.com/intent/post?text=${encodeURIComponent(`${s.name} 2026 election results, with sources. Facts only.`)}&url=${encodeURIComponent(url)}`} style={{ marginLeft: "auto", fontSize: 13, color: C.sub, textDecoration: "none", whiteSpace: "nowrap" }}>Share ↗</a>
        </div>
        <div className="vs-res" style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(2, s.races.length)},minmax(0,1fr))`, gap: 14, marginTop: 16, maxWidth: s.races.length > 1 ? "none" : 620 }}>
          {s.races.map(r => <div key={r.id} id={r.id}><ResultCard o={outcomeOf(r, initialRes[r.id] ?? null)} /></div>)}
        </div>
        <style>{`@media(max-width:760px){.vs-res{grid-template-columns:minmax(0,1fr)!important}}`}</style>
        <h2 id="before" style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 26, letterSpacing: "-0.015em", margin: "34px 0 4px" }}>The candidates, before the election</h2>
        <p style={{ fontSize: 14, color: C.sub, margin: "0 0 4px", maxWidth: 720 }}>What we published before Nov 3: polls, money, voting records and positions in their own words. Kept as the record.</p>
        <div style={{ marginTop: 14 }}><Metrics through={through} pollsAt={pollsAt} /></div>
        {s.races.map(r => <RaceCompare key={r.id} race={r} fc={fc} polls={r.office === "senate" ? polls[r.st] : null} trends={trends} />)}
        <div style={{ marginTop: 26, fontSize: 13, display: "flex", gap: 16 }}>
          <Link href="/methodology" style={{ color: C.sub }}>Methodology</Link>
        </div>
      </div>
      <FeedbackBanner page="vote" />
    </div>
  );
}
