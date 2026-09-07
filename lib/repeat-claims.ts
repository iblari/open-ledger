// Cross-broadcast repeat detection.
//
// Distinct from the dedup in claim-utils.ts, which collapses restatements
// WITHIN one broadcast so the live feed doesn't show a card twice. Here the
// repetition is the point: the same assertion made on a different day is the
// finding, and every occurrence must survive.
//
// Two consequences for the matching rules:
//
//  1. Numbers must be preserved. In-broadcast dedup drops short tokens, so
//     "48 years" and "fifty years" collapse — correct when it's one sentence
//     re-transcribed, wrong across broadcasts, where a different figure means
//     a different claim.
//  2. Precision beats recall. Wrongly asserting that someone repeated
//     themselves is a credibility problem for a fact-checking site, while a
//     missed repeat is merely a smaller list. Thresholds are set accordingly.

const STOPWORDS = new Set([
  "the","and","of","to","a","in","is","it","you","that","we","for","on","are",
  "as","with","this","be","at","have","or","not","but","by","from","they","an",
  "i","my","your","their","was","were","has","had","will","would","our","us",
  "been","so","all","what","when","there","here","its","more","most","very",
  "can","do","does","did","if","then","than","them","he","she","his","her",
  "who","which","just","been","also","now","get","got",
]);

const NUM_WORDS: Record<string, number> = {
  zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8,
  nine:9, ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15,
  sixteen:16, seventeen:17, eighteen:18, nineteen:19, twenty:20, thirty:30,
  forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90,
};
const SCALES: Record<string, number> = {
  thousand:1e3, million:1e6, billion:1e9, trillion:1e12,
};

/** Meaningful words, numerals excluded — those are compared separately. */
function contentWords(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/)
      .filter(w => w.length > 2 && !STOPWORDS.has(w) && !/^\d/.test(w))
  );
}

/**
 * Every magnitude a quote asserts, normalised so "$2 billion", "2,000,000,000"
 * and "two billion" all land on the same value.
 */
export function figuresIn(s: string): Set<number> {
  const out = new Set<number>();
  const t = s.toLowerCase().replace(/,/g, "");
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(percent|%|thousand|million|billion|trillion)?/g)) {
    const scale = m[2] && SCALES[m[2]] ? SCALES[m[2]] : 1;
    const v = parseFloat(m[1]) * scale;
    if (Number.isFinite(v)) out.add(Math.round(v * 100) / 100);
  }
  for (const m of t.matchAll(/\b([a-z]+)\s*(thousand|million|billion|trillion)?\b/g)) {
    const base = NUM_WORDS[m[1]];
    if (base === undefined) continue;
    const scale = m[2] && SCALES[m[2]] ? SCALES[m[2]] : 1;
    out.add(Math.round(base * scale * 100) / 100);
  }
  return out;
}

/** Figures specific enough to identify a claim on their own. "two" is not;
 *  11,888 is. */
function distinctive(ns: Set<number>): Set<number> {
  return new Set([...ns].filter(n => n >= 1000 || !Number.isInteger(n)));
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
}

/** How completely the shorter quote's wording sits inside the longer one. */
function containment(a: Set<string>, b: Set<string>): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  return small.size === 0 ? 0 : overlap(small, large) / small.size;
}

/** Jaccard — unlike containment this punishes a large length gap. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  const inter = overlap(a, b);
  return inter / (a.size + b.size - inter);
}

export type Relation = "same" | "drift" | null;

/**
 * How two quotes from different broadcasts relate.
 *
 *   "same"  — the same assertion, restated.
 *   "drift" — the same assertion frame, but the speaker's own figure moved
 *             ($19tn invested becoming $20tn nine days later). Deliberately
 *             kept apart from "same": the changing number is the story.
 */
