import { NextResponse } from "next/server";
import {
  appendLiveClaims,
  setLiveTranscript,
  type LiveClaim,
} from "@/lib/live-kv";
import { verifyClaim, metricAnchorPromptBlock, type RawClaim } from "@/lib/live-verify";

/**
 * POST /api/admin/ingest
 *
 * Receives transcript text from the local broadcast CLI script,
 * fact-checks it via Claude, and stores the results for live viewers.
 *
 * Body: { text: string, videoTime?: number }
 *   - text: ~15 seconds of transcript text
 *   - videoTime: seconds into the broadcast (for seeking)
 *
 * Protected by ADMIN_KEY.
 */
export async function POST(req: Request) {
  // Auth
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    return NextResponse.json(
      { error: "ADMIN_KEY not configured" },
      { status: 500 }
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${adminKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { text?: string; videoTime?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = (body.text || "").trim();
  const videoTime = body.videoTime || 0;

  if (!text || text.length < 20) {
    return NextResponse.json({ skipped: true, reason: "text too short" });
  }

  // Store transcript snippet for live display
  await setLiveTranscript(text);

  // Fact-check via Claude
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        system: `You are a real-time economic fact-checker for Vote Unbiased (voteunbiased.org). You receive ~15-second chunks of a live political speech or press conference transcript.

TASK: Identify any FACTUAL ECONOMIC CLAIMS and fact-check them.

Only flag claims that reference specific economic data: jobs numbers, GDP growth, unemployment rate, inflation, wages, debt, deficit, trade balance, stock market, gas prices, interest rates, poverty rate, taxes, government spending.

For each claim found, return JSON with these fields:
- quote (string): the exact words from the speech (short)
- rating (enum): TRUE | MOSTLY TRUE | MISLEADING | FALSE | UNVERIFIABLE
- confidence (0-100)
- actual (string): the real data with SPECIFIC dataset citation:
  - BLS: cite the series (e.g. "BLS CES, Total Nonfarm, seasonally adjusted")
  - BEA: cite the table (e.g. "BEA NIPA Table 1.1.1, Real GDP")
  - Treasury: cite the dataset (e.g. "Treasury Monthly Statement")
  - FRED: cite the series ID (e.g. "FRED series UNRATE")
  - CBO: cite the report (e.g. "CBO Budget Outlook, Feb 2025")
- explanation (string, under 30 words)

NEW STRUCTURED FIELDS (REQUIRED, set to null if not applicable):
- metricKey (string|null): one of the metric anchor keys below, OR null.
- year (integer|null): the calendar year the claim references; null if undeterminable.
- admin (string|null): one of "clinton", "bush", "obama", "trump1", "biden", "trump2" — the administration referenced; null if undeterminable.
- claimedValue (number|null): the numeric value the speaker claimed, in the metric's natural unit (percent as 4.2, not 0.042). Null if not extractable.

${metricAnchorPromptBlock()}

RULES:
- Skip opinions, promises, predictions, and policy arguments — only fact-check verifiable economic statements
- Be nonpartisan — apply the same standard regardless of party or speaker
- Keep explanations under 30 words
- If no economic claims exist in this chunk, return an empty array
- Be precise with numbers
- Include the specific time period of data you're referencing
- ALWAYS try to assign metricKey + year + admin + claimedValue when the claim references one of the anchored metrics — the server re-verifies against ground-truth data

Respond ONLY in valid JSON (no markdown fences):
{"claims":[{"quote":"exact words","rating":"TRUE","confidence":85,"actual":"data with dataset citation","explanation":"short explanation","metricKey":"unemployment","year":2024,"admin":"biden","claimedValue":4.0}]}

No claims found: {"claims":[]}`,
        messages: [
          {
            role: "user",
            content: `Live broadcast transcript chunk (at ${Math.floor(videoTime / 60)}:${String(Math.floor(videoTime % 60)).padStart(2, "0")}):\n"${text}"`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[ingest] Claude API error:", response.status, err);
      return NextResponse.json(
        { error: `Claude API error ${response.status}` },
        { status: 200 }
      );
    }

    const data = await response.json();
    const textContent = (data.content || [])
      .filter((i: { type: string }) => i.type === "text")
      .map((i: { text: string }) => i.text)
      .join("");

    const cleaned = textContent.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (parsed.claims?.length > 0) {
      // Verify each claim against ground-truth metrics data before persisting.
      // verifyClaim() rewrites 'actual' and re-rates when the LLM identified
      // a metricKey + year that we have indexed in lib/metrics-data — this is
      // the moment the live broadcast becomes data-grounded instead of memory-grounded.
      const claims: LiveClaim[] = parsed.claims.map((raw: RawClaim) => {
        const verified = verifyClaim(raw);
        return {
          ...verified,
          videoTime,
          timestamp: new Date().toISOString(),
          id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        };
      });

      await appendLiveClaims(claims);
      console.log(
        `[ingest] ${claims.length} claims found at ${videoTime}s`
      );
      return NextResponse.json({ claims });
    }

    return NextResponse.json({ claims: [] });
  } catch (e) {
    console.error("[ingest] Error:", e);
    return NextResponse.json(
      { error: "Fact-check error", detail: e instanceof Error ? e.message : String(e) },
      { status: 200 }
    );
  }
}
