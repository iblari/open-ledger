import type { Metadata } from "next";
import Link from "next/link";
import { MID, STATES, stateByCode, raceTitle } from "@/lib/midterms";
import { senatePolls, pollShare, pollLead } from "@/lib/polls";
import { C, SANS, SERIF } from "@/lib/design-tokens";
import { NewsChrome } from "@/components/news/NewsChrome";
import RacesTable, { type RaceRow } from "./RacesTable";
import StatePicker from "./StatePicker";
import Metrics from "./Metrics";
import ChangeState from "./ChangeState";
import { voterState } from "@/lib/vote-geo";

export const revalidate = 600;
export const metadata: Metadata = {
  title: "Compare the candidates on your 2026 ballot · Vote Unbiased",
  description: "Senate and governor candidates side by side: nonpartisan polls, money, voting record and positions in their own words. Facts only, every number sourced.",
  alternates: { canonical: "https://voteunbiased.org/vote" },
  openGraph: { title: "Compare the candidates on your 2026 ballot", description: "Polls, money, voting record and positions in their own words, side by side. Facts only.", url: "https://voteunbiased.org/vote", siteName: "Vote Unbiased", type: "website" },
};

const H: React.CSSProperties = { fontFamily: SERIF, fontWeight: 500, letterSpacing: "-0.015em", margin: 0 };
const PARTY: Record<string, string> = { D: "#4361a6", R: "#b8372d" };
const tag = (p: string) => <span style={{ display: "inline-block", minWidth: 16, textAlign: "center", fontSize: 10.5, fontWeight: 700, padding: "1px 4px", borderRadius: 3, background: PARTY[p] || "#9a7b4f", color: "#fff", marginRight: 5 }}>{p === "D" || p === "R" ? p : "I"}</span>;
const raceShort = (t: string) => t.replace(" (special election)", " (special)");

export default async function VoteIndex() {
  const v = await voterState();
  const guess = v?.ballot ?? null;
  const polls = await senatePolls();
  const pollsAt = Object.values(polls)[0]?.fetchedAt ?? null;
  const through = MID.races.flatMap(r => r.candidates.map(c => c.fec?.through)).filter(Boolean).sort().pop() ?? null;

  const rows: RaceRow[] = MID.races.map(r => {
    const s = r.office === "senate" ? polls[r.st] : undefined;
    const share = pollShare(r, s);
    return {
      st: r.st, state: r.state, id: r.id, title: raceShort(raceTitle(r)), office: r.office,
      cands: r.candidates.filter(c => c.main).map(c => ({ name: c.name, p: c.p, raised: c.fec?.raised ?? null, poll: share.get(c.name) ?? null })),
      lead: pollLead(r, s), polls: s?.used.length ?? 0, pollTo: s?.to ?? null,
    };
  });
  const states = STATES.map(s => ({ st: s.st, name: s.name, races: s.races.map(r => raceShort(raceTitle(r))).join(" · ") }));

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: SANS }}>
      <NewsChrome active="vote" />
      <main style={{ maxWidth: 1240, margin: "0 auto", padding: "22px 20px 70px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: C.accent }}>Election day · Tuesday, Nov 3</div>
        <h1 style={{ ...H, fontSize: "clamp(30px,4.4vw,46px)", lineHeight: 1.08, margin: "6px 0 0" }}>Compare the candidates on your ballot</h1>

        <div className="vi-top" style={{ display: "grid", gridTemplateColumns: "minmax(0,340px) minmax(0,1fr)", gap: 28, marginTop: 22, alignItems: "start" }}>
          <aside style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {guess ? (
              <div style={{ border: `1px solid ${C.rule}`, borderRadius: 14, padding: "16px 18px", background: "#fff" }}>
                
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap", margin: "2px 0 8px" }}>
                  <div style={{ ...H, fontSize: 22 }}>{guess.name}</div>
                  <ChangeState states={states} current={guess.st} label={v?.how === "chosen" ? "Your state" : "Not here?"} />
                </div>
                {guess.races.map(r => (
                  <div key={r.id} style={{ borderTop: `1px solid ${C.rule}`, padding: "8px 0", fontSize: 13.5 }}>
                    <div style={{ fontWeight: 700, marginBottom: 3 }}>{raceShort(raceTitle(r))}</div>
                    {r.candidates.filter(c => c.main).map(c => <div key={c.name} style={{ marginTop: 2 }}>{tag(c.p)}{c.name}{c.incumbent ? <span style={{ color: C.mute, fontSize: 12 }}> · incumbent</span> : null}</div>)}
                  </div>
                ))}
                <Link href={`/vote/${guess.st.toLowerCase()}`} style={{ display: "block", textAlign: "center", marginTop: 8, padding: "11px 14px", borderRadius: 6, background: C.ink, color: "#fff", textDecoration: "none", fontWeight: 600, fontSize: 14.5 }}>See your ballot →</Link>
              </div>
            ) : (
              <div style={{ border: `1px solid ${C.rule}`, borderRadius: 14, padding: "14px 16px", background: "#fff" }}>
                <div style={{ fontSize: 13.5, marginBottom: 8 }}>{v?.name ? `${v.name} has no Senate or governor race this year.` : "Pick your state to see your ballot."}</div>
                <ChangeState states={states} current={undefined} label="Your state" />
              </div>
            )}
            <div>
                            <StatePicker states={states} />
            </div>
            <a href="https://vote.gov" style={{ fontSize: 13, color: C.sub }}>Find your polling place ↗</a>
          </aside>
          <RacesTable rows={rows} />
        </div>

        <div style={{ marginTop: 28 }}><Metrics through={through} pollsAt={pollsAt} /></div>
        <h2 style={{ ...H, fontSize: 20, margin: "30px 0 10px" }}>All states</h2>
        <div style={{ columns: "4 220px", columnGap: 24, fontSize: 14 }}>
          {states.map(s => (
            <Link key={s.st} href={`/vote/${s.st.toLowerCase()}`} style={{ display: "block", breakInside: "avoid", padding: "6px 0", borderTop: `1px solid ${C.rule}`, textDecoration: "none", color: C.ink }}>
              <b style={{ fontWeight: 700 }}>{s.name}</b> <span style={{ fontSize: 12, color: C.sub }}>{s.races}</span>
            </Link>
          ))}
        </div>
      </main>
      <style>{`@media(max-width:900px){.vi-top{grid-template-columns:minmax(0,1fr)!important}}`}</style>
    </div>
  );
}