export function claimRelation(a: string, b: string): { rel: Relation; why: string } {
  const ca = contentWords(a), cb = contentWords(b);
  const fa = figuresIn(a), fb = figuresIn(b);
  const da = distinctive(fa), db = distinctive(fb);

  // A shared distinctive figure identifies a claim more reliably than word
  // overlap does. "11,888 murderers" carries a single content word and would
  // otherwise never match its own restatement.
  if (da.size && db.size && overlap(
        new Set([...da].map(String)), new Set([...db].map(String))) > 0
      && overlap(ca, cb) > 0) {
    return { rel: "same", why: "shared figure" };
  }

  // Below four content words a quote is too thin to match on wording alone.
  if (ca.size < 4 || cb.size < 4) return { rel: null, why: "too short" };
  if (containment(ca, cb) < 0.60) return { rel: null, why: "wording differs" };

  // Containment alone lets a short generic line ("the crime numbers are way
  // down") be swallowed by a long rambling one that happens to reuse its four
  // words. Jaccard collapses when the lengths diverge, so it vetoes exactly
  // that case while leaving genuine restatements untouched.
  const j = jaccard(ca, cb);
  if (j < 0.40) return { rel: null, why: "length mismatch" };

  if (fa.size && fb.size) {
    const [small, large] = fa.size <= fb.size ? [fa, fb] : [fb, fa];
    // Subset, not mere overlap: "4% in 2024" and "4% in 2019" share a figure
    // yet are different claims. One quote simply carrying more detail is fine.
    const isSubset = [...small].every(n => large.has(n));
    if (!isSubset) {
      return j >= 0.45
        ? { rel: "drift", why: "figures moved" }
        : { rel: null, why: "figures conflict" };
    }
  }
  return { rel: "same", why: "wording" };
}

export interface RepeatOccurrence {
  quote: string;
  rating: string;
  speaker: string | null;
  day: string;
  videoId: string;
  title: string;
}

export interface RepeatCluster {
  id: string;
  occurrences: RepeatOccurrence[];
  days: string[];
  speakers: string[];
  ratings: string[];
  /** True when one assertion drew different verdicts on different days —
   *  a signal about our own consistency, not about the speaker. */
  verdictInconsistent: boolean;
}

export interface DriftPair {
  earlier: RepeatOccurrence;
  later: RepeatOccurrence;
}

/**
 * Group occurrences of the same claim across broadcasts.
 *
 * Claims from a single broadcast are never compared: in-broadcast dedup has
 * already run, and re-collapsing them here would understate how often a line
 * was actually used.
 */
export function findRepeats(all: RepeatOccurrence[]): {
  clusters: RepeatCluster[];
  drift: DriftPair[];
} {
  const parent = all.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  const drift: DriftPair[] = [];

  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (all[i].videoId === all[j].videoId) continue;
      const { rel } = claimRelation(all[i].quote, all[j].quote);
      if (rel === "same") {
        const a = find(i), b = find(j);
        if (a !== b) parent[a] = b;
      } else if (rel === "drift") {
        const [earlier, later] = all[i].day <= all[j].day ? [all[i], all[j]] : [all[j], all[i]];
        drift.push({ earlier, later });
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < all.length; i++) {
    const r = find(i);
    (groups.get(r) ?? groups.set(r, []).get(r)!).push(i);
  }

  const clusters: RepeatCluster[] = [];
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    const occ = idx.map(i => all[i]).sort((x, y) => x.day.localeCompare(y.day));
    const ratings = [...new Set(occ.map(o => o.rating).filter(Boolean))];
    clusters.push({
      id: occ[0].videoId + ":" + occ[0].quote.slice(0, 40),
      occurrences: occ,
      days: [...new Set(occ.map(o => o.day))].sort(),
      speakers: [...new Set(occ.map(o => o.speaker).filter(Boolean) as string[])],
      ratings,
      verdictInconsistent: ratings.length > 1,
    });
  }

  clusters.sort((a, b) =>
    b.occurrences.length - a.occurrences.length || b.days.length - a.days.length);
  return { clusters, drift };
}
