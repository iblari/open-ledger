import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { STATES, stateByCode, raceTitle, daysToElection, factChecksFor, MID } from "@/lib/midterms";
import { C, SANS } from "@/lib/design-tokens";
import { NewsChrome } from "@/components/news/NewsChrome";
import { senatePolls } from "@/lib/polls";
import Metrics from "../Metrics";
import RaceCompare from "../RaceCompare";

export const revalidate = 600;
export function generateStaticParams() { return STATES.map(s => ({ st: s.st.toLowerCase() })); }

const matchup = (st: string) => {
  const s = stateByCode(st); if (!s) return "";
  return s.races.map(r => `${raceTitle(r).replace(" (special election)", " special")}: ${r.candidates.filter(c => c.main).map(c => c.name).join(" vs ")}`).join(" · ");
};

export async function generateMetadata({ params }: { params: Promise<{ st: string }> }): Promise<Metadata> {
  const { st } = await params;
  const s = stateByCode(st);
  if (!s) return { title: "2026 ballot · Vote Unbiased" };
  const title = `${s.name} 2026 ballot: compare the candidates`;
  const description = `${matchup(st)}. Money, voting record and positions in their own words, side by side. Facts only.`;
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
  const [polls] = await Promise.all([senatePolls()]);
  const pollsAt = Object.values(polls)[0]?.fetchedAt ?? null;
  const through = s.races.flatMap(r => r.candidates.map(c => c.fec?.through)).filter(Boolean).sort().pop() ?? null;
  const fc = await factChecksFor(s.races.flatMap(r => r.candidates.filter(c => c.main).map(c => c.name)));
  const days = daysToElection();
  const url = `https://voteunbiased.org/vote/${s.st.toLowerCase()}`;
  return (
    <div style={{ minHeight: "100vh", background: "#fff", color: C.ink, fontFamily: SANS }}>
      <style>{`
        .vc-wrap{background:#fff;border:1px solid ${C.rule};border-radius:10px}
        .vc-grid{display:grid;grid-template-columns:200px repeat(var(--n),minmax(190px,1fr))}
        .vc-l{padding:12px 16px;border-top:1px solid ${C.rule};color:${C.sub};font-size:13px;background:#fcfbf8}
        .vc-c{padding:12px 16px;border-top:1px solid ${C.rule};border-left:1px solid ${C.rule};font-size:14.5px;line-height:1.45;min-width:0}
        .vc-head{position:sticky;top:0;z-index:3;background:#fff;padding-top:12px;padding-bottom:10px;box-shadow:0 1px 0 ${C.rule}}
        .vc-l.vc-head{background:#fff;border-top:none}
        .vc-sec{grid-column:1/-1;padding:16px 16px 6px;font-family:${"'DM Sans',sans-serif"};font-size:17px;font-weight:700;color:${C.ink};border-top:1px solid ${C.rule};background:#fff}
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
        }
      `}</style>
      <NewsChrome active="vote" />
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "18px 20px 70px" }}>
        <div style={{ fontSize: 13, color: C.sub }}><Link href="/vote" style={{ color: C.sub }}>Vote</Link> › {s.name}</div>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: C.accent, marginTop: 12 }}>Election day · Tuesday, Nov 3{days > 0 ? ` · ${days} day${days === 1 ? "" : "s"}` : ""}</div>
        <h1 style={{ fontFamily: SANS, fontWeight: 700, letterSpacing: "-0.01em", fontSize: "clamp(28px, 4.2vw, 40px)", lineHeight: 1.08, margin: "6px 0 8px" }}>Your {s.name} ballot, side by side</h1>
        <p style={{ fontSize: 15.5, color: C.sub, lineHeight: 1.55, maxWidth: 720, margin: 0 }}>Nonpartisan polls, money, voting record and what the candidates say they'll do, in their own words. Facts only: we don't endorse anyone, and every figure links to its source.</p>
        <div className="vs-tabs" style={{ display: "flex", gap: 18, alignItems: "center", borderBottom: `1px solid ${C.rule}`, marginTop: 16 }}>
          {s.races.map(r => <a key={r.id} href={`#${r.id}`} style={{ padding: "9px 0", color: C.ink, textDecoration: "none", fontSize: 14, fontWeight: 700, borderBottom: "2px solid transparent" }}>{raceTitle(r)} ↓</a>)}
          <a href={`https://x.com/intent/post?text=${encodeURIComponent(`Compare the candidates on the ${s.name} ballot, side by side. Facts only.`)}&url=${encodeURIComponent(url)}`} style={{ marginLeft: "auto", fontSize: 13, color: C.sub, textDecoration: "none", whiteSpace: "nowrap" }}>Share ↗</a>
        </div>
        <div style={{ marginTop: 14 }}><Metrics through={through} pollsAt={pollsAt} /></div>
        {s.races.map(r => <RaceCompare key={r.id} race={r} fc={fc} polls={r.office === "senate" ? polls[r.st] : null} />)}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 26 }}>
          <a href="https://vote.gov" style={{ padding: "11px 18px", borderRadius: 8, background: C.ink, color: "#fff", textDecoration: "none", fontWeight: 600, fontSize: 14 }}>Find your polling place at vote.gov →</a>
          <a href={`https://x.com/intent/post?text=${encodeURIComponent(`Compare the candidates on the ${s.name} ballot, side by side. Facts only.`)}&url=${encodeURIComponent(url)}`} style={{ padding: "11px 18px", borderRadius: 8, background: "#fff", border: `1px solid ${C.rule}`, color: C.ink, textDecoration: "none", fontWeight: 600, fontSize: 14 }}>Share on X</a>
        </div>
        <div style={{ marginTop: 34, paddingTop: 16, borderTop: `1px solid ${C.rule}`, fontSize: 12.5, color: C.mute, lineHeight: 1.7, maxWidth: 820 }}>
          <b style={{ color: C.sub }}>How this is built.</b> Candidates: {MID.sources.candidates}. Money: {MID.sources.money}. Voting record: {MID.sources.record}; key votes are the final vote on major bills that passed both chambers; members who weren't in office for a vote show "Not in office". Positions: {MID.sources.positions} Where a member of Congress's campaign site doesn't cover a topic, we use their official House website, labelled as such (Senate websites block automated reading). Candidates are listed with Democrats first, then Republicans, then others, with no ranking intended. Spotted an error? Tell us through the site and we will fix it.
        </div>
      </div>
    </div>
  );
}
