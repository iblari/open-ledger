/**
 * Tier-3 verification — search the live web when our own data can't settle a claim.
 *
 * THE THREE TIERS
 *   1. lib/live-verify.ts   deterministic lookup against our own metric series.
 *                           Free, instant, authoritative — but only 6 anchored
 *                           metrics at annual granularity.
 *   2. lib/fact-check.ts    Claude's own knowledge at extraction time.
 *   3. THIS FILE            when the first two leave a claim UNVERIFIABLE, go
 *                           search primary sources and come back with a verdict
 *                           plus real citations.
 *
 * "UNVERIFIABLE" should mean "no source on earth settles this as stated" —
 * not "wasn't in our table". Officials talk about drug prices, tariff revenue,
 * program budgets and agency headcounts; none of those live in a FRED series,
 * but nearly all are published somewhere official.
 *
 * Guardrails:
 *  - Citations are mandatory. A verdict with no source stays UNVERIFIABLE.
 *  - The model is told to prefer primary/official sources and to say so.
 *  - Bounded: max searches per claim, max claims per chunk, hard timeout.
 *    A slow search must never stall the live transcript.
 */

import { quoteContainment } from "@/lib/claim-utils";

const MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export interface ClaimSource { title: string; url: string }

export interface WebVerdict {
  rating: string;
  confidence: number;
  actual: string;
  explanation: string;
  sources: ClaimSource[];
  searched: true;
  /** At least one source is a dataset/audit/filing published separately from
   *  the claim — as opposed to coverage of the claim being made. */
  independent: boolean;
}

const SYSTEM = `You are the research desk for Vote Unbiased, a nonpartisan live fact-checking service. You receive ONE claim our internal datasets could not settle. Search the web and reach a verdict.

SOURCE PRIORITY — always prefer, in this order:
1. The primary agency that publishes the number (BLS, BEA, Census, Treasury, CBO, GAO, CMS, FDA, EIA, Federal Reserve, DoD comptroller, FBI UCR, CDC, state agencies)
2. Official press releases, budget documents, regulatory filings
3. Established data organisations (KFF, Peterson Foundation, Tax Foundation, OECD, IMF, World Bank)
4. Major news outlets ONLY for events/announcements, never as the source of a statistic

DECISION PROCEDURE — work down this ladder and STOP at the first that fits.
Do not skip to the bottom because a claim feels hard. Most claims are settled
by step 1 or 2.

1. Does a source give the actual figure?           -> TRUE / MOSTLY TRUE / MISLEADING / FALSE
2. Is the claim about the FUTURE ("we will have",
   "by next year", "is going to")?                 -> PROJECTION
3. Do the ONLY sources trace back to this same
   speaker or administration announcing it, with
   no independent audit or published dataset?      -> UNCONFIRMED
4. Genuinely nothing addresses it, or it is too
   vague to pin down                               -> UNVERIFIABLE

RATINGS
- TRUE: sources confirm the figure within normal rounding
- MOSTLY TRUE: directionally right, but imprecise, cherry-picked, or from a favourable time slice
- MISLEADING: technically defensible but the framing distorts it (wrong baseline, missing context, a target quoted as an achievement, a projection stated as fact)
- FALSE: sources contradict the figure materially
- PROJECTION: a forecast or target about the future. Not checkable today. State the CURRENT figure so viewers can judge the gap: "7 million families enrolled as of July 2026; 70 million is the stated goal."
- UNCONFIRMED: an official announcement no independent source has verified. State who announced it, when, and what would confirm it: "Announced by VP Vance, 31 Jul 2026. No GAO or IG audit published."
- UNVERIFIABLE: last resort only. Say precisely what would be needed to settle it.

CRITICAL — A SOURCE THAT MERELY REPEATS THE CLAIM IS NOT EVIDENCE.
News coverage of a speech, a transcript, or a post quoting the speaker proves
only that the words were SAID. It never proves they are TRUE. If every source
you find is coverage of this same statement, the answer is UNCONFIRMED, never
TRUE. Independent confirmation means a dataset, audit or filing published
separately from the announcement.

A TARGET IS NOT AN ACHIEVEMENT. If the speaker states a goal in the past or
present tense ("we have 70 million families") while sources show a smaller
actual figure, that is MISLEADING, not PROJECTION — the tense misrepresents
a goal as a result.

RULES
- Nonpartisan. Identical scrutiny regardless of speaker or party.
- Never state a number you did not find in a source.
- Judge the NUMBER, never the politics or the motive.
- "explanation" must be under 30 words — this renders on a live card.
- "actual" states what the sources say, WITH the publishing body and period, e.g. "CMS lists Ozempic's 2025 list price at $997/month."
- If credible sources genuinely disagree, rate MISLEADING and say both figures.

Respond ONLY with valid JSON, no markdown fences:
{"rating":"TRUE","confidence":85,"actual":"...","explanation":"...","independent":true,"sources":[{"title":"BLS Employment Situation, May 2026","url":"https://..."}]}

"independent" is your own honest assessment: true only if at least one source
is a dataset, audit or filing published separately from the claim itself.`;

