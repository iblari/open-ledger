// Server-side claim extraction — the single Claude call site for the live
// fact-check pipeline.
//
// Both /api/live-fact-check (client-driven caption videos) and
// /api/admin/ingest (Deepgram-driven live broadcasts) previously embedded
// their own copy of the system prompt and response parsing, and the two had
// already drifted apart. This module is now the only place the prompt, the
// model choice, and the parsing live. Any prompt improvement lands in both
// paths automatically.
//
// Pipeline per chunk:
//   1. likelyHasEconomicClaim() pre-filter (caller's job — cheap regex, no API)
//   2. Claude Haiku extracts claims + structured fields (metricKey/year/...)
//   3. verifyClaim() re-rates numeric claims against ground-truth metrics data
//   4. dedupeClaims() drops near-duplicate re-statements

import { verifyClaim, mentionsForeignSubject, metricAnchorPromptBlock, type RawClaim, type VerifiedClaim } from "./live-verify";
import { lookupBenchmark, formatBenchValue, rateAgainstBenchmark, benchAnchorPromptBlock } from "./benchmark-verify";

const MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/** One system prompt for every extraction path. */
export function factCheckSystemPrompt(): string {
  return `You are a real-time economic fact-checker for Vote Unbiased (voteunbiased.org). You receive ~15-second chunks of a live political speech or press conference transcript.

TASK: Identify any FACTUAL ECONOMIC CLAIMS and fact-check them.

Only flag claims that reference specific economic OR fiscal data. This includes:
- Macro: jobs numbers, GDP growth, unemployment, inflation, wages, trade balance, stock market, gas prices, interest rates, poverty
- Fiscal: debt, deficit, taxes, and ANY dollar figure attached to government spending — program costs, agency budgets, military/defense outlays, war costs, contracts, aid packages, subsidies
- Counts of people or things used as evidence: workers hired, units built, facilities opened, enrollees covered

A dollar figure spoken by an official about public money is ALWAYS a checkable claim, even when it is an estimate, a projection the speaker attributes to their own agency, or an answer to a senator's question. Rate an official's own unaudited estimate UNVERIFIABLE (not FALSE) and say which public source would settle it.

For each claim found, return JSON with these fields:
- quote (string): the exact words from the speech (short, just the claim portion)
- rating (enum): TRUE | MOSTLY TRUE | MISLEADING | FALSE | UNVERIFIABLE
- confidence (0-100): how confident you are in this rating
- actual (string): the real data with SPECIFIC dataset citation:
  - BLS: cite the series (e.g. "BLS CES, Total Nonfarm, seasonally adjusted" or "BLS CPI-U, All Items")
  - BEA: cite the table (e.g. "BEA NIPA Table 1.1.1, Real GDP")
  - Treasury: cite the dataset (e.g. "Treasury Monthly Statement, Oct 2024")
  - FRED: cite the series ID (e.g. "FRED series UNRATE" or "FRED series CPIAUCSL")
  - CBO: cite the report (e.g. "CBO Budget Outlook, Feb 2025")
- explanation (string, under 30 words): one-sentence explanation

GEOGRAPHIC SCOPE — CRITICAL:
Our internal datasets are UNITED STATES federal statistics only.
- STILL EXTRACT claims about other countries, foreign central banks, companies, states or cities — they are real, checkable factual claims and a later stage searches for the right country's data.
- But set metricKey to null for them, even when the topic (inflation, unemployment, GDP) matches one of our metric names. Checking "Iran's inflation is 180%" against US CPI would publish a false refutation citing the wrong country's statistics.
- Set metricKey ONLY when the claim is about the United States as a whole.

STRUCTURED FIELDS (REQUIRED, set to null if not applicable):
- metricKey (string|null): one of the metric anchor keys below, OR null if the claim doesn't map to any of them.
- year (integer|null): the calendar year the claim references. If the speaker says "today" / "now", use the current year. If they say "since I took office" use the year they took office. Null if the year cannot be determined.
- admin (string|null): one of "clinton", "bush", "obama", "trump1", "biden", "trump2", OR null. The administration the claim references. If the speaker says "under my administration" infer based on the current speaker.
- claimedValue (number|null): the numeric value the speaker claimed, if extractable. E.g. for "unemployment is 4.2 percent", claimedValue is 4.2. Use the natural unit of the metric (e.g. percent as 4.2 not 0.042; index points for S&P 500).

${metricAnchorPromptBlock()}

${benchAnchorPromptBlock()}

RULES:
- Skip pure opinions, promises and policy arguments — but DO extract any specific number presented as fact, including in Q&A exchanges and testimony
- Extract the number even when you cannot verify it. An UNVERIFIABLE card that names the figure, explains why no official series settles it, and points to the source that would, is valuable to the viewer — silence is not
- Be nonpartisan — apply the same standard regardless of party or speaker
- Keep explanations under 30 words — this is real-time
- If no economic claims exist in this chunk, return an empty array
- Be precise with numbers. If they said "15 million jobs" and the real number is 15.6 million, that's MOSTLY TRUE, not FALSE
- Include the specific time period of data you're referencing (e.g. "as of Jan 2025" or "FY2024")
- ALWAYS try to assign metricKey + year + admin + claimedValue when the claim references one of the anchored metrics — the server will re-verify against ground-truth data and rewrite "actual" if your numbers disagree

Respond ONLY in valid JSON (no markdown fences):
{"claims":[{"quote":"exact words","rating":"TRUE","confidence":85,"actual":"real data with specific dataset citation + time period","explanation":"short explanation","metricKey":"unemployment","year":2024,"admin":"biden","claimedValue":4.0}]}

No claims found: {"claims":[]}`;
}

