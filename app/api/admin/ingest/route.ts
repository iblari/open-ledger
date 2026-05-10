import { NextResponse } from "next/server";
import {
  appendLiveClaims,
  appendDebugTiming,
  setLiveTranscript,
  type LiveClaim,
} from "@/lib/live-kv";

/**
 * POST /api/admin/ingest
 *
 * Receives transcript text + word-level timestamps from the local broadcast
 * CLI script, fact-checks it via Claude, and stores the results for live viewers.
 *
 * Body: {
 *   text: string,
 *   videoTime?: number,           // chunk-level start (Deepgram seconds)
 *   chunkStartTime?: number,      // first word start
 *   chunkEndTime?: number,        // last word end
 *   words?: WordTiming[]          // per-word timestamps from Deepgram
 * }
 *
 * Protected by ADMIN_KEY.
 */

// ── Types ──────────────────────────────────────────────────────────

interface WordTiming {
  word: string;
  start: number;
  end: number;
  confidence: number;
  punctuated_word?: string;
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Given a quote from Claude's fact-check and the full word-level timing array,
 * find the best matching start time using sliding window fuzzy matching.
 *
 * Returns { videoTime, source, matchRate }
 */
function findQuoteStartTime(
  quote: string,
  words: WordTiming[],
  chunkStartTime: number
): { videoTime: number; source: "word_match" | "chunk_start"; matchRate: number } {
  if (!words || words.length === 0) {
    return { videoTime: chunkStartTime, source: "chunk_start", matchRate: 0 };
  }

  // Normalize quote into comparable tokens
  const quoteTokens = quote
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);

  if (quoteTokens.length === 0) {
    return { videoTime: chunkStartTime, source: "chunk_start", matchRate: 0 };
  }

  // Normalize word array tokens for comparison
  const wordTokens = words.map((w) =>
    w.word.toLowerCase().replace(/[^\w]/g, "")
  );

  let bestScore = 0;
  let bestIdx = 0;

  // Slide a window of quoteTokens.length across the word array
  const windowSize = quoteTokens.length;
  for (let i = 0; i <= wordTokens.length - windowSize; i++) {
    let matches = 0;
    for (let j = 0; j < windowSize; j++) {
      if (wordTokens[i + j] === quoteTokens[j]) {
        matches++;
      }
    }
    const score = matches / windowSize;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  // Require at least 50% match rate to trust the word-level time
  if (bestScore >= 0.5) {
    return {
      videoTime: words[bestIdx].start,
      source: "word_match",
      matchRate: bestScore,
    };
  }

  return { videoTime: chunkStartTime, source: "chunk_start", matchRate: bestScore };
}

// ── Route handler ──────────────────────────────────────────────────

export async function POST(req: Request) {
  const ingestStart = Date.now();

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

  let body: {
    text?: string;
    videoTime?: number;
    chunkStartTime?: number;
    chunkEndTime?: number;
    words?: WordTiming[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = (body.text || "").trim();
  const chunkStartTime = body.chunkStartTime ?? body.videoTime ?? 0;
  const chunkEndTime = body.chunkEndTime ?? chunkStartTime;
  const words = body.words || [];

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
    const claudeStart = Date.now();

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

For each claim found:
- Extract the EXACT quote — copy the speaker's words verbatim from the transcript. Do not paraphrase.
- Rate it: TRUE | MOSTLY TRUE | MISLEADING | FALSE | UNVERIFIABLE
- Confidence: 0-100 how confident you are in this rating
- Provide the actual data citing the SPECIFIC dataset:
  - BLS: cite the series (e.g. "BLS CES, Total Nonfarm, seasonally adjusted")
  - BEA: cite the table (e.g. "BEA NIPA Table 1.1.1, Real GDP")
  - Treasury: cite the dataset (e.g. "Treasury Monthly Statement")
  - FRED: cite the series ID (e.g. "FRED series UNRATE")
  - CBO: cite the report (e.g. "CBO Budget Outlook, Feb 2025")
- One-sentence explanation

RULES:
- Skip opinions, promises, predictions, and policy arguments — only fact-check verifiable economic statements
- Be nonpartisan — apply the same standard regardless of party or speaker
- Keep explanations under 30 words
- If no economic claims exist in this chunk, return an empty array
- Be precise with numbers
- Include the specific time period of data you're referencing
- IMPORTANT: The "quote" field MUST be copied verbatim from the transcript text — do not rephrase or summarize

Respond ONLY in valid JSON (no markdown fences):
{"claims":[{"quote":"exact words from transcript","rating":"TRUE","confidence":85,"actual":"data with dataset citation","explanation":"short explanation"}]}

No claims found: {"claims":[]}`,
        messages: [
          {
            role: "user",
            content: `Live broadcast transcript chunk (${chunkStartTime.toFixed(1)}s–${chunkEndTime.toFixed(1)}s):\n"${text}"`,
          },
        ],
      }),
    });

    const claudeMs = Date.now() - claudeStart;

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
      // Resolve per-claim timestamps via word-level matching
      const claims: LiveClaim[] = parsed.claims.map(
        (c: { quote: string; rating: string; confidence?: number; actual: string; explanation: string }) => {
          const { videoTime, source, matchRate } = findQuoteStartTime(
            c.quote,
            words,
            chunkStartTime
          );

          return {
            ...c,
            videoTime,
            videoTimeSource: source,
            transcriptConfidence: Math.round(matchRate * 100),
            chunkStartTime,
            chunkEndTime,
            timestamp: new Date().toISOString(),
            id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          };
        }
      );

      await appendLiveClaims(claims);

      // Structured observability log
      const totalMs = Date.now() - ingestStart;
      console.log(
        JSON.stringify({
          event: "ingest_complete",
          claimCount: claims.length,
          chunkStartTime,
          chunkEndTime,
          wordCount: words.length,
          claudeMs,
          totalMs,
          claims: claims.map((c) => ({
            rating: c.rating,
            videoTime: c.videoTime,
            videoTimeSource: c.videoTimeSource,
            matchRate: c.transcriptConfidence,
          })),
        })
      );

      // Debug timing record to Redis (non-blocking)
      appendDebugTiming({
        event: "ingest",
        claimCount: claims.length,
        chunkStartTime,
        chunkEndTime,
        wordCount: words.length,
        claudeMs,
        totalMs,
        perClaim: claims.map((c) => ({
          videoTime: c.videoTime,
          source: c.videoTimeSource,
          matchRate: c.transcriptConfidence,
          quote: c.quote.slice(0, 60),
        })),
      }).catch(() => {});

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
