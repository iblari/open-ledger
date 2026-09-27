// What a claim is about.
//
// Two layers:
//
//  1. A STORED TAG per claim (KV hash claim-topics:v1, keyed by the
//     normalised quote). New claims are tagged once by a model against the
//     fixed TOPICS list below; the 486-claim backfill was reviewed by hand.
//     Once written a tag never changes on its own, so the chart stays
//     reproducible — the same claim always lands in the same place — and the
//     tag travels with every claim in /api/topic-claims, so any bucket can be
//     inspected and disputed claim by claim.
//
//  2. The KEYWORD TABLE, as the fallback for a claim not tagged yet (the
//     minutes between a claim being checked and the tagger's next pass, or
//     the tagger being down).
//
// Why not keywords alone: they were written against the first 166 claims and
// went stale as new subjects appeared. By late September over half of each
// week's claims matched nothing ("25,000,000 come in under Biden" is
// immigration; "we should be at 1%, not 4%" is the Fed), and the newest
// broadcasts — exactly where an emerging trend would show first — were the
// ones the chart understood least.
//
// Keyword order matters — the first match wins, so every claim is counted
// exactly once and topic totals sum to the claim total.

import { normalizeQuote } from "./align";

/** The closed list a tag must come from. Order is display order for any
 *  list that isn't sorted by size. */
export const TOPICS = [
  "Jobs & employment", "Wages & income", "Inflation & prices", "Interest rates & the Fed",
  "Economy (general)", "Stock market", "Taxes", "Debt & spending", "Fraud & waste",
  "Trade & tariffs", "Manufacturing", "Investment", "Energy", "Housing",
  "Health & benefits", "Drug prices", "Immigration", "Crime & policing", "Education",
  "Defense & military", "War & foreign affairs", "Elections", "Other",
] as const;
export type Topic = typeof TOPICS[number];

const overrides = new Map<string, string>();
/** Install stored tags (normalised quote → topic). Called by loadTopicTags. */
export function setTopicOverrides(tags: Record<string, string>): void {
  overrides.clear();
  for (const [k, v] of Object.entries(tags)) overrides.set(k, v);
}
export function storedTopic(quote: string): string | null {
  return overrides.get(normalizeQuote(quote)) ?? null;
}

export interface TopicRule { topic: string; pattern: RegExp }

