// How widely a subject is being raised, as opposed to how much was said about it.
//
// Counting CLAIMS answers the wrong question. Claims cluster inside events: one
// education speech produced 14 of them, making education 8% of everything ever
// said and the 4th biggest subject on the ledger — off a single broadcast. That
// number describes the length of one speech, not the salience of a topic.
//
// Breadth counts BROADCASTS instead, and binarises: a topic raised twenty times
// in one event scores exactly what a topic raised once does. That cap is the
// whole mechanism. It bounds any single themed event at one vote, which is the
// failure mode that makes claim share unusable, and it leaves the signal that
// actually matters — a subject turning up across unrelated events.
//
// The measure is defined over the broadcast sequence rather than the calendar.
// Coverage is uneven (two broadcasts on Sep 2, none on Aug 15) and a day with no
// broadcast carries no information about attention. Indexing by day would render
// those gaps as zeros, which asserts something the data cannot support.

import { topicOf } from "./claim-topics";

export interface BreadthBroadcast {
  videoId: string;
  title: string;
  startedAt: string;
  claims: { quote: string }[];
}

export interface TopicBreadth {
  topic: string;
  /** Broadcasts in which the topic was raised at all. */
  present: number;
  /** Broadcasts considered — those where fact-checking actually produced
   *  claims. */
  broadcasts: number;
  /** present / broadcasts, 0..1. */
  breadth: number;
  /** Of `present`, those NOT themed on this topic. Immigration raised in an
   *  immigration speech is tautological; immigration raised in a manufacturing
   *  speech is a talking point being carried. This is the sharper signal. */
  offTheme: number;
  /** offTheme as a share of all broadcasts considered, 0..1. */
  offThemeRate: number;
}

export interface BreadthPoint {
  /** Broadcast the window ends on — the axis is sequence, not date. */
  endedAt: string;
  endedVideoId: string;
  present: number;
  window: number;
  breadth: number;
}

/**
 * The topic a broadcast was *about*: the one with the most claims.
 *
 * Ties resolve alphabetically. An arbitrary rule beats an unstable one — a tie
 * broken by object key order would silently reshuffle when the ledger is
 * rewritten, moving off-theme counts with no change in the underlying data.
 */
export function themeOf(b: BreadthBroadcast): string | null {
  const counts = new Map<string, number>();
  for (const c of b.claims) {
    if (!c.quote) continue;
    const t = topicOf(c.quote);
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  return [...counts.entries()].sort(
    (a, b2) => b2[1] - a[1] || a[0].localeCompare(b2[0])
  )[0][0];
}

/**
 * Broadcasts eligible for a breadth denominator, oldest first.
 *
 * Zero-claim broadcasts are dropped. One in the record produced nothing across
 * 17 minutes because the audio chain failed, and counting it would enter every
 * topic as absent — turning a coverage failure into evidence that nothing was
 * said. Absence of evidence, recorded as evidence of absence, in the
 * denominator of every topic at once.
 */
export function eligible(broadcasts: BreadthBroadcast[]): BreadthBroadcast[] {
  return broadcasts
    .filter(b => b.claims.some(c => c.quote))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export function computeBreadth(broadcasts: BreadthBroadcast[]): TopicBreadth[] {
  const list = eligible(broadcasts);
  const n = list.length;
  const present = new Map<string, number>();
  const offTheme = new Map<string, number>();

  for (const b of list) {
    const theme = themeOf(b);
    const seen = new Set<string>();
    for (const c of b.claims) if (c.quote) seen.add(topicOf(c.quote));
    for (const t of seen) {
      present.set(t, (present.get(t) ?? 0) + 1);
      if (t !== theme) offTheme.set(t, (offTheme.get(t) ?? 0) + 1);
    }
  }

  return [...present.entries()]
    .map(([topic, p]) => ({
      topic,
      present: p,
      broadcasts: n,
      breadth: n > 0 ? p / n : 0,
      offTheme: offTheme.get(topic) ?? 0,
      offThemeRate: n > 0 ? (offTheme.get(topic) ?? 0) / n : 0,
    }))
    .sort((a, b) => b.breadth - a.breadth || b.present - a.present || a.topic.localeCompare(b.topic));
}

/**
 * Rolling breadth for one topic, one point per broadcast once a full window
 * exists.
 *
 * Partial leading windows are omitted rather than computed over fewer
 * broadcasts: a 2-of-2 opening point reads as 100% beside later points that
 * cannot exceed 5-of-5, and the eye takes the resulting drop for a decline.
 */
export function rollingBreadth(
  broadcasts: BreadthBroadcast[], topic: string, window = 5
): BreadthPoint[] {
  const list = eligible(broadcasts);
  if (window < 1 || list.length < window) return [];

  const hits: number[] = list.map(b => {
    for (const c of b.claims) if (c.quote && topicOf(c.quote) === topic) return 1;
    return 0;
  });

  const out: BreadthPoint[] = [];
  let sum = hits.slice(0, window).reduce((a, b) => a + b, 0);
  for (let i = window - 1; i < list.length; i++) {
    if (i >= window) sum += hits[i] - hits[i - window];
    out.push({
      endedAt: list[i].startedAt,
      endedVideoId: list[i].videoId,
      present: sum,
      window,
      breadth: sum / window,
    });
  }
  return out;
}

/**
 * Broadcasts each side of a comparison needs for a breadth shift to be
 * distinguishable from noise — two-proportion, alpha .05 two-sided, power .8.
 *
 * Exported because a breadth chart without it invites reading every wobble as a
 * trend. A move from 40% to 60% wants about 97 broadcasts per period and will
 * look completely convincing on 9.
 */
export function broadcastsNeeded(from: number, to: number): number | null {
  if (from === to) return null;
  const z = 1.959964, zb = 0.8416;
  const pbar = (from + to) / 2;
  const num = z * Math.sqrt(2 * pbar * (1 - pbar))
            + zb * Math.sqrt(from * (1 - from) + to * (1 - to));
  return Math.ceil((num * num) / ((to - from) * (to - from)));
}
