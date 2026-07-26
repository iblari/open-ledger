/**
 * Promise extraction — the AI half of the Promise Tracker.
 *
 * Mirrors lib/fact-check.ts in discipline: one prompt, one call site, and the
 * model may only capture WORDING + STRUCTURE. It never assigns a verdict;
 * lib/promises.ts resolveStatus() does that deterministically once data
 * exists. Anything the model can't structure is stored as unresolvable with
 * its reason, so the archive stays honest instead of silently dropping
 * vague commitments.
 */

import type { PromiseRecord } from "./promises";

const MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/** Metrics we can actually resolve against (benchmark dataset keys). */
export const RESOLVABLE_METRICS = [
  "unemployment", "jobs", "inflation", "gdp_growth", "real_gdp", "gas",
  "mfg", "lfpr", "fed_rate", "debt_gdp", "wages", "trade", "sp500", "claims",
] as const;

export function promiseSystemPrompt(): string {
  return `You extract POLITICAL PROMISES from transcripts for Vote Unbiased, a nonpartisan accountability archive.

A PROMISE is a forward-looking commitment about something measurable: "we will create 10 million jobs", "I'll cut the deficit in half", "gas will be under $2 a gallon", "we will bring inflation down to 2%".

NOT promises (ignore): claims about the past or present ("unemployment IS 4%"), opinions, values statements, vague aspirations without a number or clear direction ("make America strong again"), and other people's plans.

For each promise, return JSON with:
- quote: the speaker's exact words, trimmed to the commitment itself
- speaker: who said it, if identifiable from context, else null
- metricKey: ONE of [${RESOLVABLE_METRICS.join(", ")}] if the promise maps to it, else null
- direction: "increase" | "decrease" | "level"
- targetValue: the number promised, in the metric's natural unit (jobs in MILLIONS, unemployment/inflation in PERCENT, gas in DOLLARS). null if no number is stated.
- kind: "cumulative_change" (create/add/cut BY an amount) | "level" (reach/stay above-or-below a value) | "ratio"
- deadlineHint: ISO date if a timeframe is stated ("by 2028", "in my first year"), else null
- confidence: 0-100 that this is a genuine quantified promise
- unresolvableReason: if metricKey or targetValue is null, one short sentence on what makes it unmeasurable as stated; else null

RULES:
- Nonpartisan: identical treatment regardless of speaker or party.
- Do NOT judge whether the promise was kept — you only record what was promised.
- "Cut X in half" → kind cumulative_change, targetValue = half the value at the time IF the speaker states it; otherwise targetValue null with a reason.
- Prefer capturing a vague promise as unresolvable over discarding it — the archive shows what was promised even when it can't be scored.
- Return an empty array if the passage contains no promises.

Respond ONLY with valid JSON (no markdown fences):
{"promises":[{"quote":"...","speaker":"...","metricKey":"jobs","direction":"increase","targetValue":10,"kind":"cumulative_change","deadlineHint":"2028-01-20","confidence":85,"unresolvableReason":null}]}`;
}

interface RawPromise {
  quote: string; speaker: string | null; metricKey: string | null;
  direction: "increase" | "decrease" | "level"; targetValue: number | null;
  kind: "cumulative_change" | "level" | "ratio";
  deadlineHint: string | null; confidence: number; unresolvableReason: string | null;
}

export async function extractPromises(
  text: string,
  ctx: { speaker: string; admin: string | null; spokenAt: string; sourceTitle: string; sourceUrl: string | null; videoTime?: number | null; defaultDeadline: string | null }
): Promise<PromiseRecord[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 2000, temperature: 0,
      system: promiseSystemPrompt(),
      messages: [{ role: "user", content: `Speaker: ${ctx.speaker}\nDate: ${ctx.spokenAt}\nTranscript passage:\n"""${text}"""` }],
    }),
  });
  if (!resp.ok) throw new Error(`anthropic ${resp.status}`);
  const data = await resp.json();
  const out: string = data?.content?.[0]?.text ?? "";
  const start = out.indexOf("{"), end = out.lastIndexOf("}");
  if (start < 0 || end < 0) return [];
  let parsed: { promises?: RawPromise[] };
  try { parsed = JSON.parse(out.slice(start, end + 1)); } catch { return []; }

  return (parsed.promises || [])
    .filter(p => p?.quote && p.confidence >= 55)
    .map((p, i) => ({
      id: `promise-${ctx.spokenAt.slice(0, 10)}-${i}-${p.quote.slice(0, 20).replace(/\W+/g, "").toLowerCase()}`,
      quote: p.quote.trim(),
      speaker: p.speaker || ctx.speaker,
      admin: ctx.admin,
      spokenAt: ctx.spokenAt,
      sourceTitle: ctx.sourceTitle,
      sourceUrl: ctx.sourceUrl,
      videoTime: ctx.videoTime ?? null,
      target: {
        metricKey: (RESOLVABLE_METRICS as readonly string[]).includes(p.metricKey || "") ? p.metricKey : null,
        direction: p.direction || "level",
        targetValue: typeof p.targetValue === "number" ? p.targetValue : null,
        kind: p.kind || "level",
        deadline: p.deadlineHint || ctx.defaultDeadline,
      },
      extractionConfidence: p.confidence,
      unresolvableReason: p.unresolvableReason || undefined,
    }));
}
