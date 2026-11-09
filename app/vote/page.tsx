import type { Metadata } from "next";
import Link from "next/link";
import { MID, STATES, type Topic } from "@/lib/midterms";
import { C, SANS, SERIF } from "@/lib/design-tokens";
import FeedbackBanner from "@/app/dashboard/FeedbackBanner";
import { NewsChrome } from "@/components/news/NewsChrome";
import { getResults } from "@/lib/results";
import { voterState } from "@/lib/vote-geo";
import ChangeState from "./ChangeState";
import { outcomeOf, ResultCard, ResultRow, Tag, partyColor, shortTitle, type Outcome } from "@/components/vote/FinalResults";

export const revalidate = 120;
export const metadata: Metadata = {
  title: "2026 Election Results: Senate & Governor Races by State · Vote Unbiased",
  description: "2026 election results for every Senate and governor race: vote counts from state election offices, AP race calls with links, races still undecided, and what each winner said they'd do.",
  alternates: { canonical: "https://voteunbiased.org/vote" },
  openGraph: { title: "2026 election results, race by race", description: "Vote counts, AP calls with sources, races still undecided, and what the winners promised.", url: "https://voteunbiased.org/vote", siteName: "Vote Unbiased", type: "website",
    videos: [{ url: "https://voteunbiased.org/og/v/vote.mp4?v=1", secureUrl: "https://voteunbiased.org/og/v/vote.mp4?v=1", type: "video/mp4", width: 1200, height: 628 }] },
  twitter: { card: "summary_large_image", title: "2026 election results, race by race", description: "Vote counts, AP calls with sources, and what the winners promised." },
};

const H: React.CSSProperties = { fontFamily: SERIF, fontWeight: 500, letterSpacing: "-0.015em", margin: 0 };
const K: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: C.mute };
const card: React.CSSProperties = { background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 14, padding: "14px 16px" };

/** Why a race has no call yet (from the post-election research, Nov 8). */
const PENDING: Record<string, string> = {
  "ms-senate": "Within 0.3 points with 99% counted; affidavit ballots still being counted.",
  "ks-governor": "Within 0.5 points; an audit has been ordered.",
  "ak-senate": "No one passed 50%. Ranked-choice count on Nov 18.",
  "ak-governor": "No one passed 50%. Ranked-choice count on Nov 18.",
  "al-senate": "All counties in; the AP has not called it yet.",
};

function Tally({ label, list }: { label: string; list: Outcome[] }) {
  const n = (p: string) => list.filter(o => o.winner && (p === "O" ? !["D", "R"].includes(o.winner.p) : o.winner.p === p)).length;
  const d = n("D"), r = n("R"), o = n("O"), open = list.filter(x => !x.winner).length;
  return (
    <div style={card}>
      <div style={K}>{label} · {list.length} races</div>
      <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", gap: 2, margin: "10px 0 6px" }}>
        {d > 0 && <span style={{ flex: d, background: partyColor("D") }} />}
        {o > 0 && <span style={{ flex: o, background: "#8a8378" }} />}
        {open > 0 && <span style={{ flex: open, background: "#D9D5CE" }} />}
        {r > 0 && <span style={{ flex: r, background: partyColor("R") }} />}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, gap: 8 }}>
        <span style={{ color: partyColor("D"), fontWeight: 700 }}>Democrats won {d}</span>
        <span style={{ color: C.mute }}>{open} not called{o ? ` · ${o} other` : ""}</span>
        <span style={{ color: partyColor("R"), fontWeight: 700 }}>Republicans won {r}</span>
      </div>
      <div style={{ fontSize: 11.5, color: C.mute, marginTop: 6 }}>Races on the ballot this year only{label === "Senate" ? ", not the whole Senate (65 seats weren't up)" : ""}.</div>
    </div>
  );
}