export const TOPIC_RULES: TopicRule[] = [
  { topic: "Education", pattern: /education|school|student|teacher|charter|edflex|read or do math|\bk 12\b|classroom|educational freedom/i },
  { topic: "Fraud & waste", pattern: /fraud|stole|stealing|phantom|scheme|waste,? (?:and )?abuse|kickback/i },
  { topic: "Crime & policing", pattern: /crime|homicid|murder|shooting|violent|gang|carjack|robbery|police|law enforcement|fugitive|criminal|prosecut|safest|overdose|fentanyl|drug (?:dealing|traffick)|drugs coming/i },
  { topic: "Immigration", pattern: /immigra|border|migrant|illegal alien|deport|asylum|people (?:to )?come in|come in under|pour(?:ed|ing)? into|unvetted|unchecked|25,?0{3,}(?:,0{3})* people|25 million people|foreign.born/i },
  { topic: "Interest rates & the Fed", pattern: /interest rate|\bthe fed\b|federal reserve|powell|rate cut|should be at 1%|point in interest/i },
  { topic: "Trade & tariffs", pattern: /tariff|trade|export|import|we (?:lose|lost) (?:with|the|anywhere)|trading with|car industry|frontage|dumping|business with us/i },
  { topic: "Defense & military", pattern: /south korea|for protection|\bnato\b|pay(?:ing)? (?:close to )?\$?[\d,]+ (?:a|per) year for|recruit|military|navy|barracks|service ?members|soldiers? (?:over there|guarding)/i },
  { topic: "War & foreign affairs", pattern: /soldier|ukrain|russia|\bwar\b|troop|missile|\biran\b|hamas|israel|gaza|hostage|strait of hormuz|stopped eight|\bun\b budget|regime/i },
  { topic: "Stock market", pattern: /stock market|\bdow\b|s&p|nasdaq|record highs?|all time (?:record )?high|401 ?\(?k|four zero one k/i },
  { topic: "Drug prices", pattern: /ozempic|trump rx|medication|for a pill|prescription|drug price|drug cost|big pharma/i },
  { topic: "Health & benefits", pattern: /health|medicaid|medicare|obamacare|\baca\b|insurance|autism|vaccine|whole milk|newborn|withdrawal cap|rural hospital/i },
  { topic: "Jobs & employment", pattern: /\bjobs?\b|employment|unemploy|hiring|payroll|workforce|laid off|layoff|(?:more )?(?:americans|people) working/i },
  { topic: "Wages & income", pattern: /wage|salary|salaries|paycheck|income|earnings|take.home|poverty/i },
  { topic: "Housing", pattern: /housing|home price|mortgage|\brent\b|rents|median price home|cost of a home|homebuyer/i },
  { topic: "Inflation & prices", pattern: /inflation|price|grocer|cost of living|\bcpi\b|\bgas\b|\begg|afford/i },
  { topic: "Manufacturing", pattern: /manufactur|factory|factories|\bplant\b|machine tool|metal cutting|industrial|steel/i },
  { topic: "Taxes", pattern: /\btax|no tax on|irs\b|trump account/i },
  { topic: "Investment", pattern: /invest|capital|put up a tremendous/i },
  { topic: "Energy", pattern: /energy|\boil\b|drill|gasoline|electric|pipeline|coal|liquid gold|barrel|producing.*power/i },
  { topic: "Debt & spending", pattern: /spending|budget|deficit|\bdebt\b|appropriat|we spend|funding|\bdei\b|monuments/i },
  { topic: "Elections", pattern: /election|\bvote[ds]?\b|ballot|\bpoll\b|approval rating|landslide|endorse|super pac/i },
  { topic: "Economy (general)", pattern: /econom|\bgdp\b|recession|growth|inherited the worst|small business/i },
];

/** The bucket for claims no rule matches. Named so it can never be confused
 *  with a real topic in a chart legend. */
export const UNCLASSIFIED = "Other";

export function topicOf(quote: string): string {
  const tagged = storedTopic(quote);
  if (tagged) return tagged;
  for (const r of TOPIC_RULES) if (r.pattern.test(quote)) return r.topic;
  return UNCLASSIFIED;
}

export interface TopicTally {
  topic: string;
  total: number;
  /** TRUE + MOSTLY TRUE. */
  accurate: number;
  misleading: number;
  false: number;
  /** Projections and claims we could not settle. Excluded from `rate`,
   *  because "we couldn't check it" is not evidence of falsehood. */
  unscored: number;
  /** Share of SCORED claims that were false or misleading, 0..1.
   *  Null when nothing in this topic was scored. */
  rate: number | null;
  /** Only set on a folded tail row: the topics it absorbed. The tail's own
   *  label is a synthetic count, so this is what lets a caller ask for its
   *  claims without having to re-derive which subjects fell below the cut. */
  members?: string[];
}

export interface TopicClaim { quote: string; rating: string }

/**
 * Tally claims by topic, most claims first.
 *
 * `Other` is always sorted last regardless of size — it is an admission that
 * the rules missed something, not a finding, and letting it head the chart
 * would misrepresent it as the leading subject.
 */
export function tallyTopics(claims: TopicClaim[], limit?: number): TopicTally[] {
  const acc = new Map<string, TopicTally>();
  for (const c of claims) {
    if (!c.quote) continue;
    const topic = topicOf(c.quote);
    let t = acc.get(topic);
    if (!t) {
      t = { topic, total: 0, accurate: 0, misleading: 0, false: 0, unscored: 0, rate: null };
      acc.set(topic, t);
    }
    t.total++;
    switch ((c.rating || "").toUpperCase()) {
      case "TRUE": case "MOSTLY TRUE": t.accurate++; break;
      case "MISLEADING": t.misleading++; break;
      case "FALSE": t.false++; break;
      default: t.unscored++;
    }
  }
  const out = [...acc.values()];
  for (const t of out) {
    const scored = t.accurate + t.misleading + t.false;
    t.rate = scored > 0 ? (t.misleading + t.false) / scored : null;
  }
  out.sort((a, b) => {
    if (a.topic === UNCLASSIFIED) return 1;
    if (b.topic === UNCLASSIFIED) return -1;
    return b.total - a.total || a.topic.localeCompare(b.topic);
  });
  return limit ? out.slice(0, limit) : out;
}

/**
 * Tally into `limit` bars plus one row absorbing everything else.
 *
 * A plain top-N slice quietly drops claims: at ten bars the chart accounted
 * for 119 of 166 claims while its header said 166, and Immigration — every one
 * of its claims rated false — fell off the bottom because only six people-hours
 * of speech touched it. Truncation is fine; truncation that breaks the
 * arithmetic under a total is not.
 *
 * The tail folds small subjects together with unclassified claims. They are
 * different things, but neither belongs in a named bar, and the alternative is
 * a second remainder row explaining a distinction the chart cannot show.
 */
export function tallyWithTail(
  claims: TopicClaim[], limit: number
): { topics: TopicTally[]; tail: TopicTally | null } {
  const all = tallyTopics(claims);
  if (all.length <= limit) return { topics: all, tail: null };

  const topics = all.slice(0, limit);
  const rest = all.slice(limit);
  const tail: TopicTally = {
    topic: `${rest.length} smaller subjects`,
    total: 0, accurate: 0, misleading: 0, false: 0, unscored: 0, rate: null,
    members: rest.map(t => t.topic),
  };
  for (const t of rest) {
    tail.total += t.total; tail.accurate += t.accurate;
    tail.misleading += t.misleading; tail.false += t.false; tail.unscored += t.unscored;
  }
  const scored = tail.accurate + tail.misleading + tail.false;
  tail.rate = scored > 0 ? (tail.misleading + tail.false) / scored : null;
  return { topics, tail };
}
