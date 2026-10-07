import { unstable_cache } from "next/cache";
import { getLedgerHealed } from "./live-kv";
import { findRepeats, type RepeatOccurrence } from "./repeat-claims";
import { getRadar } from "./agenda-radar";
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
      badge: top.length ? `Mostly ${title(top[0])}` : `${broadcasts}× repeated`,
      tone: bad ? "bad" : "neutral",
      date: last, dateLabel: fmtDay(last),
      href: `/live?v=${latest.videoId}`,
      score: 4 + Math.min(broadcasts, 10) / 2,
    });
  }

  // ── From the agenda radar (/live), so the strip and the radar agree ──
  const rad = await getRadar().catch(() => null);
  if (rad) {
    const asOf = rad.window.to;
    const top = rad.themes.filter(t => t.market && (t.status === "rising" || t.status === "new"))
      .sort((a, b) => b.z - a.z)[0];
    if (top && now - Date.parse(asOf) < 2 * WEEK) {
      const m = top.baseRate > 0 ? top.recentRate / top.baseRate : null;
      cards.push({
        id: `radar-${top.key}`,
        kicker: "Agenda",
        headline: `${top.label} talk is ${m ? `up ${m >= 10 ? Math.round(m) : m.toFixed(1)}×` : "new"} in the last two weeks, across ${top.recentBroadcasts} broadcasts`,
        badge: "▲ Rising on air",
        tone: "neutral",
        date: asOf, dateLabel: fmtDay(asOf),
        href: "/live#radar-h",
        score: 4 + Math.min(top.z, 12) / 2,
      });
    }
    // Names said on air for the first time, newest first.
    const firsts = [...rad.companies, ...rad.people]
      .filter(e => e.firstSeen).sort((a, b) => b.firstSeen!.localeCompare(a.firstSeen!));
    if (firsts.length && now - Date.parse(firsts[0].firstSeen!) < WEEK) {
      const day = firsts[0].firstSeen!.slice(0, 10);
      const same = firsts.filter(e => e.firstSeen!.slice(0, 10) === day);
      const names = same.slice(0, 4).map(e => e.name);
      cards.push({
        id: `radar-first-${day}`,
        kicker: "Named on air",
        headline: `First time on air: ${names.join(", ")}${same.length > 4 ? ` and ${same.length - 4} more` : ""}`,
        badge: `${same.length} new name${same.length === 1 ? "" : "s"}`,
        tone: "neutral",
        date: firsts[0].firstSeen!, dateLabel: fmtDay(firsts[0].firstSeen!),
        href: "/live#radar-h",
        score: 4 + Math.min(same.length, 6) / 2,
      });
    }
  }
  // Two repeat cards only when nothing else varies the strip.
  const reps = cards.filter(c => c.kicker === "Fact-checks");
  return reps.length > 1 && cards.length > reps.length ? cards.filter(c => c !== reps[1]) : cards;
}

export const liveTrending = unstable_cache(
  async () => { try { return await compute(); } catch { return []; } },
  ["trending-live-v3"],
  { revalidate: 600 },
);
