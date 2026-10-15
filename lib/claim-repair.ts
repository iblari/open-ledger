import { getFullBroadcast, getRecentBroadcasts, setRecentBroadcasts, saveFullBroadcasts, recordInLedger, kvGet, kvSetMany, type LiveClaim } from "./live-kv";
import { verifyClaimOnWeb } from "./web-verify";
import { contextBefore } from "./live-verify";
import { normQuote, claimHash } from "./claim-link";
import { CHART_KEY } from "./claim-chart";

/**
 * Re-check specific archived claims with the current pipeline and write the
 * new verdict everywhere it lives (permanent record, 72-hour store, ledger),
 * then drop the claim's cached chart. Each target runs once (KV guard).
 *
 * First use: claims the old geographic-scope gate sent to the wrong country
 * (a country named AFTER the claim was taken as its subject).
 */
export interface RepairTarget { videoId: string; startsWith: string }

const DONE = (tag: string, v: string, q: string) => `repair:${tag}:${claimHash(v, q)}`;

export async function recheckClaims(tag: string, targets: RepairTarget[], max = 4): Promise<{ fixed: string[]; failed: string[] }> {
  const fixed: string[] = [], failed: string[] = [];
  const done = await kvGet(targets.map(t => DONE(tag, t.videoId, t.startsWith)));
  const todo = targets.filter((_, i) => !done[i]).slice(0, max);
  if (!todo.length) return { fixed, failed };

  const recent = await getRecentBroadcasts(true).catch(() => []);
  const byVideo = new Map<string, RepairTarget[]>();
  for (const t of todo) byVideo.set(t.videoId, [...(byVideo.get(t.videoId) || []), t]);

  for (const [videoId, ts] of byVideo) {
    const full = await getFullBroadcast(videoId).catch(() => null);
    if (!full) { failed.push(...ts.map(t => t.startsWith)); continue; }
    const transcript = full.transcript || "";
    const results = await Promise.all(ts.map(async t => {
      const c = full.claims.find(x => normQuote(x.quote).startsWith(normQuote(t.startsWith)));
      if (!c) return { t, c: null, v: null };
      // Fresh check: no prior verdict or note, only what led up to the claim.
      const v = await verifyClaimOnWeb({ quote: c.quote }, { context: contextBefore(c.quote, transcript), timeoutMs: 45_000, maxSearches: 3 }).catch(() => null);
      return { t, c, v };
    }));
    let changed = false;
    for (const { t, c, v } of results) {
      if (!c || !v) { failed.push(t.startsWith); continue; }
      const patch: Partial<LiveClaim> = {
        rating: v.rating, confidence: v.confidence, actual: v.actual, explanation: v.explanation,
        sources: v.sources, webVerified: true, metricKey: null, verifiedFromSource: false, groundTruth: undefined,
      };
      Object.assign(c, patch);
      const r = recent.find(b => b.videoId === videoId)?.claims.find(x => normQuote(x.quote) === normQuote(c.quote));
      if (r) Object.assign(r, patch);
      changed = true;
      fixed.push(`${t.startsWith} → ${v.rating}`);
      await kvSetMany([
        [DONE(tag, videoId, t.startsWith), new Date().toISOString(), 0],
        [CHART_KEY(claimHash(videoId, c.quote)), "", 1],
      ]).catch(() => {});
    }
    if (changed) {
      await saveFullBroadcasts([full]);
      if (recent.some(b => b.videoId === videoId)) await setRecentBroadcasts(recent);
      await recordInLedger(full);
    }
  }
  if (fixed.length) await kvSetMany([["trending-claims:v1", "", 1]]).catch(() => {});
  return { fixed, failed };
}

/** Oct 15: claims checked against the wrong country (see claimIsForeign). */
export const FOREIGN_SCOPE_FIX: RepairTarget[] = [
  { videoId: "117BmljC8qk", startsWith: "we inherited a terrible inflation" },
  { videoId: "117BmljC8qk", startsWith: "for the last three months, 1.7" },
  { videoId: "HEWlaWY9Qcs", startsWith: "we set another record today" },
  { videoId: "kuYkk0TxYuM", startsWith: "Gas prices have declined" },
  { videoId: "64w2lEYtw8E", startsWith: "we have it down now to very good number" },
  { videoId: "64w2lEYtw8E", startsWith: "The Democrats caused the highest prices" },
  { videoId: "64w2lEYtw8E", startsWith: "our gasoline prices are lower than Biden" },
];
