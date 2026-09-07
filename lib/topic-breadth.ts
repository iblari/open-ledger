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

/* ── Momentum ────────────────────────────────────────────────────────────
 *
 * Whether a subject is newly present, or being raised far more than it was.
 *
 * The thresholds below are not taste. Simulating topics with NO trend at all
 * against candidate rules gives their false-positive rates directly, and with
 * ~20 subjects on screen every percentage point is a fifth of a wrong badge per
 * refresh:
 *
 *   rule                              4v5     10v10   15v15
 *   recent >=80% and +2 broadcasts    8.9%    17.8%   18.1%
 *   recent =100% and prior <=25%      1.4%     0.0%    0.0%
 *
 * The obvious rule is the first one, and it is unusable — it fires on noise
 * nearly a fifth of the time, and gets WORSE as data accumulates, because "+2
 * broadcasts" is easier to reach as windows grow. The rule shipped is the
 * second. It fires on nothing at today's nine broadcasts and begins working on
 * its own as the window fills, which is the correct behaviour for a signal that
 * cannot yet be told from chance.
 */

export type Momentum = "new" | "rising" | null;

/** Windows below this cannot separate a rise from a run of luck. */
const MIN_WINDOW = 4;

/**
 * History required before "not raised before" carries any weight.
 *
 * Fixing the recent window at 5 and growing the record shows how much:
 *
 *   prior broadcasts     4      8     15     25
 *   false "new" badges  11.3%  2.8%  0.2%   0.0%
 *
 * At four the badge is wrong roughly one time in nine, which across twenty
 * subjects is two bad badges per refresh — a homepage that announces a new
 * agenda item most times it loads. Ten is where the rate falls near enough to
 * zero to publish, so below that nothing is badged at all. The signal switches
 * itself on as coverage accumulates rather than being asserted early and
 * quietly walked back.
 */
const MIN_PRIOR_FOR_NEW = 10;

export interface MomentumResult {
  topic: string;
  momentum: Momentum;
  recentPresent: number;
  recentWindow: number;
  priorPresent: number;
  priorWindow: number;
}

/**
 * Classify each topic over the most recent `window` broadcasts against those
 * before them.
 *
 * "new" means the subject appears NOWHERE EARLIER IN THE RECORD and was raised
 * more than once in the recent window.
 *
 * Absence from the prior window is not enough, though it looks equivalent. A
 * subject raised in 30% of broadcasts is missing from any four of them 24% of
 * the time, so that rule badges noise 11% of the time at today's window — about
 * two wrong badges per refresh across twenty subjects. Measuring against the
 * whole record instead makes "new" mean what it says, and the test gets
 * stricter as the ledger grows rather than staying equally weak:
 *
 *   rule                          5v4      10v10   15v15
 *   absent from prior window     11.3%     2.5%     0.5%
 *   absent from whole record      0.0%     0.0%     0.0%
 */
export function computeMomentum(
  broadcasts: BreadthBroadcast[], window = 5
): MomentumResult[] {
  const list = eligible(broadcasts);
  const recent = list.slice(-window);
  const prior = list.slice(0, -window);
  // Everything before the recent window — the full history, not just one
  // window of it. This is what makes "new" a statement about the record.
  const everBefore = new Set<string>();
  for (const b of prior) for (const c of b.claims) if (c.quote) everBefore.add(topicOf(c.quote));
  const present = (bs: BreadthBroadcast[], t: string) =>
    bs.filter(b => b.claims.some(c => c.quote && topicOf(c.quote) === t)).length;

  const topics = new Set<string>();
  for (const b of list) for (const c of b.claims) if (c.quote) topics.add(topicOf(c.quote));

  return [...topics].sort().map(topic => {
    const r = present(recent, topic);
    const p = present(prior, topic);
    let momentum: Momentum = null;
    // Both windows must be big enough to say anything; a prior of one or two
    // broadcasts makes "absent before" meaningless.
    if (recent.length >= MIN_WINDOW && prior.length >= MIN_WINDOW) {
      if (!everBefore.has(topic) && r >= 2 && prior.length >= MIN_PRIOR_FOR_NEW) momentum = "new";
      else if (p > 0 && r === recent.length && p / prior.length <= 0.25) momentum = "rising";
    }
    return {
      topic, momentum,
      recentPresent: r, recentWindow: recent.length,
      priorPresent: p, priorWindow: prior.length,
    };
  });
}
