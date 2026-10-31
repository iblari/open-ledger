import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { MID, STATES, stateByCode, raceTitle } from "@/lib/midterms";
import { senatePolls, pollShare, pollLead } from "@/lib/polls";
import { C, SANS } from "@/lib/design-tokens";
import { NewsChrome } from "@/components/news/NewsChrome";
import RacesTable, { type RaceRow } from "./RacesTable";
import StatePicker from "./StatePicker";
import Metrics from "./Metrics";

export const revalidate = 600;
export const metadata: Metadata = {
  title: "Compare the candidates on your 2026 ballot · Vote Unbiased",
  description: "Senate and governor candidates side by side: nonpartisan polls, money, voting record and positions in their own words. Facts only, every number sourced.",
  alternates: { canonical: "https://voteunbiased.org/vote" },
  openGraph: { title: "Compare the candidates on your 2026 ballot", description: "Polls, money, voting record and positions in their own words, side by side. Facts only.", url: "https://voteunbiased.org/vote", siteName: "Vote Unbiased", type: "website" },
};

const H: React.CSSProperties = { fontFamily: SANS, fontWeight: 700, letterSpacing: "-0.01em", margin: 0 };
const PARTY: Record<string, string> = { D: "#2C4A86", R: "#7B2D26" };
const tag = (p: string) => <span style={{ display: "inline-block", minWidth: 16, textAlign: "center", fontSize: 10.5, fontWeight: 700, padding: "1px 4px", borderRadius: 3, background: PARTY[p] || "#6b655c", color: "#fff", marginRight: 5 }}>{p === "D" || p === "R" ? p : "I"}</span>;
const raceShort = (t: string) => t.replace(" (special election)", " (special)");

export default async function VoteIndex() {
  const h = await headers();
  const guess = stateByCode(h.get("x-vercel-ip-country-region") || "");
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
    <div style={{ minHeight: "100vh", background: "#fff", color: C.ink, fontFamily: SANS }}>
      <NewsChrome active="vote" />
      <main style={{ maxWidth: 1240, margin: "0 auto", padding: "22px 20px 70px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: C.accent }}>Election day · Tuesday, Nov 3</div>
        <h1 style={{ ...H, fontSize: "clamp(28px,4vw,40px)", lineHeight: 1.08, margin: "6px 0 8px" }}>Compare the candidates on your ballot</h1>
        <p style={{ fontSize: 16, color: C.sub, lineHeight: 1.55, maxWidth: 720, margin: 0 }}>
          Every Senate and governor race, side by side: nonpartisan polls, where the money comes from, how they've voted, and what they say they'll do in their own words. We don't endorse anyone, and every number links to its source.
        </p>

        <div className="vi-top" style={{ display: "grid", gridTemplateColumns: "minmax(0,340px) minmax(0,1fr)", gap: 28, marginTop: 22, alignItems: "start" }}>
          <aside style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {guess ? (
              <div style={{ border: `1px solid ${C.rule}`, borderTop: `3px solid ${C.ink}`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 12, color: C.sub }}>Your state</div>
                <div style={{ ...H, fontSize: 22, margin: "2px 0 8px" }}>{guess.name}</div>
                {guess.races.map(r => (
                  <div key={r.id} style={{ borderTop: `1px solid ${C.rule}`, padding: "8px 0", fontSize: 13.5 }}>
                    <div style={{ fontWeight: 700, marginBottom: 3 }}>{raceShort(raceTitle(r))}</div>
                    {r.candidates.filter(c => c.main).map(c => <div key={c.name} style={{ marginTop: 2 }}>{tag(c.p)}{c.name}{c.incumbent ? <span style={{ color: C.mute, fontSize: 12 }}> · incumbent</span> : null}</div>)}
                  </div>
                ))}
                <Link href={`/vote/${guess.st.toLowerCase()}`} style={{ display: "block", textAlign: "center", marginTop: 8, padding: "11px 14px", borderRadius: 8, background: C.ink, color: "#fff", textDecoration: "none", fontWeight: 700, fontSize: 14.5 }}>See your ballot side by side →</Link>
              </div>
            ) : null}
            <div>
              <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>{guess ? "Another state" : "Find your state"}</div>
              <StatePicker states={states} />
            </div>
            <a href="https://vote.gov" style={{ fontSize: 13, color: C.sub }}>Check your registration and polling place at vote.gov ↗</a>
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
        <p style={{ fontSize: 12.5, color: C.mute, marginTop: 20, lineHeight: 1.6 }}>States not listed have no Senate or governor race this year.</p>
      </main>
      <style>{`@media(max-width:900px){.vi-top{grid-template-columns:minmax(0,1fr)!important}}`}</style>
    </div>
  );
}
