import { unstable_cache } from "next/cache";
import { STATES, type Race } from "./midterms";

/**
 * Senate polls for 2026, from Electoral-vote.com's public poll file
 * (https://electoral-vote.com/evp2026/Info/data.html). That site only uses
 * nonpartisan pollsters (media, universities); polls paid for by campaigns
 * or parties are left out. One row per poll: state, Dem %, GOP %, Ind %,
 * poll midpoint and pollster. Refreshed hourly.
 *
 * Our average (stated on the page): each pollster's most recent poll among
 * polls whose midpoint is within 30 days of the newest poll in that state,
 * averaged with equal weight. No house-effect adjustments, no forecast.
 */
export const POLL_SOURCE = { name: "Electoral-vote.com", url: "https://electoral-vote.com/evp2026/Senate/senate_polls.html", data: "https://electoral-vote.com/evp2026/Senate/senate_polls.csv" };
const WINDOW_DAYS = 30;

export interface Poll { pollster: string; mid: string; days: number; d: number | null; r: number | null; i: number | null }
export interface PollSummary {
  st: string; polls: Poll[]; used: Poll[];
  avg: { d: number | null; r: number | null; i: number | null };
  from: string; to: string; fetchedAt: string;
}

const doyToDate = (doy: number) => new Date(Date.UTC(2026, 0, 1) + (Math.round(doy) - 1) * 864e5).toISOString().slice(0, 10);
const num = (s: string) => { const v = parseFloat(s); return Number.isFinite(v) && s.trim() !== "" ? v : null; };

export function parsePolls(csv: string): Map<string, Poll[]> {
  const byName = new Map(STATES.map(s => [s.name.toLowerCase(), s.st]));
  const out = new Map<string, Poll[]>();
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const f = line.split(",");
    if (f.length < 9) continue;
    const st = byName.get((f[2] || "").trim().toLowerCase());
    const pollsterRaw = (f[f.length - 1] || "").trim();
    // "Election 2020" rows are the last result, used by the source as a starting point; not polls.
    if (!st || !pollsterRaw || /^election\b/i.test(pollsterRaw)) continue;
    const doy = parseFloat(f[0]);
    if (!Number.isFinite(doy)) continue;
    const d = num(f[4]), r = num(f[5]), i = num(f[6]);
    const poll: Poll = { pollster: pollsterRaw.replace(/-\d+$/, ""), mid: doyToDate(doy), days: parseInt(f[1]) || 1, d: d === 0 ? null : d, r: r === 0 ? null : r, i: i === 0 ? null : i };
    out.set(st, [...(out.get(st) || []), poll]);
  }
  for (const [k, v] of out) out.set(k, v.sort((a, b) => b.mid.localeCompare(a.mid)));
  return out;
}

export function summarize(st: string, polls: Poll[], fetchedAt: string): PollSummary | null {
  if (!polls.length) return null;
  const newest = Date.parse(polls[0].mid);
  const seen = new Set<string>(), used: Poll[] = [];
  for (const p of polls) {
    if (newest - Date.parse(p.mid) > WINDOW_DAYS * 864e5) break;
    if (seen.has(p.pollster)) continue;
    seen.add(p.pollster); used.push(p);
  }
  const mean = (k: "d" | "r" | "i") => {
    const v = used.map(p => p[k]).filter((x): x is number => x != null);
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
  };
  return { st, polls, used, avg: { d: mean("d"), r: mean("r"), i: mean("i") }, from: used[used.length - 1].mid, to: used[0].mid, fetchedAt };
}

async function load(): Promise<Record<string, PollSummary>> {
  const r = await fetch(POLL_SOURCE.data, { headers: { "User-Agent": "Mozilla/5.0 (compatible; VoteUnbiasedBot/1.0; +https://voteunbiased.org)" }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!r.ok) throw new Error(`polls ${r.status}`);
  const at = new Date().toISOString();
  const out: Record<string, PollSummary> = {};
  for (const [st, polls] of parsePolls(await r.text())) { const s = summarize(st, polls, at); if (s) out[st] = s; }
  return out;
}

/** All states' Senate poll summaries; cached for an hour, empty on failure. */
export const senatePolls = unstable_cache(async () => { try { return await load(); } catch { return {}; } }, ["senate-polls-v1"], { revalidate: 3600 });

/** Which poll column belongs to which main candidate in a race. */
export function pollShare(race: Race, s: PollSummary | undefined | null, p: { d: number | null; r: number | null; i: number | null } | null = s?.avg ?? null): Map<string, number> {
  const m = new Map<string, number>();
  if (!s || !p || race.office !== "senate") return m;
  const mains = race.candidates.filter(c => c.main);
  const ind = mains.find(c => c.p !== "D" && c.p !== "R");
  for (const c of mains) {
    const v = c.p === "D" ? p.d : c.p === "R" ? p.r : c === ind ? p.i : null;
    if (v != null) m.set(c.name, v);
  }
  return m;
}

/** "Talarico +3.4" style lead, from the average; null if under two candidates have numbers. */
export function pollLead(race: Race, s: PollSummary | undefined | null): { name: string; margin: number } | null {
  const sh = [...pollShare(race, s)].sort((a, b) => b[1] - a[1]);
  if (sh.length < 2) return null;
  return { name: sh[0][0], margin: Math.round((sh[0][1] - sh[1][1]) * 10) / 10 };
}
