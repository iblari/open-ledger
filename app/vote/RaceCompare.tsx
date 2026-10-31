import { MID, TOPICS, raceTitle, rollUrl, money, type Race, type Candidate } from "@/lib/midterms";
import { C, SERIF, SANS } from "@/lib/design-tokens";
import { POLL_SOURCE, pollShare, type PollSummary } from "@/lib/polls";

type FC = Record<string, { claims: number; true: number; misleading: number; false: number; broadcasts: number }>;

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const role = (c: Candidate) => c.record?.chamber === "Senate" ? "U.S. senator" : c.record?.chamber === "House" ? "U.S. representative" : null;
const partyName = (c: Candidate) => c.party.replace(" Party", "");
const PARTY: Record<string, string> = { D: "#2C4A86", R: "#7B2D26" };
const pcol = (c: Candidate) => PARTY[c.p] || "#6b655c";
const ptag = (c: Candidate) => <span style={{ display: "inline-block", minWidth: 18, textAlign: "center", fontSize: 11, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: pcol(c), color: "#fff", marginRight: 7, verticalAlign: 2 }}>{c.p === "D" || c.p === "R" ? c.p : "I"}</span>;
const fmtDay = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function Row({ label, sub, children }: { label: string; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <div className="vc-l"><div style={{ fontWeight: 600, color: C.ink, fontSize: 13.5 }}>{label}</div>{sub && <div style={{ fontSize: 11.5, color: C.mute, marginTop: 2, lineHeight: 1.4 }}>{sub}</div>}</div>
      {children}
    </>
  );
}
function Note({ children }: { children: React.ReactNode }) {
  return <div className="vc-note">{children}</div>;
}
function Section({ title }: { title: string }) {
  return <div className="vc-sec">{title}</div>;
}

