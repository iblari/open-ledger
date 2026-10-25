/**
 * Visits, counted by a beacon from real browsers (components/HitBeacon):
 * per page, and per post via utm_content (the share-kit item id). Link
 * preview bots don't run JavaScript, so they aren't counted.
 * Stored as one hash per day (ET), kept 120 days.
 */
import { kvHincrMany, kvHgetall } from "./live-kv";

export const dayET = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const HKEY = (day: string) => `traffic:v1:${day}`;
const clean = (s: string, n = 120) => s.replace(/[^\w\-/:.%]/g, "").slice(0, n);

export async function recordHit(h: { path: string; utmSource?: string | null; utmContent?: string | null; utmCampaign?: string | null }): Promise<void> {
  const path = clean(h.path.split("?")[0] || "/");
  const fields = [`all`, `p:${path}`];
  if (h.utmSource) fields.push(`s:${clean(h.utmSource, 30)}`);
  if (h.utmContent) fields.push(`c:${clean(h.utmContent, 80)}`);
  if (h.utmCampaign) fields.push(`g:${clean(h.utmCampaign, 30)}`);
  await kvHincrMany(HKEY(dayET()), fields, 120 * 86400);
}

export interface TrafficReport {
  since: string; until: string; total: number;
  bySource: Record<string, number>; byCampaign: Record<string, number>;
  byPost: { id: string; visits: number }[];
  byPage: { path: string; visits: number }[];
  byDay: { day: string; visits: number; fromX: number }[];
}

export async function trafficReport(since: string): Promise<TrafficReport> {
  const until = dayET();
  const days: string[] = [];
  const d = new Date(since + "T12:00:00Z");
  while (days.length < 120) { const s = d.toISOString().slice(0, 10); if (s > until) break; days.push(s); d.setUTCDate(d.getUTCDate() + 1); }
  const hashes = await Promise.all(days.map(day => kvHgetall(HKEY(day)).catch(() => ({} as Record<string, number>))));
  const sum: Record<string, number> = {};
  const byDay = days.map((day, i) => { for (const [k, v] of Object.entries(hashes[i])) sum[k] = (sum[k] || 0) + v; return { day, visits: hashes[i].all || 0, fromX: hashes[i]["s:x"] || 0 }; });
  const pick = (pre: string) => Object.entries(sum).filter(([k]) => k.startsWith(pre)).map(([k, v]) => [k.slice(pre.length), v] as [string, number]).sort((a, b) => b[1] - a[1]);
  return {
    since, until, total: sum.all || 0,
    bySource: Object.fromEntries(pick("s:")), byCampaign: Object.fromEntries(pick("g:")),
    byPost: pick("c:").map(([id, visits]) => ({ id, visits })),
    byPage: pick("p:").slice(0, 100).map(([path, visits]) => ({ path, visits })),
    byDay,
  };
}
