import { MID, TOPICS, raceTitle, rollUrl, money, type Race, type Candidate } from "@/lib/midterms";
import { C, SERIF, SANS } from "@/lib/design-tokens";
import { POLL_SOURCE, pollShare, type PollSummary } from "@/lib/polls";
import TrendChart, { type TrendLite } from "./TrendChart";

const TOPIC_TRENDS: Record<string, string[]> = { economy: ["gdp", "jobs", "rent", "homes"], taxes: ["taxes"], immigration: ["migration"] };

type FC = Record<string, { claims: number; true: number; misleading: number; false: number; broadcasts: number }>;

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const role = (c: Candidate) => c.record?.chamber === "Senate" ? "U.S. senator" : c.record?.chamber === "House" ? "U.S. representative" : null;
const partyName = (c: Candidate) => c.party.replace(" Party", "");
const PARTY: Record<string, string> = { D: "#4361a6", R: "#b8372d" };
const pcol = (c: Candidate) => PARTY[c.p] || "#9a7b4f";
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

export default function RaceCompare({ race, fc, polls, trends = [] }: { race: Race; fc: FC; polls?: PollSummary | null; trends?: TrendLite[] }) {
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

  const TopicBlock = ({ t }: { t: keyof typeof MID.topics }) => {
    const ts = (TOPIC_TRENDS[t] || []).map(k => trends.find(x => x.key === k)).filter(Boolean) as TrendLite[];
    const quotes = !silent.includes(t);
    return (
      <>
        {ts.length > 0 && (
          <div className="vc-ctx" style={{ gridColumn: "1 / -1", borderTop: `1px solid ${C.rule}`, padding: "12px 16px", background: "#fdfbf8" }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>{MID.topics[t]} <span style={{ fontWeight: 400, color: C.mute, fontSize: 12 }}>· {race.state}, last 10 years</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 260px))", gap: 22 }}>{ts.map(x => <TrendChart key={x.key} t={x} />)}</div>
          </div>
        )}
        {quotes && (
          <Row label={ts.length ? "What they say" : MID.topics[t]}>
            {mains.map(c => {
              const p = c.positions[t];
              if (p) return cell(c.name, <><div className="vc-q" style={{ fontFamily: SERIF, lineHeight: 1.45 }}>“{p.quote}”</div><a href={p.url} style={{ fontSize: 11.5, color: C.mute }}>{host(p.url)}{p.src === "official" ? " · official congressional site" : ""} ↗</a></>);
              const why = c.siteStatus === "ok" ? "Not on their site" : c.siteStatus === "unreadable" ? "Site unreadable" : "No campaign site";
              return cell(c.name, <span style={{ color: C.mute, fontSize: 13 }}>{why}{c.site && c.siteStatus !== "ok" ? <> · <a href={c.site} style={{ color: C.mute }}>visit ↗</a></> : null}</span>);
            })}
          </Row>
        )}
      </>
    );
  };

  return (
    <section id={race.id} style={{ scrollMarginTop: 60, marginTop: 30 }}>
      <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 30, letterSpacing: "-0.015em", margin: "0 0 2px" }}>{raceTitle(race)}</h2>
      <div style={{ fontSize: 13, color: C.sub, marginBottom: 12 }}>
        {race.incumbent ? `Incumbent: ${race.incumbent}` : "Open seat"}
      </div>
      <div className={`vc-wrap${n > 2 ? " vc-many" : ""}`} style={{ ["--n" as string]: n } as React.CSSProperties}>
        <div className="vc-grid">
          <div className="vc-l vc-head" />
          {mains.map(c => (
            <div key={c.name} className="vc-c vc-head" style={{ borderTop: `3px solid ${pcol(c)}` }}>
              <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 500, lineHeight: 1.2 }}>{ptag(c)}{c.name}</div>
              <div style={{ fontSize: 12.5, color: C.sub, marginTop: 3 }}>
                {partyName(c)}{c.incumbent ? " · incumbent" : role(c) ? ` · ${role(c)}` : ""}
              </div>
            </div>
          ))}

          <Section title="Background" />
          {mains.some(c => c.bg) && (
            <>
              <Row label="Education">
                {mains.map(c => cell(c.name, c.bg?.edu.length ? <div style={{ fontSize: 14, lineHeight: 1.55 }}>{c.bg.edu.map(e => <div key={e}>{e}</div>)}</div> : <span style={{ color: C.mute, fontSize: 13 }}>No college listed</span>))}
              </Row>
              <Row label="Work experience" sub="Campaign sites, official bios, Wikipedia, Ballotpedia">
                {mains.map(c => {
                  const items = [...(c.bg?.offices || []), ...(c.bg?.work || [])]
                    .sort((x, y) => {
                      const k = (o: { from: string; to: string; kind?: string }) => (o.to === "" && o.from !== "" && o.kind !== "research") ? 9999 : +(o.to || o.from || 0);
                      return k(y) - k(x);
                    })
                    .slice(0, 6);
                  return cell(c.name, items.length ? (
                    <div style={{ fontSize: 14, lineHeight: 1.55 }}>{items.map(o => <div key={o.t + o.from}>{o.t[0].toUpperCase() + o.t.slice(1)}{o.from ? <span style={{ color: C.mute }}> · {o.from}{o.to ? (o.to !== o.from ? `–${o.to}` : "") : ("kind" in o && o.kind === "research" ? "" : "–now")}</span> : null}</div>)}
                      <div style={{ fontSize: 11.5, color: C.mute, marginTop: 4 }}>{[...(c.bg?.src || []), ...(c.bg?.wiki ? [c.bg.wiki] : [])].filter((u, i, a) => a.findIndex(v => host(v) === host(u)) === i).slice(0, 3).map((u, i) => <a key={u} href={u} style={{ color: C.mute, marginRight: 8 }}>{host(u)} ↗</a>)}</div></div>
                  ) : <span style={{ color: C.mute, fontSize: 13 }}>Not listed</span>);
                })}
              </Row>
            </>
          )}
          {race.office === "senate" && hasPolls && (
            <>
              <Section title="Polls" />
              {hasPolls ? (
                <>
                  <Row label="Poll average" sub={<>{polls!.used.length} poll{polls!.used.length === 1 ? "" : "s"}, {fmtDay(polls!.from)}–{fmtDay(polls!.to)} · <a href={POLL_SOURCE.url} style={{ color: C.mute }}>{POLL_SOURCE.name}</a></>}>
                    {mains.map(c => { const v = share.get(c.name); return cell(c.name, v != null ? (
                      <><b style={{ fontSize: 19, fontFamily: SANS }}>{v.toFixed(1)}%</b>
                        <div style={{ height: 8, borderRadius: 4, background: C.paper, marginTop: 5 }}><div style={{ height: 8, borderRadius: 4, width: `${Math.min(100, v)}%`, background: pcol(c) }} /></div></>
                    ) : <span style={{ color: C.mute, fontSize: 13 }}>Not in these polls</span>); })}
                  </Row>
                  <Note>
                    {margin != null && margin < 5.4 ? <>Within typical polling error (±5.4 pts, <a href="https://fivethirtyeight.com/features/2022-election-polling-accuracy/" style={{ color: C.sub }}>538</a>). </> : null}
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
                      <div style={{ fontSize: 11.5, color: C.mute, marginTop: 6 }}>• in the average</div>
                    </details>
                  </Note>
                </>
              ) : null}
            </>
          )}
          {race.office === "senate" ? (
            <>
              <Section title="Money" />
              <Row label="Raised" sub={<><a href="https://www.fec.gov/data/candidates/senate/" style={{ color: C.mute }}>FEC</a>{through ? ` · through ${through}` : ""}</>}>
                {mains.map(c => cell(c.name, c.fec ? (
                  <a href={`https://www.fec.gov/data/candidate/${c.fec.id}/?cycle=2026`} style={{ color: C.ink, textDecoration: "none" }}>
                    <b style={{ fontSize: 17 }}>{money(c.fec.raised)}</b>
                    <div style={{ height: 6, borderRadius: 3, background: C.paper, marginTop: 5 }}><div style={{ height: 6, borderRadius: 3, width: `${Math.max(2, (c.fec.raised / maxRaised) * 100)}%`, background: pcol(c) }} /></div>
                  </a>
                ) : <span style={{ color: C.mute, fontSize: 13 }}>No FEC filing found</span>))}
              </Row>
              <Row label="Cash on hand">{mains.map(c => cell(c.name, c.fec ? money(c.fec.cash) : dash))}</Row>
              <Row label="From small donors" sub="Under $200">
                {mains.map(c => cell(c.name, c.fec && c.fec.indiv > 0 ? `${Math.round((c.fec.small / c.fec.indiv) * 100)}%` : dash))}
              </Row>
              <Row label="Own money">
                {mains.map(c => cell(c.name, c.fec ? (c.fec.self > 0 ? money(c.fec.self) : "None") : dash))}
              </Row>
            </>
          ) : (
            null
          )}

          {anyRecord && <Section title="Record in Congress" />}
          {anyRecord ? (
            <>
              <Row label="Votes with own party" sub={<>Party-line votes · <a href="https://voteview.com" style={{ color: C.mute }}>Voteview</a></>}>
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
          ) : null}

          {anyFc && <Section title="Our live fact-checks" />}
          {anyFc ? (
            <Row label="Claims checked">
              {mains.map(c => { const f = fc[c.name]; return cell(c.name, f ? `${f.claims} claims · ${f.true} true · ${f.misleading} misleading · ${f.false} false` : <span style={{ color: C.mute, fontSize: 13 }}>Not checked yet</span>); })}
            </Row>
          ) : null}

          <Section title="Issues" />
          {TOPICS.filter(t => shown.includes(t) || TOPIC_TRENDS[t]).map(t => (
            <TopicBlock key={t} t={t} />
          ))}

        </div>
      </div>
      {others.length > 0 && (
        <details style={{ marginTop: 10, fontSize: 13.5, color: C.sub }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>+{others.length} more on the ballot</summary>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
            {others.map(c => <li key={c.name}>{c.name} ({partyName(c)}){c.fec && c.fec.raised > 0 ? ` · raised ${money(c.fec.raised)}` : ""}{c.site ? <> · <a href={c.site} style={{ color: C.sub }}>campaign site</a></> : null}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}
