import { kvGet, kvSetMany } from "./live-kv";
import { MID, type Race } from "./midterms";

/**
 * Election-night results for the Vote page cards. Official counts only, as
 * reported; no projections. Each race's result lives in KV ("results:v1:<raceId>")
 * and is filled either by a source adapter (county/state results feeds, set up as
 * they publish) or by an admin update. Winner badges only when a call is recorded
 * with who made it (e.g. AP).
 */
export interface CandResult { name: string; p: string; votes: number }
export interface RaceResult {
  raceId: string; updatedAt: string; pctCounted: number | null;
  cands: CandResult[]; called?: { name: string; by: string; at: string } | null;
  source: string; sourceUrl?: string | null;
}

/** When MOST polls close in each state, Nov 3 2026, US Eastern time (EST, UTC−5), 24h. */
const CLOSE_ET: Record<string, number> = {
  AL: 20, AK: 25, AZ: 21, AR: 20.5, CA: 23, CO: 21, CT: 20, DE: 20, DC: 20, FL: 19, GA: 19, HI: 24, ID: 22, IL: 20, IN: 18, IA: 21,
  KS: 21, KY: 18, LA: 21, ME: 20, MD: 20, MA: 20, MI: 20, MN: 21, MS: 20, MO: 20, MT: 22, NE: 21, NV: 22, NH: 20, NJ: 20, NM: 21,
  NY: 21, NC: 19.5, ND: 21, OH: 19.5, OK: 20, OR: 23, PA: 20, RI: 20, SC: 19, SD: 21, TN: 20, TX: 20, UT: 22, VT: 19, VA: 19,
  WA: 23, WV: 19.5, WI: 21, WY: 21,
};
export function pollsCloseAt(st: string): string {
  const h = CLOSE_ET[st] ?? 20;
  const ms = Date.UTC(2026, 10, 3, 5, 0, 0) + h * 3600_000; // midnight EST = 05:00 UTC
  return new Date(ms).toISOString();
}

const KEY = (id: string) => `results:v1:${id}`;
export async function getResults(raceIds: string[]): Promise<Record<string, RaceResult | null>> {
  if (!raceIds.length) return {};
  const raw = await kvGet(raceIds.map(KEY)).catch(() => raceIds.map(() => null));
  return Object.fromEntries(raceIds.map((id, i) => { try { return [id, raw[i] ? JSON.parse(raw[i]!) as RaceResult : null]; } catch { return [id, null]; } }));
}
export async function setResult(r: RaceResult): Promise<void> {
  await kvSetMany([[KEY(r.raceId), JSON.stringify(r), 30 * 86400]]);
}
export const raceById = (id: string): Race | undefined => MID.races.find(r => r.id === id);
