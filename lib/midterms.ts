/**
 * 2026 midterms: side-by-side, facts-only comparison of the candidates on
 * each state's Senate and Governor ballot. No recommendations, no scores.
 *
 * Data (lib/data/midterms-2026.json, built Oct 26, 2026):
 *  - who's on the ballot: state election offices via Wikipedia's race pages,
 *    checked against FEC filings
 *  - money: FEC candidate summary file, 2025–26 cycle (Senate only; governor
 *    races report to the state)
 *  - voting record: Voteview roll calls, 119th Congress (current members)
 *  - positions: quotes copied word for word from each campaign's own site;
 *    a quote is only kept if it appears exactly on the cited page
 *  - our fact-checks: matched live against the ledger by speaker
 */
import raw from "./data/midterms-2026.json";
import { getLedger } from "./live-kv";

export type Topic = "economy" | "healthcare" | "immigration" | "taxes" | "abortion";
export interface Candidate {
  name: string; party: string; p: string; main: boolean; incumbent: boolean;
  fec: { id: string; raised: number; cash: number; indiv: number; small: number; self: number; through: string } | null;
  record: { chamber: "Senate" | "House"; unity: number | null; unityVotes: number; missedPct: number | null; bioguide: string; key: Record<string, string | null> } | null;
  site: string | null; siteStatus: "ok" | "unreadable" | "none";
  positions: Partial<Record<Topic, { quote: string; url: string; src?: "official" }>>;
  /** Wikidata (education, offices) + the opening of the Wikipedia article, verbatim. */
  bg?: { qid: string; match: "id" | "name"; wiki: string | null; summary: string | null; edu: string[]; offices: { t: string; from: string; to: string }[] } | null;
}
export interface Race { id: string; state: string; st: string; office: "senate" | "governor"; special: boolean; incumbent: string | null; candidates: Candidate[] }
export interface KeyVote { bill: string; title: string; desc: string; rolls: Record<string, string | null> }
interface Data { generated: string; election: string; keyVotes: KeyVote[]; sources: Record<string, string>; topics: Record<Topic, string>; races: Race[] }

export const MID = raw as unknown as Data;
export const TOPICS = Object.keys(MID.topics) as Topic[];
export const ELECTION_DAY = MID.election;

export const STATES = [...new Map(MID.races.map(r => [r.st, r.state])).entries()]
  .map(([st, name]) => ({ st, name, races: MID.races.filter(r => r.st === st) }))
  .sort((a, b) => a.name.localeCompare(b.name));

export function stateByCode(code: string) {
  return STATES.find(s => s.st.toLowerCase() === code.toLowerCase()) ?? null;
}

export function raceTitle(r: Race): string {
  return r.office === "senate" ? `U.S. Senate${r.special ? " (special election)" : ""}` : "Governor";
}

/** Voteview page for a roll call: RS119xxxx / RH119xxxx. */
export function rollUrl(chamber: "Senate" | "House", roll: string | null | undefined): string | null {
  if (!roll) return null;
  return `https://voteview.com/rollcall/R${chamber === "Senate" ? "S" : "H"}119${roll.padStart(4, "0")}`;
}

/** Calendar days until election day, counted in Eastern time. */
export function daysToElection(now = new Date()): number {
  const today = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  return Math.max(0, Math.round((Date.parse(ELECTION_DAY) - Date.parse(today)) / 864e5));
}

export const money = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`;

/** Our live fact-checks of a candidate, matched by the ledger's speaker field
 *  (never by a name merely appearing in a title). */
export async function factChecksFor(names: string[]): Promise<Record<string, { claims: number; true: number; misleading: number; false: number; broadcasts: number }>> {
  const out: Record<string, { claims: number; true: number; misleading: number; false: number; broadcasts: number }> = {};
  const ledger = await getLedger().catch(() => []);
  const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").trim();
  for (const n of names) {
    const target = norm(n);
    const mine = ledger.filter(e => e.speaker && norm(e.speaker) === target);
    if (!mine.length) continue;
    out[n] = mine.reduce((a, e) => ({ claims: a.claims + e.counts.total, true: a.true + e.counts.true, misleading: a.misleading + e.counts.misleading, false: a.false + e.counts.false, broadcasts: a.broadcasts + 1 }), { claims: 0, true: 0, misleading: 0, false: 0, broadcasts: 0 });
  }
  return out;
}