export default async function VoteIndex() {
  const v = await voterState();
  const guess = v?.ballot ?? null;
  const res = await getResults(MID.races.map(r => r.id)).catch(() => ({} as Awaited<ReturnType<typeof getResults>>));
  const all = MID.races.map(r => outcomeOf(r, res[r.id] ?? null));
  const senate = all.filter(o => o.race.office === "senate");
  const gov = all.filter(o => o.race.office === "governor");
  const pending = all.filter(o => !o.winner);
  const closest = all.filter(o => o.winner && o.margin != null).sort((a, b) => a.margin! - b.margin!).slice(0, 6);
  const updated = Object.values(res).map(x => x?.updatedAt).filter(Boolean).sort().pop();
  const mine = guess ? all.filter(o => o.race.st === guess.st) : [];
  const states = STATES.map(s => ({ st: s.st, name: s.name }));
  const winners = all.filter(o => o.winner).map(o => {
    const c = o.race.candidates.find(k => k.name === o.winner!.name);
    const pos = (c?.positions || {}) as Partial<Record<Topic, { quote: string; url: string }>>;
    return { o, pos: (Object.keys(MID.topics) as Topic[]).filter(t => pos[t]?.quote).map(t => ({ t, ...pos[t]! })) };
  }).filter(w => w.pos.length);
  const sortByState = (a: Outcome, b: Outcome) => a.race.state.localeCompare(b.race.state) || (a.race.special ? 1 : 0) - (b.race.special ? 1 : 0);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: SANS }}>
      <NewsChrome active="vote" />
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "22px 20px 70px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: C.accent }}>General election · Nov 3, 2026{updated ? ` · updated ${new Date(updated).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}` : ""}</div>
        <h1 style={{ ...H, fontSize: "clamp(30px,4.4vw,46px)", lineHeight: 1.08, margin: "6px 0 6px" }}>2026 election results</h1>
        <p style={{ fontSize: 15, color: C.sub, margin: "0 0 18px", maxWidth: 720, lineHeight: 1.55 }}>Every Senate and governor race on the ballot. Vote counts come from state election offices where they&apos;re posted; a winner is shown only where the AP has called the race, with a link to the call. All counts are unofficial until states certify.</p>

        <div className="vp-2" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14 }}>
          <Tally label="Senate" list={senate} />
          <Tally label="Governors" list={gov} />
        </div>

        <section style={{ marginTop: 26 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <h2 style={{ ...H, fontSize: 22 }}>{guess ? `Your state: ${guess.name}` : "Your state"}</h2>
            <ChangeState states={states} current={guess?.st} label={guess ? (v?.how === "chosen" ? "Your state" : "Not here?") : "Pick your state"} />
          </div>
          {guess ? (
            <div className="vp-2" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14 }}>
              {mine.map(o => <ResultCard key={o.race.id} o={o} />)}
            </div>
          ) : <p style={{ fontSize: 14, color: C.sub, margin: 0 }}>{v?.name ? `${v.name} had no Senate or governor race this year.` : "Pick your state to see its results first."}</p>}
          {guess && <Link href={`/vote/${guess.st.toLowerCase()}`} style={{ display: "inline-block", marginTop: 10, fontSize: 14, fontWeight: 700, color: C.ink }}>{guess.name} results and the candidates&apos; records →</Link>}
        </section>

        <div className="vp-2" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14, marginTop: 26 }}>
          <section style={card}>
            <h2 style={{ ...H, fontSize: 19 }}>Still undecided</h2>
            {pending.length ? pending.map(o => (
              <Link key={o.race.id} href={`/vote/${o.race.st.toLowerCase()}`} style={{ display: "block", padding: "10px 0", borderTop: `1px solid ${C.rule}`, textDecoration: "none", color: C.ink }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14 }}>
                  <b>{o.race.state} · {shortTitle(o.race)}</b>
                  {o.margin != null && o.rows[0] && <span style={{ color: C.sub, fontSize: 13 }}>{o.rows[0].name.split(" ").slice(-1)[0]}<Tag p={o.rows[0].p} /> +{o.margin.toFixed(1)}</span>}
                </div>
                <div style={{ fontSize: 12.5, color: C.sub, marginTop: 3 }}>{PENDING[o.race.id] || "No AP call yet."}</div>
              </Link>
            )) : <p style={{ fontSize: 13.5, color: C.sub }}>Every race has been called.</p>}
          </section>
          <section style={card}>
            <h2 style={{ ...H, fontSize: 19 }}>Closest called races</h2>
            {closest.map(o => (
              <Link key={o.race.id} href={`/vote/${o.race.st.toLowerCase()}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "10px 0", borderTop: `1px solid ${C.rule}`, textDecoration: "none", color: C.ink, fontSize: 14 }}>
                <b>{o.race.state} · {shortTitle(o.race)}</b>
                <span>{o.winner!.name}<Tag p={o.winner!.p} /> <span style={{ color: C.sub }}>+{o.margin!.toFixed(1)} pts</span></span>
              </Link>
            ))}
          </section>
        </div>

        <section style={{ marginTop: 30 }}>
          <h2 style={{ ...H, fontSize: 24, marginBottom: 4 }}>All results</h2>
          <p style={{ fontSize: 13, color: C.sub, margin: "0 0 10px" }}>Tap a state for its full results and sources.</p>
          <div className="vp-2" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 28 }}>
            <div><div style={{ ...K, marginBottom: 4 }}>Senate · {senate.length}</div>{[...senate].sort(sortByState).map(o => <ResultRow key={o.race.id} o={o} />)}</div>
            <div><div style={{ ...K, marginBottom: 4 }}>Governors · {gov.length}</div>{[...gov].sort(sortByState).map(o => <ResultRow key={o.race.id} o={o} />)}</div>
          </div>
        </section>

        {winners.length > 0 && (
          <section style={{ marginTop: 34 }}>
            <h2 style={{ ...H, fontSize: 24 }}>What the winners said they&apos;d do</h2>
            <p style={{ fontSize: 14, color: C.sub, margin: "4px 0 14px", maxWidth: 720, lineHeight: 1.55 }}>In their own words, from their campaign sites. This is the record to check them against over their term.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 }}>
              {winners.map(({ o, pos }) => (
                <div key={o.race.id} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                    <b style={{ fontSize: 15 }}>{o.winner!.name}<Tag p={o.winner!.p} /></b>
                    <span style={{ fontSize: 12, color: C.mute }}>{o.race.st} · {shortTitle(o.race)}</span>
                  </div>
                  {pos.slice(0, 2).map(x => (
                    <div key={x.t} style={{ marginTop: 10 }}>
                      <div style={{ ...K, fontSize: 10.5 }}>{MID.topics[x.t]}</div>
                      <a href={x.url} target="_blank" rel="noopener noreferrer nofollow" style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: 13.5, lineHeight: 1.45, color: C.ink, textDecoration: "none", marginTop: 3 }}>“{x.quote}”</a>
                    </div>
                  ))}
                  {pos.length > 2 && <Link href={`/vote/${o.race.st.toLowerCase()}`} style={{ display: "inline-block", marginTop: 10, fontSize: 12.5, color: C.sub }}>{pos.length - 2} more on {pos.length - 2 === 1 ? "one topic" : "other topics"} →</Link>}
                </div>
              ))}
            </div>
          </section>
        )}

        <p style={{ fontSize: 12, color: C.mute, marginTop: 30, lineHeight: 1.6, maxWidth: 820 }}>
          How this works: counts are the latest we read from each state&apos;s election office; where a state hasn&apos;t posted statewide totals, the source line says which results page we used. We don&apos;t project winners. A race shows a winner only after the AP calls it, and the badge links to the report of the call. States certify results over the coming weeks; numbers here can still change.
        </p>
      </main>
      <style>{`@media(max-width:820px){.vp-2{grid-template-columns:minmax(0,1fr)!important}}`}</style>
      <FeedbackBanner page="vote" />
    </div>
  );
}
