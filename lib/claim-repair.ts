import { getVerdictOverlay, setVerdictOverlay, getFullBroadcast, getRecentBroadcasts, setRecentBroadcasts, saveFullBroadcasts, recordInLedger, getReplayableOne, patchLedgerClaims, kvGet, kvSetMany, type LiveClaim } from "./live-kv";
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
export interface RepairTarget {
  videoId: string;
  startsWith: string;
  /** Written correction applied as-is instead of a fresh web check (rating is kept unless given). */
  patch?: Pick<Partial<LiveClaim>, "rating" | "actual" | "explanation" | "sources">;
}

const DONE = (tag: string, v: string, q: string) => `repair:${tag}:${claimHash(v, q)}`;

export async function recheckClaims(tag: string, targets: RepairTarget[], max = 4): Promise<{ fixed: string[]; failed: string[] }> {
  const fixed: string[] = [], failed: string[] = [];
  const fixedHashes: string[] = [];
  const done = await kvGet(targets.map(t => DONE(tag, t.videoId, t.startsWith)));
  const todo = targets.filter((_, i) => !done[i]).slice(0, max);
  if (!todo.length) return { fixed, failed };

  const recent = await getRecentBroadcasts(true).catch(() => []);
  const byVideo = new Map<string, RepairTarget[]>();
  for (const t of todo) byVideo.set(t.videoId, [...(byVideo.get(t.videoId) || []), t]);

  for (const [videoId, ts] of byVideo) {
    // The permanent record can lag the 72-hour store (claims added by a later
    // re-check); prefer whichever copy actually has the claims.
    const rec = recent.find(b => b.videoId === videoId) || null;
    const stored = await getFullBroadcast(videoId).catch(() => null);
    const has = (b: typeof stored) => !!b && ts.every(t => b.claims.some(x => normQuote(x.quote).startsWith(normQuote(t.startsWith))));
    let full = has(stored) ? stored : has(rec) ? (stored ? { ...stored, claims: rec!.claims.map(c => ({ ...c })) } : rec) : null;
    // Ledger-only broadcast: no full record; patch the ledger row itself.
    const ledgerOnly = !full;
    if (!full) full = await getReplayableOne(videoId).catch(() => null);
    if (!full) { failed.push(...ts.map(t => `${t.startsWith} (broadcast not found)`)); continue; }
    const transcript = full.transcript || "";
    const results = await Promise.all(ts.map(async t => {
      const c = full.claims.find(x => normQuote(x.quote).startsWith(normQuote(t.startsWith)));
      if (!c) return { t, c: null, v: null };
      if (t.patch) return { t, c, v: { ...t.patch, rating: t.patch.rating ?? c.rating, confidence: c.confidence, actual: t.patch.actual ?? c.actual, explanation: t.patch.explanation ?? c.explanation, sources: t.patch.sources ?? c.sources } as NonNullable<Awaited<ReturnType<typeof verifyClaimOnWeb>>> };
      // Fresh check: no prior verdict or note, only what led up to the claim.
      const v = await verifyClaimOnWeb({ quote: c.quote }, { context: contextBefore(c.quote, transcript), timeoutMs: 45_000, maxSearches: 3 }).catch(() => null);
      return { t, c, v };
    }));
    let changed = false;
    for (const { t, c, v } of results) {
      if (!c || !v) { failed.push(`${t.startsWith} (${!c ? "claim not found" : "no verdict"})`); continue; }
      const patch: Partial<LiveClaim> = {
        rating: v.rating, confidence: v.confidence, actual: v.actual, explanation: v.explanation,
        sources: v.sources, webVerified: true, metricKey: null, verifiedFromSource: false, groundTruth: undefined,
      };
      Object.assign(c, patch);
      const r = recent.find(b => b.videoId === videoId)?.claims.find(x => normQuote(x.quote) === normQuote(c.quote));
      if (r) Object.assign(r, patch);
      changed = true;
      fixedHashes.push(claimHash(videoId, c.quote));
      fixed.push(`${t.startsWith} → ${v.rating}`);
      await kvSetMany([
        [DONE(tag, videoId, t.startsWith), new Date().toISOString(), 0],
        [CHART_KEY(claimHash(videoId, c.quote)), "", 1],
      ]).catch(() => {});
    }
    if (changed && ledgerOnly) {
      const fixedQ = new Map(results.filter(r => r.c && r.v).map(r => [normQuote(r.c!.quote), r.c!]));
      await patchLedgerClaims(videoId, cl => {
        let n = 0;
        for (const lc of cl) {
          const f = fixedQ.get(normQuote(lc.quote));
          if (f) { lc.rating = f.rating; lc.actual = f.actual; lc.sources = f.sources; n++; }
        }
        return n > 0;
      });
    } else if (changed) {
      await saveFullBroadcasts([full]);
      if (recent.some(b => b.videoId === videoId)) await setRecentBroadcasts(recent);
      await recordInLedger(full);
    }
  }
  // A fresh re-check supersedes any reconciled verdict laid over the claim.
  if (fixed.length) {
    const ov = { ...(await getVerdictOverlay(true).catch(() => ({}))) } as Record<string, unknown>;
    let dropped = 0;
    for (const h of fixedHashes) if (ov[h]) { delete ov[h]; dropped++; }
    if (dropped) await setVerdictOverlay(ov as Awaited<ReturnType<typeof getVerdictOverlay>>).catch(() => {});
  }
  if (fixed.length) await kvSetMany([["trending-claims:v3", "", 1]]).catch(() => {});
  return { fixed, failed };
}

/** Oct 15 (2nd pass): national claim narrowed to a state named earlier. */
export const NATIONAL_SCOPE_FIX: RepairTarget[] = [
  { videoId: "64w2lEYtw8E", startsWith: "our gasoline prices are lower than Biden" },
];

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

/** Nov 11: Vietnam claim read "seven months" as Vietnam's length; it was about the current war. */
export const TEXT_FIX_NOV11: RepairTarget[] = [
  {
    videoId: "XA4UuMZJyqU",
    startsWith: "They lost 65,000 in Vietnam",
    patch: {
      actual: "U.S. deaths in the Vietnam War: 58,220 (47,434 hostile, 10,786 non-hostile), per Department of Defense casualty records covering Nov 1955 to May 1975.",
      explanation: "He compared two different wars. The 65,000 figure is for Vietnam; official records show 58,220 U.S. deaths, about 6,800 fewer. \"Seven months\" is how long he said the current conflict has lasted; in the next sentence he gave twenty-one years for Vietnam. The record had wrongly read \"seven months\" as the length of Vietnam. Records date U.S. involvement in Vietnam from 1955 to 1975, about twenty years.",
      sources: [
        { title: "National Archives: Vietnam War U.S. Military Fatal Casualty Statistics", url: "https://www.archives.gov/research/military/vietnam-war/casualty-statistics" },
        { title: "Defense Casualty Analysis System: Vietnam conflict summary", url: "https://dcas.dmdc.osd.mil/dcas/app/conflictCasualties/vietnam/vietnamSum" },
      ],
    },
  },
];