export default function RaceCompare({ race, fc, polls }: { race: Race; fc: FC; polls?: PollSummary | null }) {
  const mains = race.candidates.filter(c => c.main);
  const others = race.candidates.filter(c => !c.main);
  const n = mains.length;
  const maxRaised = Math.max(1, ...mains.map(c => c.fec?.raised ?? 0));
  const anyRecord = mains.some(c => c.record);
  const anyFc = mains.some(c => fc[c.name]);
  const through = mains.map(c => c.fec?.through).filter(Boolean).sort().pop();
  const cell = (key: string, content: React.ReactNode) => <div key={key} className="vc-c">{content}</div>;
  const dash = <span style={{ color: C.mute }}>—</span>;
  const share = pollShare(race, polls);
  const hasPolls = race.office === "senate" && share.size >= 2 && polls;
  const lead = hasPolls ? [...share.values()].sort((a, b) => b - a) : [];
  const margin = lead.length >= 2 ? Math.round((lead[0] - lead[1]) * 10) / 10 : null;
  // Topics no main candidate addresses (and every site was readable): one line, not empty rows.
  const allRead = mains.every(c => c.siteStatus === "ok");
  const silent = TOPICS.filter(t => allRead && mains.every(c => !c.positions[t]));
  const shown = TOPICS.filter(t => !silent.includes(t));

  return (
    <section id={race.id} style={{ scrollMarginTop: 60, marginTop: 30 }}>
      <h2 style={{ fontFamily: SANS, fontWeight: 700, fontSize: 26, letterSpacing: "-0.01em", margin: "0 0 2px" }}>{raceTitle(race)}</h2>
      <div style={{ fontSize: 13, color: C.sub, marginBottom: 12 }}>
        {race.state}{race.incumbent ? ` · current officeholder: ${race.incumbent}` : ""} · {race.candidates.length} candidate{race.candidates.length === 1 ? "" : "s"} on the ballot
      </div>
      <div className={`vc-wrap${n > 2 ? " vc-many" : ""}`} style={{ ["--n" as string]: n } as React.CSSProperties}>
        <div className="vc-grid">
          <div className="vc-l vc-head" />
          {mains.map(c => (
            <div key={c.name} className="vc-c vc-head" style={{ borderTop: `3px solid ${pcol(c)}` }}>
              <div style={{ fontFamily: SANS, fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>{ptag(c)}{c.name}</div>
              <div style={{ fontSize: 12.5, color: C.sub, marginTop: 3 }}>
                {partyName(c)}{c.incumbent ? " · incumbent" : role(c) ? ` · ${role(c)}` : ""}
              </div>
            </div>
          ))}

          {race.office === "senate" && (
            <>
              <Section title="Polls" />
              {hasPolls ? (
                <>
                  <Row label="Poll average" sub={<>{polls!.used.length} nonpartisan poll{polls!.used.length === 1 ? "" : "s"}, {fmtDay(polls!.from)}–{fmtDay(polls!.to)} · <a href={POLL_SOURCE.url} style={{ color: C.mute }}>{POLL_SOURCE.name}</a></>}>
                    {mains.map(c => { const v = share.get(c.name); return cell(c.name, v != null ? (
                      <><b style={{ fontSize: 19, fontFamily: SANS }}>{v.toFixed(1)}%</b>
                        <div style={{ height: 8, borderRadius: 4, background: C.paper, marginTop: 5 }}><div style={{ height: 8, borderRadius: 4, width: `${Math.min(100, v)}%`, background: pcol(c) }} /></div></>
                    ) : <span style={{ color: C.mute, fontSize: 13 }}>Not in these polls</span>); })}
                  </Row>
                  <Note>
                    {margin != null && margin < 5.4
                      ? <>The gap is {margin.toFixed(1)} points, which is within the typical error of Senate polls: in the final three weeks they have missed the result by 5.4 points on average (<a href="https://fivethirtyeight.com/features/2022-election-polling-accuracy/" style={{ color: C.sub }}>FiveThirtyEight</a>). </>
                      : margin != null ? <>The gap is {margin.toFixed(1)} points. Senate polls in the final three weeks have missed the result by 5.4 points on average (<a href="https://fivethirtyeight.com/features/2022-election-polling-accuracy/" style={{ color: C.sub }}>FiveThirtyEight</a>). </> : null}
                    Polls are a snapshot, not a forecast.
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 600, color: C.ink }}>Every poll ({polls!.polls.length})</summary>
                      <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: `minmax(0,1.4fr) 80px repeat(${mains.length}, minmax(48px, 70px))`, fontSize: 12.5, rowGap: 4, columnGap: 10, maxWidth: 560 }}>
                        <span style={{ color: C.mute }}>Pollster</span><span style={{ color: C.mute }}>Midpoint</span>
                        {mains.map(c => <span key={c.name} style={{ color: C.mute }}>{c.name.split(" ").slice(-1)[0]}</span>)}
                        {polls!.polls.map((p, i) => {
                          const sh = pollShare(race, polls, p); const inAvg = polls!.used.includes(p);
                          return [
                            <span key={`a${i}`} style={{ fontWeight: inAvg ? 600 : 400 }}>{p.pollster}{inAvg ? " •" : ""}</span>,
                            <span key={`b${i}`}>{fmtDay(p.mid)}</span>,
                            ...mains.map(c => <span key={`c${i}${c.name}`} style={{ fontVariantNumeric: "tabular-nums" }}>{sh.get(c.name) ?? "—"}</span>),
                          ];
                        })}
                      </div>
                      <div style={{ fontSize: 11.5, color: C.mute, marginTop: 6 }}>• = in the average (each pollster's latest poll from the 30 days before the newest).</div>
                    </details>
                  </Note>
                </>
              ) : <Note>No nonpartisan poll of this race in the {POLL_SOURCE.name} file{polls?.polls.length ? " in the last month" : ""}.</Note>}
            </>
          )}
          {race.office === "senate" ? (
            <>
              <Section title="Money" />
              <Row label="Raised" sub={<>2025–26 cycle · <a href="https://www.fec.gov/data/candidates/senate/" style={{ color: C.mute }}>FEC</a>{through ? `, filings through ${through}` : ""}</>}>
                {mains.map(c => cell(c.name, c.fec ? (
                  <a href={`https://www.fec.gov/data/candidate/${c.fec.id}/?cycle=2026`} style={{ color: C.ink, textDecoration: "none" }}>
                    <b style={{ fontSize: 17 }}>{money(c.fec.raised)}</b>
                    <div style={{ height: 6, borderRadius: 3, background: C.paper, marginTop: 5 }}><div style={{ height: 6, borderRadius: 3, width: `${Math.max(2, (c.fec.raised / maxRaised) * 100)}%`, background: pcol(c) }} /></div>
                  </a>
                ) : <span style={{ color: C.mute, fontSize: 13 }}>No FEC filing found</span>))}
              </Row>
              <Row label="Cash on hand">{mains.map(c => cell(c.name, c.fec ? money(c.fec.cash) : dash))}</Row>
              <Row label="From small donors" sub="Share of individual donations under $200">
                {mains.map(c => cell(c.name, c.fec && c.fec.indiv > 0 ? `${Math.round((c.fec.small / c.fec.indiv) * 100)}%` : dash))}
              </Row>
              <Row label="Own money" sub="Candidate's contributions and loans">
                {mains.map(c => cell(c.name, c.fec ? (c.fec.self > 0 ? money(c.fec.self) : "None") : dash))}
              </Row>
            </>
          ) : (
            <>
              <Section title="Money" />
              <Note>Governor campaigns report their money to the state, not to the FEC, so we don't compare it here.</Note>
            </>
          )}

          <Section title="Record in Congress" />
          {anyRecord ? (
            <>
              <Row label="Votes with own party" sub={<>On votes where most Democrats and most Republicans disagreed · <a href="https://voteview.com" style={{ color: C.mute }}>Voteview</a>, 2025–26</>}>
                {mains.map(c => cell(c.name, c.record?.unity != null ? (
                  <><b style={{ fontSize: 17 }}>{c.record.unity.toFixed(0)}%</b><div style={{ fontSize: 11.5, color: C.mute }}>of {c.record.unityVotes} {c.record.chamber} votes</div></>
                ) : <span style={{ color: C.mute, fontSize: 13 }}>Not in the current Congress</span>))}
              </Row>
              <Row label="Missed votes">{mains.map(c => cell(c.name, c.record?.missedPct != null ? `${c.record.missedPct.toFixed(1)}%` : dash))}</Row>
              {MID.keyVotes.map(k => (
                <Row key={k.bill} label={k.title} sub={k.desc}>
                  {mains.map(c => {
                    const v = c.record?.key?.[k.bill];
                    const url = c.record ? rollUrl(c.record.chamber, k.rolls[c.record.chamber]) : null;
                    if (!c.record) return cell(c.name, dash);
                    const col = v === "Yes" || v === "No" ? C.ink : C.mute;
                    return cell(c.name, url ? <a href={url} style={{ color: col, fontWeight: 700, textDecoration: "none" }}>{v ?? "Not in office"}</a> : <span style={{ color: col }}>{v ?? "Not in office"}</span>);
                  })}
                </Row>
              ))}
            </>
          ) : <Note>No candidate in this race currently serves in Congress, so there's no congressional voting record to compare.</Note>}

          <Section title="Our live fact-checks" />
          {anyFc ? (
            <Row label="Claims checked">
              {mains.map(c => { const f = fc[c.name]; return cell(c.name, f ? `${f.claims} claims · ${f.true} true · ${f.misleading} misleading · ${f.false} false` : <span style={{ color: C.mute, fontSize: 13 }}>Not checked yet</span>); })}
            </Row>
          ) : <Note>We haven't fact-checked any of these candidates live yet. When we do, the results appear here.</Note>}

          <Section title="In their own words" />
          {shown.map(t => (
            <Row key={t} label={MID.topics[t]}>
              {mains.map(c => {
                const p = c.positions[t];
                if (p) return cell(c.name, <><div className="vc-q" style={{ fontFamily: SERIF, lineHeight: 1.45 }}>“{p.quote}”</div><a href={p.url} style={{ fontSize: 11.5, color: C.mute }}>{host(p.url)}{p.src === "official" ? " · official congressional site" : ""} ↗</a></>);
                const why = c.siteStatus === "ok" ? "Not addressed on their campaign site" : c.siteStatus === "unreadable" ? "We couldn't read their campaign site" : "No campaign site found";
                return cell(c.name, <span style={{ color: C.mute, fontSize: 13 }}>{why}{c.site && c.siteStatus !== "ok" ? <> · <a href={c.site} style={{ color: C.mute }}>visit ↗</a></> : null}</span>);
              })}
            </Row>
          ))}
          {silent.length > 0 && <Note>Not on any of these campaign sites: <b style={{ color: C.ink }}>{silent.map(t => MID.topics[t]).join(" · ")}</b></Note>}
        </div>
      </div>
      {others.length > 0 && (
        <details style={{ marginTop: 10, fontSize: 13.5, color: C.sub }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Also on the ballot: {others.length} more candidate{others.length === 1 ? "" : "s"}</summary>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
            {others.map(c => <li key={c.name}>{c.name} ({partyName(c)}){c.fec && c.fec.raised > 0 ? ` · raised ${money(c.fec.raised)}` : ""}{c.site ? <> · <a href={c.site} style={{ color: C.sub }}>campaign site</a></> : null}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}
