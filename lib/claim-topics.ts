// What a claim is about.
//
// Deliberately a keyword table rather than a model call. Topic assignment
// drives a public chart, so it has to be reproducible and inspectable: anyone
// can read these patterns and see why a claim landed where it did, and the
// same claim always lands in the same place. A model would classify better at
// the margins and be impossible to defend when someone disputes a bucket.
//
// Order matters — the first match wins, so every claim is counted exactly
// once and the topic totals sum to the claim total. Specific topics come
// before general ones: "school funding" is education, not spending, and a
// homicide statistic is crime, not "other".

export interface TopicRule { topic: string; pattern: RegExp }

export const TOPIC_RULES: TopicRule[] = [
  { topic: "Education", pattern: /education|school|student|teacher|charter|edflex|read or do math|\bk 12\b|classroom|educational freedom/i },
  { topic: "Crime & policing", pattern: /crime|homicid|murder|shooting|violent|gang|carjack|robbery|police|law enforcement|fugitive|criminal|prosecut|safest|overdose|drug (?:dealing|traffick)/i },
  { topic: "Immigration", pattern: /immigra|border|migrant|illegal alien|deport|asylum|people (?:to )?come in|pour(?:ed)? into|unvetted|unchecked|25,?0{3,}(?:,0{3})* people|25 million people/i },
  { topic: "Trade & tariffs", pattern: /tariff|trade|export|import|we (?:lose|lost) (?:with|the|anywhere)|trading with|car industry|frontage|dumping|business with us/i },
  { topic: "Defense & allies", pattern: /south korea|for protection|\bnato\b|pay(?:ing)? (?:close to )?\$?[\d,]+ (?:a|per) year for/i },
  { topic: "War & foreign", pattern: /soldier|ukrain|russia|\bwar\b|troop|missile|\biran\b|hamas|israel|strait of hormuz|stopped eight/i },
  { topic: "Military recruiting", pattern: /recruit/i },
  { topic: "Stock market", pattern: /stock market|\bdow\b|s&p|nasdaq|record highs?|all time (?:record )?high/i },
  { topic: "Drug prices", pattern: /ozempic|trump rx|medication|for a pill|prescription|drug price/i },
  { topic: "Health & benefits", pattern: /health|medicaid|medicare|insurance|autism|vaccine|whole milk|newborn|withdrawal cap/i },
  { topic: "Jobs & employment", pattern: /\bjobs?\b|employment|unemploy|hiring|payroll|workforce|laid off|layoff|(?:more )?(?:americans|people) working/i },
  { topic: "Wages & income", pattern: /wage|salary|salaries|paycheck|income|earnings|take.home/i },
  { topic: "Inflation & prices", pattern: /inflation|price|grocer|cost of living|\bcpi\b|\bgas\b|\begg|afford|rents? (?:are )?fall/i },
  { topic: "Manufacturing", pattern: /manufactur|factory|factories|\bplant\b|machine tool|metal cutting|industrial|steel/i },
  { topic: "Investment", pattern: /invest|capital|super pac|put up a tremendous/i },
  { topic: "Energy", pattern: /energy|\boil\b|drill|gasoline|electric|pipeline|coal|liquid gold|barrel|producing.*power/i },
  { topic: "Housing", pattern: /housing|home price|mortgage|\brent\b|median price home/i },
  { topic: "Debt & spending", pattern: /\btax|spending|budget|deficit|\bdebt\b|appropriat|waste|fraud|interest in this country|we spend|funding|\bdei\b|monuments/i },
  { topic: "Elections", pattern: /election|\bvote\b|ballot|\bpoll\b|approval rating|landslide/i },
  { topic: "Economy (general)", pattern: /econom|\bgdp\b|recession|growth|inherited the worst/i },
];

/** The bucket for claims no rule matches. Named so it can never be confused
 *  with a real topic in a chart legend. */
export const UNCLASSIFIED = "Other";

export function topicOf(quote: string): string {
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
  };
  for (const t of rest) {
    tail.total += t.total; tail.accurate += t.accurate;
    tail.misleading += t.misleading; tail.false += t.false; tail.unscored += t.unscored;
  }
  const scored = tail.accurate + tail.misleading + tail.false;
  tail.rate = scored > 0 ? (tail.misleading + tail.false) / scored : null;
  return { topics, tail };
}