export interface ExtractResult {
  claims: VerifiedClaim[];
  /** Human-readable error when the upstream call or parse failed. */
  error?: string;
  detail?: string;
}

/** Pull the first JSON object out of a model response. Handles markdown
 *  fences, leading prose ("Here is the JSON:"), and trailing junk — all
 *  failure modes JSON.parse(raw) used to throw on. */
function parseClaimsJson(raw: string): { claims?: RawClaim[] } | null {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  // Fast path
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  // Slice from first '{' to last '}' — tolerates surrounding prose.
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* fall through */ }
  }
  return null;
}

/**
 * Extract economic claims from a transcript chunk and verify them against
 * the ground-truth data layer. Returns verified claims WITHOUT ids/timestamps
 * — callers attach those (they differ between the live feed and demo paths).
 */
export async function extractAndVerifyClaims(
  userContent: string,
  origin = "https://voteunbiased.org"
): Promise<ExtractResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { claims: [], error: "ANTHROPIC_API_KEY not configured" };
  }

  let response: Response;
  try {
    response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        // Deterministic output: rating a factual claim is a classification
        // task; sampling temperature only adds verdict variance.
        temperature: 0,
        system: factCheckSystemPrompt(),
        messages: [{ role: "user", content: userContent }],
      }),
    });
  } catch (e) {
    return {
      claims: [],
      error: "Anthropic API unreachable",
      detail: e instanceof Error ? e.message : String(e),
    };
  }

  if (!response.ok) {
    const err = await response.text();
    console.error("[fact-check] Anthropic API error:", response.status, err);
    return {
      claims: [],
      error: `Anthropic API error ${response.status}`,
      detail: err.slice(0, 500),
    };
  }

  const data = await response.json();
  const textContent = (data.content || [])
    .filter((i: { type: string }) => i.type === "text")
    .map((i: { text: string }) => i.text)
    .join("");

  const parsed = parseClaimsJson(textContent);
  if (!parsed) {
    console.error("[fact-check] Unparseable model output:", textContent.slice(0, 300));
    return {
      claims: [],
      error: "Model returned unparseable output",
      detail: textContent.slice(0, 200),
    };
  }

  // Pass the transcript chunk so the geographic-scope gate can see context
  // the quote alone doesn't carry.
  const claims = (parsed.claims || []).map((raw: RawClaim) => verifyClaim(raw, userContent));

  // Tier 1b — the full benchmark dataset (14 metrics × 10 administrations ×
  // ~450 monthly points). Runs for anything the 6 annual anchors above
  // didn't already settle, so we exhaust the data we OWN before spending a
  // web search on it.
  await Promise.all(claims.map(async (c: VerifiedClaim) => {
    if (c.verifiedFromSource || !c.metricKey) return;
    if (mentionsForeignSubject(c.quote) || mentionsForeignSubject(userContent)) {
      c.metricKey = null; // US series only — foreign subject in quote or context
      return;
    }
    const hit = await lookupBenchmark(origin, c.metricKey, c.admin ?? null, c.year ?? null);
    if (!hit) return;
    const shown = formatBenchValue(hit.value, hit.unit);
    c.actual = `${shown} — ${hit.label} for ${hit.adminName} at month ${hit.monthOfTerm} of the term (~${hit.approxYear}), per FRED.`;
    c.verifiedFromSource = true;
    c.groundTruth = { value: hit.value, year: hit.approxYear, metricKey: c.metricKey, source: "FRED" };
    if (typeof c.claimedValue === "number") {
      c.rating = rateAgainstBenchmark(c.claimedValue, hit.value, hit.unit);
    } else if (c.rating === "UNVERIFIABLE") {
      // We hold the series but the speaker gave no number to compare — still
      // better than a blank: show the real figure and let the reader judge.
      c.rating = "UNVERIFIABLE";
      c.explanation = `${c.explanation || ""} Our data for this metric: ${shown}.`.trim();
    }
  }));

  return { claims };
}
