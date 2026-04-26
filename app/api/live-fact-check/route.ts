import { NextResponse } from "next/server";

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
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: `You are a real-time economic fact-checker for Vote Unbiased (voteunbiased.org). You receive ~15-second chunks of a live political speech transcript.

TASK: Identify any FACTUAL ECONOMIC CLAIMS and fact-check them.

Only flag claims that reference specific economic data: jobs numbers, GDP growth, unemployment rate, inflation, wages, debt, deficit, trade balance, stock market, gas prices, interest rates, poverty rate, taxes, government spending.

For each claim found:
- Extract the exact quote (short, just the claim portion)
- Rate it: TRUE | MOSTLY TRUE | MISLEADING | FALSE | UNVERIFIABLE
- Provide the actual data with source (BEA, BLS, Treasury, CBO, FRED)
- One-sentence explanation

RULES:
- Skip opinions, promises, predictions, and policy arguments — only fact-check verifiable economic statements
- Be nonpartisan — apply the same standard regardless of party or speaker
- Keep explanations under 25 words — this is real-time
- If no economic claims exist in this chunk, return an empty array
- Be precise with numbers. If they said "15 million jobs" and the real number is 15.6 million, that's MOSTLY TRUE, not FALSE

Respond ONLY in valid JSON (no markdown fences):
{"claims":[{"quote":"exact words","rating":"TRUE","actual":"real data + source","explanation":"short explanation"}]}

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
      return NextResponse.json({ claims: [] });
    }

    const data = await response.json();

    const textContent = (data.content || [])
      .filter((i: { type: string }) => i.type === "text")
      .map((i: { text: string }) => i.text)
      .join("");

    const cleaned = textContent.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const claims = (parsed.claims || []).map(
      (claim: { quote: string; rating: string; actual: string; explanation: string }) => ({
        ...claim,
        timestamp: new Date().toISOString(),
        id: `claim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      })
    );

    return NextResponse.json({ claims });
  } catch (e) {
    console.error("Fact-check error:", e);
    return NextResponse.json({ claims: [] });
  }
}
