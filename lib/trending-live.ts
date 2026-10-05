import { unstable_cache } from "next/cache";
import { getLedgerHealed } from "./live-kv";
import { findRepeats, type RepeatOccurrence } from "./repeat-claims";
import { computeShift } from "./topic-breadth";
import { loadTopicTags } from "./topic-tags";
import type { TrendCard } from "./bench-lens";

/**
 * Trending cards drawn from the broadcast ledger, for the homepage strip:
 *  - a line said again this week, and how often it has been said before
 *  - a subject turning up across more broadcasts than it used to
 *
 * Cached for ten minutes: the homepage is force-dynamic, and reading the whole
 * ledger on every visit would spend KV commands to recompute an answer that
 * only changes when a broadcast ends.
 */
const WEEK = 7 * 864e5;
const fmtDay = (iso: string) =>
  new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso)
    .toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const title = (r: string) => r.toLowerCase().replace(/\b\w/g, m => m.toUpperCase());

async function compute(): Promise<TrendCard[]> {
  const [ledger] = await Promise.all([getLedgerHealed(), loadTopicTags()]);
  if (!ledger.length) return [];
  const now = Date.now();
  const cards: TrendCard[] = [];

  // ── Repeated lines ──
  const all: RepeatOccurrence[] = [];
  for (const e of ledger) for (const c of e.claims) {
    if (!c.quote) continue;
    all.push({ quote: c.quote, rating: (c.rating || "").toUpperCase(), speaker: e.speaker,
      day: e.startedAt.slice(0, 10), videoId: e.videoId, title: e.title });
  }
  const { clusters } = findRepeats(all);
  const fresh = clusters
    .map(c => ({ c, broadcasts: new Set(c.occurrences.map(o => o.videoId)).size, last: c.days[c.days.length - 1] }))
    .filter(x => x.broadcasts >= 3 && now - Date.parse(x.last + "T23:59:59Z") < WEEK)
    .sort((a, b) => b.broadcasts - a.broadcasts || b.last.localeCompare(a.last))
    .slice(0, 2);
  for (const { c, broadcasts, last } of fresh) {
    const latest = c.occurrences[c.occurrences.length - 1];
    let q = latest.quote.replace(/\s+/g, " ").trim().replace(/[.,;:!]+$/, "");
    if (q.length > 70) q = q.slice(0, 67).replace(/\s+\S*$/, "") + "…";
    const who = c.speakers.length === 1 ? c.speakers[0] : null;
    // Most common verdict, so the badge reflects the bulk of the record.
    const tally = new Map<string, number>();
    for (const o of c.occurrences) if (o.rating) tally.set(o.rating, (tally.get(o.rating) || 0) + 1);
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r);
    const bad = top[0] === "FALSE" || top[0] === "MISLEADING";
    cards.push({
      id: `rep-${c.id}`,
      kicker: "Fact-checks",
      headline: `“${cap(q)}” — said again${who ? ` by ${who.split(" ").slice(-1)[0]}` : ""}, now in ${broadcasts} broadcasts`,
      badge: top.length ? `Mostly rated ${title(top[0])}` : `${broadcasts}× repeated`,
      tone: bad ? "bad" : "neutral",
      date: last, dateLabel: fmtDay(last),
      href: `/live?v=${latest.videoId}`,
      score: 4 + Math.min(broadcasts, 10) / 2,
    });
  }

  // ── Rising subject ──
  const shift = computeShift(ledger.map(e => ({
    videoId: e.videoId, title: e.title, startedAt: e.startedAt,
    claims: e.claims.map(c => ({ quote: c.quote })),
  })), 5);
  const r = shift?.rising.find(x => x.confidence !== "too-early");
  if (shift && r && shift.to && now - Date.parse(shift.to) < 2 * WEEK) {
    cards.push({
      id: `topic-${r.topic}`,
      kicker: "Broadcasts",
      headline: `${r.topic} came up in ${r.recent} of the last ${shift.window} broadcasts, up from ${r.prior}`,
      badge: `↑ Rising topic`,
      tone: "neutral",
      date: shift.to, dateLabel: fmtDay(shift.to),
      href: "/live#shift-h",
      score: 4 + (r.recent - r.prior),
    });
  }
  // Two repeat cards only when there's no subject card to vary the strip.
  const reps = cards.filter(c => c.kicker === "Fact-checks");
  return reps.length > 1 && cards.length > reps.length ? cards.filter(c => c !== reps[1]) : cards;
}

export const liveTrending = unstable_cache(
  async () => { try { return await compute(); } catch { return []; } },
  ["trending-live-v1"],
  { revalidate: 600 },
);
