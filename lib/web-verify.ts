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
}

const SYSTEM = `You are the research desk for Vote Unbiased, a nonpartisan live fact-checking service. You receive ONE claim that our internal datasets could not settle. Search the web and reach a verdict.

SOURCE PRIORITY — always prefer, in this order:
1. The primary agency that publishes the number (BLS, BEA, Census, Treasury, CBO, GAO, CMS, FDA, EIA, Federal Reserve, DoD comptroller, state agencies)
2. Official press releases, budget documents, regulatory filings
3. Established data organizations (KFF, Peterson Foundation, Tax Foundation, OECD, IMF, World Bank)
4. Major news outlets ONLY for events/announcements, never as the source of a statistic

RATINGS
- TRUE: sources confirm the figure within normal rounding
- MOSTLY TRUE: directionally right, but the number is imprecise, cherry-picked or from a favourable time slice
- MISLEADING: the number is technically defensible but the framing distorts it (wrong baseline, missing context, misattributed cause)
- FALSE: sources contradict the figure materially
- UNVERIFIABLE: use ONLY if no credible source addresses it, or the claim is too vague to pin down. Say precisely what would be needed to settle it.

RULES
- Nonpartisan. Identical scrutiny regardless of speaker or party.
- Never state a number you did not find in a source.
- Judge the NUMBER, never the politics or the motive.
- "explanation" must be under 30 words — this renders on a live card.
- "actual" states what the sources say, WITH the publishing body and period, e.g. "CMS lists Ozempic's 2025 list price at $997/month."
- If sources disagree, say so and rate MISLEADING or UNVERIFIABLE rather than picking a side.

Respond ONLY with valid JSON, no markdown fences:
{"rating":"TRUE","confidence":85,"actual":"...","explanation":"...","sources":[{"title":"BLS Employment Situation, May 2026","url":"https://..."}]}`;

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
 * Verify one claim against the live web. Returns null when the search
 * produced nothing usable — callers keep the existing rating in that case.
 */
export async function verifyClaimOnWeb(
  claim: { quote: string; actual?: string; explanation?: string },
  opts: { timeoutMs?: number; maxSearches?: number } = {}
): Promise<WebVerdict | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const { timeoutMs = 25_000, maxSearches = 3 } = opts;

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
          content: `Claim to verify (spoken by a US official on live broadcast):\n"""${claim.quote}"""\n\nOur internal datasets could not settle this${claim.actual ? `. Prior note: ${claim.actual}` : ""}.\n\nSearch for the authoritative figure and return the JSON verdict.`,
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

    return {
      rating: String(parsed.rating).toUpperCase(),
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 60,
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

/** Upgrade a batch of claims, bounded so live coverage never stalls. */
export async function upgradeUnverifiable<T extends { rating: string; quote: string; actual?: string }>(
  claims: T[],
  max = 3
): Promise<T[]> {
  const targets = claims.filter(c => c.rating === "UNVERIFIABLE").slice(0, max);
  if (!targets.length) return claims;
  await Promise.all(targets.map(async (c) => {
    const v = await verifyClaimOnWeb(c);
    if (!v) return;
    Object.assign(c, {
      rating: v.rating,
      confidence: v.confidence,
      actual: v.actual,
      explanation: v.explanation || (c as { explanation?: string }).explanation,
      sources: v.sources,
      webVerified: true,
    });
  }));
  return claims;
}
