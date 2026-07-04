import { NextResponse } from "next/server";
import { extractAndVerifyClaims } from "@/lib/fact-check";
import { likelyHasEconomicClaim, dedupeClaims } from "@/lib/claim-utils";

/**
 * POST /api/live-fact-check
 *
 * Client-driven fact-check path: the /live page sends ~15s transcript chunks
 * from caption-driven videos (demos, pasted YouTube URLs) plus rolling context.
 *
 * The prompt, model call, parsing, and ground-truth verification all live in
 * lib/fact-check — shared with /api/admin/ingest so the two paths can't drift.
 */
export async function POST(req: Request) {
  let body: { text?: string; context?: string; recentQuotes?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = (body.text || "").trim();
  const context = (body.context || "").trim();
  // Quotes of claims the client already has on screen — lets the server drop
  // re-statements ("15 million jobs" said three times in one speech).
  const recentQuotes = Array.isArray(body.recentQuotes)
    ? body.recentQuotes.filter((q): q is string => typeof q === "string").slice(0, 30)
    : [];

  if (!text || text.length < 30) {
    return NextResponse.json({ claims: [] });
  }

  // Cheap regex pre-filter: chunks with no economic content skip the model
  // call entirely. In a typical speech that's most chunks — this is the
  // single biggest latency/cost lever in the pipeline.
  if (!likelyHasEconomicClaim(text)) {
    return NextResponse.json({ claims: [], skipped: "no-economic-content" });
  }

  const result = await extractAndVerifyClaims(
    `Context from earlier in the speech:\n"${context || "Start of broadcast"}"\n\nNew transcript chunk:\n"${text}"`
  );

  if (result.error) {
    // Surface the upstream error so the UI can show a real message instead
    // of pretending no claims were found. 200 on purpose — the client
    // handles {error} in-band.
    return NextResponse.json(
      { error: result.error, detail: result.detail, claims: [] },
      { status: 200 }
    );
  }

  const claims = dedupeClaims(result.claims, recentQuotes).map(c => ({
    ...c,
    timestamp: new Date().toISOString(),
    id: `claim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  }));

  return NextResponse.json({ claims });
}
