// Client-safe pure helpers for the live fact-check pipeline.
//
// Used by BOTH the server routes (/api/live-fact-check, /api/admin/ingest)
// and the /live page. No env vars, no fetch, no React — keep it that way so
// it can be imported anywhere without bundling surprises.

/* ── Chunk pre-filter ─────────────────────────────────────────────
 *
 * Every ~15s transcript chunk used to be sent to Claude, even chunks with
 * zero economic content ("thank you all for being here today..."). In a
 * typical political speech, well under half the chunks mention the economy,
 * so skipping the obvious no-ops cuts both cost and end-to-end latency
 * (no queued API round-trip for empty chunks).
 *
 * Decision rule (intentionally recall-biased — false positives just cost one
 * cheap Haiku call; false negatives lose a claim):
 *   1. Chunk mentions an economic keyword            → CHECK
 *   2. No keyword, but has a number + scale/percent  → CHECK (odd phrasing)
 *   3. Otherwise                                     → SKIP
 */

const ECON_KEYWORDS = [
  // labor
  "job", "jobs", "unemployment", "employment", "workforce", "labor", "labour",
  "payroll", "hiring", "layoff",
  // output & growth
  "gdp", "economy", "economic", "growth", "recession", "manufacturing",
  "production", "productivity", "factory", "factories", "plants",
  // prices & costs
  "inflation", "price", "prices", "cost", "costs", "cost of living", "cpi",
  "grocery", "groceries", "gas price", "gasoline", "energy", "oil", "rent",
  "insurance", "prescription", "afford", "drill", "liquid gold",
  // wages & income
  "wage", "wages", "income", "salary", "salaries", "paycheck", "earnings",
  "poverty",
  // fiscal
  "debt", "deficit", "budget", "spending", "tax", "taxes", "tariff",
  "tariffs", "revenue", "appropriation", "infrastructure",
  // markets & money
  "stock market", "stocks", "s&p", "dow", "nasdaq", "401k", "market",
  "interest rate", "interest rates", "federal reserve", "the fed",
  "mortgage", "dollar", "inflation reduction",
  // trade
  "trade", "exports", "imports", "trade deficit", "trade surplus",
];

// Number + explicit scale/percent: "40 percent", "2 trillion", "3.4%".
const NUMBER_SCALE_RE =
  /\d[\d,.]*\s*(%|percent|million|billion|trillion|thousand)/i;
// Dollar amounts of any size: "$400 a month", "$7,500 credit".
const DOLLAR_RE = /\$\s?\d/;
// Bare numbers with 3+ digits ("46,000 new projects", "over 400 bills") —
// specific enough that they're usually a checkable quantity, not "World War 2".
const BIG_NUMBER_RE = /\d[\d,]{2,}/;

export function likelyHasEconomicClaim(text: string): boolean {
  const t = text.toLowerCase();
  for (const kw of ECON_KEYWORDS) {
    if (t.includes(kw)) return true;
  }
  return NUMBER_SCALE_RE.test(t) || DOLLAR_RE.test(t) || BIG_NUMBER_RE.test(t);
}

/* ── Cross-chunk claim dedup ──────────────────────────────────────
 *
 * Speakers repeat their best lines ("15 million new jobs" can show up three
 * times in one speech), and chunk boundaries can slice the same sentence into
 * two overlapping chunks. Each occurrence used to produce a separate fact
 * card. We treat two claims as duplicates when their quotes share most of
 * their meaningful words (Jaccard overlap on stopword-filtered tokens).
 */

const STOPWORDS = new Set([
  "the", "and", "of", "to", "a", "in", "is", "it", "you", "that", "we",
  "for", "on", "are", "as", "with", "this", "be", "at", "have", "or", "not",
  "but", "by", "from", "they", "an", "i", "my", "your", "their", "was",
  "were", "has", "had", "will", "would", "our", "us",
]);

function tokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOPWORDS.has(w))
  );
}

/** Jaccard similarity between the meaningful words of two quotes. 0..1. */
export function quoteSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** True when `quote` is a near-duplicate of any quote in `existing`.
 *  0.6 threshold: catches re-statements and chunk-overlap dupes while
 *  keeping distinct claims about the same metric (different numbers /
 *  different years share few tokens beyond the metric name). */
export function isDuplicateQuote(
  quote: string,
  existing: string[],
  threshold = 0.6
): boolean {
  for (const e of existing) {
    if (quoteSimilarity(quote, e) >= threshold) return true;
  }
  return false;
}

/** Drop near-duplicate claims, both within the batch and against a list of
 *  recently seen quotes. Returns the survivors in original order. */
export function dedupeClaims<Tclaim extends { quote: string }>(
  incoming: Tclaim[],
  recentQuotes: string[],
  threshold = 0.6
): Tclaim[] {
  const kept: Tclaim[] = [];
  const seen = [...recentQuotes];
  for (const c of incoming) {
    if (!isDuplicateQuote(c.quote, seen, threshold)) {
      kept.push(c);
      seen.push(c.quote);
    }
  }
  return kept;
}
