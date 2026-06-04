import { NextResponse } from "next/server";
import { verifyClaim, metricAnchorPromptBlock, type RawClaim } from "@/lib/live-verify";

export async function POST(req: Request) {
  let body: { text?: string; context?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = (body.text || "").trim();
  const context = (body.context || "").trim();

  if (!text || text.length < 30) {
    return NextResponse.json({ claims: [] });
  }

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
        // System prompt is split into the original instructions PLUS a metric-anchor
        // block generated from lib/metrics-data so the prompt and the verifier
        // can never drift apart (single source of truth for valid metricKey values).
        system: `You are a real-time economic fact-checker for Vote Unbiased (voteunbiased.org). You receive ~15-second chunks of a live political speech transcript.

TASK: Identify any FACTUAL ECONOMIC CLAIMS and fact-check them.

Only flag claims that reference specific economic data: jobs numbers, GDP growth, unemployment rate, inflation, wages, debt, deficit, trade balance, stock market, gas prices, interest rates, poverty rate, taxes, government spending.

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

NEW STRUCTURED FIELDS (REQUIRED, set to null if not applicable):
- metricKey (string|null): one of the metric anchor keys below, OR null if the claim doesn't map to any of them.
- year (integer|null): the calendar year the claim references. If the speaker says "today" / "now", use the current year. If they say "since I took office" use the year they took office. Null if the year cannot be determined.
- admin (string|null): one of "clinton", "bush", "obama", "trump1", "biden", "trump2", OR null. The administration the claim references. If the speaker says "under my administration" infer based on the current speaker.
- claimedValue (number|null): the numeric value the speaker claimed, if extractable. E.g. for "unemployment is 4.2 percent", claimedValue is 4.2. Use the natural unit of the metric (e.g. percent as 4.2 not 0.042; index points for S&P 500).

${metricAnchorPromptBlock()}

RULES:
- Skip opinions, promises, predictions, and policy arguments — only fact-check verifiable economic statements
- Be nonpartisan — apply the same standard regardless of party or speaker
- Keep explanations under 30 words — this is real-time
- If no economic claims exist in this chunk, return an empty array
- Be precise with numbers. If they said "15 million jobs" and the real number is 15.6 million, that's MOSTLY TRUE, not FALSE
- Include the specific time period of data you're referencing (e.g. "as of Jan 2025" or "FY2024")
- ALWAYS try to assign metricKey + year + admin + claimedValue when the claim references one of the anchored metrics — the server will re-verify against ground-truth data and rewrite "actual" if your numbers disagree

Respond ONLY in valid JSON (no markdown fences):
{"claims":[{"quote":"exact words","rating":"TRUE","confidence":85,"actual":"real data with specific dataset citation + time period","explanation":"short explanation","metricKey":"unemployment","year":2024,"admin":"biden","claimedValue":4.0}]}

No claims found: {"claims":[]}`,
        messages: [
          {
            role: "user",
            content: `Context from earlier in the speech:\n"${context || "Start of broadcast"}"\n\nNew transcript chunk:\n"${text}"`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic API error:", response.status, err);
      // Surface the upstream error to the frontend so it can show a real message
      // instead of pretending no claims were found.
      return NextResponse.json(
        {
          error: `Anthropic API error ${response.status}`,
          detail: err.slice(0, 500),
          claims: [],
        },
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

    // Verify each claim against ground-truth metrics data. If the LLM identified
    // a metricKey + year that we have indexed, lookupValue() returns the real
    // number and verifyClaim() rewrites "actual" and re-rates based on numeric
    // distance — eliminating the hallucination risk on the most common claim
    // types (unemployment, GDP growth, inflation, S&P, debt-to-GDP, median income).
    const claims = (parsed.claims || []).map((raw: RawClaim) => {
      const verified = verifyClaim(raw);
      return {
        ...verified,
        timestamp: new Date().toISOString(),
        id: `claim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      };
    });

    return NextResponse.json({ claims });
  } catch (e) {
    console.error("Fact-check error:", e);
    // Surface the error so the UI can show why nothing came back.
    return NextResponse.json(
      {
        error: "Fact-check route exception",
        detail: e instanceof Error ? e.message : String(e),
        claims: [],
      },
      { status: 200 }
    );
  }
}
