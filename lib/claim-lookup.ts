import { unstable_cache } from "next/cache";
import {
  getLedgerHealed, getLiveState, getLiveClaims, getRecentBroadcasts, getFullBroadcast,
  speakerFromTitle, type LedgerEntry,
} from "./live-kv";
import { claimHash, claimPath, normQuote } from "./claim-link";
import { claimRelation } from "./repeat-claims";

export interface SharedClaim {
  key: string;
  videoId: string;
  quote: string;
  rating: string;
  actual: string;
  explanation?: string;
  sources: { title: string; url: string }[];
  videoTime?: number;
  title: string;
  speaker: string | null;
  date: string;          // ISO of the broadcast
  live: boolean;         // the broadcast is on air right now
}
export interface Repeat { path: string; date: string; rating: string; title: string; same: boolean }

/** Find one claim by its hash: the live feed first (a link shared mid-
 *  broadcast must open before the broadcast is archived), then the 72-hour
 *  cache, then the permanent ledger. */
async function find(hash: string): Promise<{ claim: SharedClaim; ledger: LedgerEntry[] } | null> {
  const [state, ledger] = await Promise.all([
    getLiveState().catch(() => null),
    getLedgerHealed().catch(() => [] as LedgerEntry[]),
  ]);
  const onAir = state?.status === "live" ? state.videoId : null;

  if (state?.status === "live" && state.videoId) {
    const live = await getLiveClaims().catch(() => []);
    for (const c of live) {
      if (claimHash(state.videoId, c.quote) !== hash) continue;
      return { ledger, claim: {
        key: hash, videoId: state.videoId, quote: c.quote, rating: c.rating, actual: c.actual,
        explanation: c.explanation, sources: c.sources || [], videoTime: c.videoTime,
        title: state.title, speaker: speakerFromTitle(state.title), date: state.startedAt, live: true,
      } };
    }
  }

  const recent = await getRecentBroadcasts().catch(() => []);
  for (const b of recent) for (const c of b.claims) {
    if (claimHash(b.videoId, c.quote) !== hash) continue;
    return { ledger, claim: {
      key: hash, videoId: b.videoId, quote: c.quote, rating: c.rating, actual: c.actual,
      explanation: c.explanation, sources: c.sources || [], videoTime: c.videoTime,
      title: b.title, speaker: speakerFromTitle(b.title), date: b.startedAt, live: b.videoId === onAir,
    } };
  }

  for (const e of ledger) for (const c of e.claims) {
    if (claimHash(e.videoId, c.quote) !== hash) continue;
    // The ledger keeps no written explanation; the permanent full record does.
    let explanation: string | undefined;
    const full = await getFullBroadcast(e.videoId).catch(() => null);
    const fc = full?.claims.find(x => normQuote(x.quote) === normQuote(c.quote));
    if (fc) explanation = fc.explanation;
    return { ledger, claim: {
      key: hash, videoId: e.videoId, quote: c.quote, rating: c.rating, actual: c.actual || "",
      explanation, sources: c.sources || [], videoTime: c.videoTime,
      title: e.title, speaker: e.speaker, date: e.startedAt, live: e.videoId === onAir,
    } };
  }
  return null;
}

/** Other times the same line was said, from the ledger, oldest first. */
function repeatsOf(claim: SharedClaim, ledger: LedgerEntry[]): Repeat[] {
  const out: Repeat[] = [];
  for (const e of ledger) {
    if (e.videoId === claim.videoId) continue;
    const hit = e.claims.find(c => c.quote && claimRelation(claim.quote, c.quote).rel === "same");
    if (hit) out.push({
      path: claimPath(e.videoId, hit.quote), date: e.startedAt, rating: hit.rating,
      title: e.title, same: true,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export const getSharedClaim = (hash: string) => unstable_cache(
  async () => {
    try {
      const r = await find(hash);
      if (!r) return null;
      return { claim: r.claim, repeats: repeatsOf(r.claim, r.ledger) };
    } catch { return null; }
  },
  ["shared-claim-v1", hash],
  // Short: during a broadcast the "live now" band and the verdict (a claim
  // can move from CHECKING to a result) must not stick for long.
  { revalidate: 120 },
)();