/** Extract every cited URL from the response content blocks. */
interface ContentBlock {
  type: string;
  text?: string;
  citations?: { url?: string; title?: string }[];
}
function collectSources(content: ContentBlock[]): ClaimSource[] {
  const seen = new Map<string, string>();
  for (const block of content) {
    for (const c of block.citations || []) {
      if (c.url && !seen.has(c.url)) seen.set(c.url, c.title || new URL(c.url).hostname);
    }
    if (block.type === "web_search_tool_result" && Array.isArray((block as unknown as { content?: { url?: string; title?: string }[] }).content)) {
      for (const r of (block as unknown as { content: { url?: string; title?: string }[] }).content) {
        if (r.url && !seen.has(r.url)) seen.set(r.url, r.title || new URL(r.url).hostname);
      }
    }
  }
  return [...seen.entries()].map(([url, title]) => ({ url, title })).slice(0, 6);
}

/**
 * Domains that only ever carry coverage OF a statement, never the underlying
 * data. A hit here can establish that something was said; it can never
 * establish that it is true.
 */
const ECHO_DOMAIN_RE = /(^|\.)(x\.com|twitter\.com|t\.co|truthsocial\.com|facebook\.com|instagram\.com|youtube\.com|rumble\.com)$/i;

/** Bodies that publish measurements rather than announcements. */
const STAT_AGENCY_RE = /(^|\.)(bls|bea|census|gao|cbo|treasury|federalreserve|cms|cdc|fbi|eia|usaspending|ssa|irs|oecd|imf|worldbank)\.gov$|(^|\.)(aspe\.hhs\.gov|data\.cdc\.gov|fred\.stlouisfed\.org|oecd\.org|imf\.org|worldbank\.org|kff\.org)$/i;

/**
 * Headlines that report someone SAYING something, rather than reporting a
 * measured quantity. "JD Vance: Anti-Fraud Task Force Has Halted $56 Billion"
 * shares almost no wording with the spoken claim, so overlap scoring misses
 * it — but the structure is unmistakable, and a dataset never needs to name
 * who said it.
 */
const ATTRIBUTION_VERB_RE =
  /\b(says?|said|saying|claims?|claimed|announces?|announced|announcing|reveals?|revealed|touts?|touted|told|tells?|insists?|asserts?|according to|remarks|press briefing|fact sheet|full transcript)\b/i;

/**
 * A speaker prefix: "JD Vance:", "Trump:", "Sec. Hegseth:".
 *
 * Deliberately case-SENSITIVE. The first version folded this into the
 * case-insensitive verb regex, where [A-Z] happily matched lowercase — so
 * "Dollars and Cents: Real Hourly Wage Growth", a Cleveland Fed research
 * paper, was read as an attribution and its data thrown away. Requiring every
 * word before the colon to be genuinely capitalised separates a name from a
 * title, because "and" in a headline is never capitalised.
 */
const SPEAKER_PREFIX_RE = /^[A-Z][A-Za-z.'\-]*(?:\s+[A-Z][A-Za-z.'\-]*){0,3}\s*:/;

function looksLikeAttribution(title: string): boolean {
  return SPEAKER_PREFIX_RE.test(title) || ATTRIBUTION_VERB_RE.test(title);
}

/**
 * Is this "source" just the claim coming back at us?
 *
 * The $75bn defence-investment claim was cited to a post whose title was the
 * speaker's own sentence, verbatim. That is circular: it proves the words
 * were SAID, not that they are TRUE. We detect it by measuring how much of
 * the claim is contained in the source's title, and by domain for platforms
 * that only ever host reposts.
 */
export function isEchoSource(quote: string, src: ClaimSource): boolean {
  let host = "";
  try { host = new URL(src.url).hostname; } catch { return false; }

  // Statistical agencies publish measurements, not announcements. They are
  // never an echo, even when a headline happens to quote the same figure.
  if (STAT_AGENCY_RE.test(host)) return false;

  if (ECHO_DOMAIN_RE.test(host)) return true;

  const title = src.title || "";
  // Attribution is the giveaway. "JD Vance: Task Force Has Halted $56 Billion"
  // shares few words with the spoken claim, so text overlap misses it — but
  // the headline structure says plainly that this is a report of someone
  // SPEAKING. A dataset never needs to name who said it.
  if (looksLikeAttribution(title)) return true;

  // A headline that reproduces the claim almost word-for-word is coverage of
  // the utterance, not an independent measurement of the quantity.
  return quoteContainment(quote, title) >= 0.8;
}

