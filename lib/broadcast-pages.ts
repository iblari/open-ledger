/**
 * Indexable broadcast recap pages (/broadcasts/[slug]) from the permanent
 * ledger. Slug = readable title + the YouTube id (11 chars), so it is
 * stable, unique, and resolvable without a lookup table.
 */
import { unstable_cache } from "next/cache";
import { getLedger, type LedgerEntry } from "./live-kv";
import { claimPath, claimHash } from "./claim-link";
import { toVerdict } from "./live-design";
import { findRepeats, type RepeatOccurrence } from "./repeat-claims";

/** Titles arrive HTML-escaped from YouTube ("SBA&#39;s"). */
export const decodeTitle = (s: string) => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
export const slugify = (s: string) => {
  const full = decodeTitle(s).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (full.length <= 72) return full;
  const cut = full.slice(0, 72);
  return cut.slice(0, cut.lastIndexOf("-") > 30 ? cut.lastIndexOf("-") : 72); // whole words only
};
export const broadcastSlug = (e: { title: string; videoId: string }) => `${slugify(e.title) || "broadcast"}-${e.videoId}`;
export const videoIdFromSlug = (slug: string) => (slug.length > 11 ? slug.slice(-11) : null);

export interface BClaim { quote: string; rating: string; actual: string; videoTime?: number; path: string; key: string; repeats: number; sources: { title: string; url: string }[] }
export interface BRecap { slug: string; videoId: string; title: string; speaker: string | null; date: string; durationSec: number;
  counts: LedgerEntry["counts"]; matchedPct: number | null; claims: BClaim[] }

const build = async (): Promise<BRecap[]> => {
  const ledger = await getLedger().catch(() => [] as LedgerEntry[]);
  // How many broadcasts each claim has been made in (repeat clustering across the ledger).
  const occ: RepeatOccurrence[] = ledger.flatMap(e => e.claims.filter(c => c.quote).map(c => ({ quote: c.quote, rating: c.rating, speaker: e.speaker, day: (e.startedAt || "").slice(0, 10), videoId: e.videoId, title: e.title })));
  const times = new Map<string, number>();
  try {
    for (const cl of findRepeats(occ).clusters) {
      const n = new Set(cl.occurrences.map(o => o.videoId)).size;
      for (const o of cl.occurrences) times.set(`${o.videoId}|${o.quote}`, n);
    }
  } catch { /* repeat counts are a bonus, never a blocker */ }
  return ledger.filter(e => e.claims.some(c => toVerdict(c.rating))).map(e => {
    const c = e.counts; const scored = c.true + c.misleading + c.false;
    return {
      slug: broadcastSlug(e), videoId: e.videoId, title: decodeTitle(e.title), speaker: e.speaker, date: e.startedAt, durationSec: e.durationSec,
      counts: c, matchedPct: scored ? Math.round((c.true / scored) * 100) : null,
      claims: e.claims.filter(x => x.quote && toVerdict(x.rating)).sort((a, b) => (a.videoTime ?? 0) - (b.videoTime ?? 0)).map(x => ({
        quote: x.quote, rating: (x.rating || "").toUpperCase(), actual: x.actual || "", videoTime: x.videoTime,
        path: claimPath(e.videoId, x.quote), key: claimHash(e.videoId, x.quote), repeats: times.get(`${e.videoId}|${x.quote}`) ?? 1, sources: x.sources ?? [],
      })),
    };
  }).sort((a, b) => b.date.localeCompare(a.date));
};

export const getBroadcastRecaps = unstable_cache(build, ["broadcast-recaps-v1"], { revalidate: 1800 });
export async function getBroadcastRecap(slug: string) {
  const id = videoIdFromSlug(slug);
  const all = await getBroadcastRecaps();
  return all.find(b => b.videoId === id) ?? null;
}

/** ClaimReview rating scale used site-wide (structured data). */
export const RATING_SCALE: Record<string, number> = { FALSE: 1, MISLEADING: 2, "MOSTLY TRUE": 3, TRUE: 4 };
export const ratingName = (r: string) => (r === "MOSTLY TRUE" ? "Mostly true" : r.charAt(0) + r.slice(1).toLowerCase());
export const mmss = (s?: number) => s == null ? "" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