/**
 * Verify one claim against the live web. Returns null when the search
 * produced nothing usable — callers keep the existing rating in that case.
 */
export async function verifyClaimOnWeb(
  claim: { quote: string; actual?: string; explanation?: string },
  opts: { timeoutMs?: number; maxSearches?: number; context?: string } = {}
): Promise<WebVerdict | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const { timeoutMs = 25_000, maxSearches = 3, context = "" } = opts;

  try {
    const resp = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        temperature: 0,
        system: SYSTEM,
        tools: [{
          type: "web_search_20250305",
          name: "web_search",
          max_uses: maxSearches,
          // Haiku doesn't do programmatic tool calling — call search directly.
          allowed_callers: ["direct"],
        }],
        messages: [{
          role: "user",
          content: [
            `Claim to verify (spoken by a US official on live broadcast):\n"""${claim.quote}"""`,
            context ? `\nSurrounding transcript — use it to identify WHO or WHAT the claim is about (which country, agency, program or time period). A quote like "they got 180% inflation" may be about a foreign country:\n"""${context.slice(0, 1200)}"""` : "",
            claim.actual ? `\nPrior note: ${claim.actual}` : "",
            `\nSearch for the authoritative figure FOR THE SUBJECT THE SPEAKER MEANT — if the claim is about another country, find that country's statistics, not America's. Return the JSON verdict.`,
          ].join("\n"),
        }],
      }),
    });
    if (!resp.ok) {
      console.error(`[web-verify] anthropic ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    const blocks: ContentBlock[] = data?.content ?? [];
    const text = blocks.filter(b => b.type === "text").map(b => b.text || "").join("\n");
    const start = text.indexOf("{"), end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;

    let parsed: Partial<WebVerdict> & { sources?: ClaimSource[] };
    try { parsed = JSON.parse(text.slice(start, end + 1)); } catch { return null; }
    if (!parsed.rating || !parsed.actual) return null;

    // Merge model-declared sources with the API's own citation records; the
    // citations are ground truth for "did it actually read this page".
    const cited = collectSources(blocks);
    const declared = (parsed.sources || []).filter(s => s?.url?.startsWith("http"));
    const merged = [...cited];
    for (const d of declared) if (!merged.some(m => m.url === d.url)) merged.push(d);

    // No citations → no verdict. Prevents an unsourced upgrade.
    if (merged.length === 0) return null;

    // ── Circular-evidence guard ──────────────────────────────────────
    // A claim "confirmed" only by coverage of the speech that made it is
    // not confirmed at all. If nothing independent survives the filter, the
    // strongest honest verdict is UNCONFIRMED — which tells the viewer who
    // said it and what would settle it, rather than asserting it as fact.
    let rating = String(parsed.rating).toUpperCase();
    const independentSources = merged.filter(m => !isEchoSource(claim.quote, m));
    const modelSaysIndependent = (parsed as { independent?: boolean }).independent !== false;
    if (independentSources.length === 0 || !modelSaysIndependent) {
      if (rating === "TRUE" || rating === "MOSTLY TRUE") rating = "UNCONFIRMED";
    }

    return {
      rating,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 60,
      independent: independentSources.length > 0 && modelSaysIndependent,
      actual: String(parsed.actual),
      explanation: String(parsed.explanation || "").slice(0, 240),
      sources: merged.slice(0, 6),
      searched: true,
    };
  } catch (e) {
    console.error("[web-verify] failed:", (e as Error).message);
    return null;
  }
}

/**
 * Upgrade a batch of claims, bounded so live coverage never stalls.
 *
 * `max` was 3, which quietly meant the 4th and later unverifiable claims in a
 * busy chunk were never searched AT ALL — they kept a tier-2 rating and shipped
 * with no sources, which is exactly how two murder-rate claims reached the
 * archive citing nothing. Raised to 8, run in parallel, so a dense passage
 * still clears. The per-claim 25s timeout remains the real stall guard.
 */
export async function upgradeUnverifiable<T extends { rating: string; quote: string; actual?: string }>(
  claims: T[],
  max = 8,
  context = ""
): Promise<T[]> {
  const targets = claims.filter(c => c.rating === "UNVERIFIABLE").slice(0, max);
  if (!targets.length) return claims;
  await Promise.all(targets.map(async (c) => {
    const v = await verifyClaimOnWeb(c, { context });
    if (!v) return;
    Object.assign(c, {
      rating: v.rating,
      confidence: v.confidence,
      actual: v.actual,
      explanation: v.explanation || (c as { explanation?: string }).explanation,
      sources: v.sources,
      webVerified: true,
      independent: v.independent,
    });
  }));
  return claims;
}
