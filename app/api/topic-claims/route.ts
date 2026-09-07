import { NextResponse } from "next/server";
import { getLedger } from "@/lib/live-kv";
import { topicOf } from "@/lib/claim-topics";

/**
 * GET /api/topic-claims?topics=Immigration,Housing — the claims behind a bar.
 *
 * Fetched on click rather than shipped with the page. Quotes are the bulk of
 * the payload and grow with every broadcast, while most visitors never open a
 * bar; sending all of them to everyone would tax the common case to serve the
 * rare one.
 *
 * Takes a LIST because the chart folds its smallest subjects into one tail
 * row. That row's label is a synthetic count, so it asks for the topics it
 * absorbed by name.
 */
export const dynamic = "force-dynamic";

const MAX_TOPICS = 40;

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("topics") || "";
  const wanted = new Set(
    raw.split(",").map(s => s.trim()).filter(Boolean).slice(0, MAX_TOPICS)
  );
  if (wanted.size === 0) {
    return NextResponse.json({ ok: false, error: "no topics requested" }, { status: 400 });
  }

  const ledger = await getLedger();
  const claims: {
    quote: string; rating: string; topic: string;
    speaker: string | null; day: string; broadcast: string;
  }[] = [];

  for (const e of ledger) {
    for (const c of e.claims) {
      if (!c.quote) continue;
      const topic = topicOf(c.quote);
      if (!wanted.has(topic)) continue;
      claims.push({
        quote: c.quote,
        rating: (c.rating || "").toUpperCase(),
        topic,
        speaker: e.speaker,
        day: e.startedAt.slice(0, 10),
        broadcast: e.title,
      });
    }
  }

  // Newest first: the reason to open a bar is usually "what did they just say
  // about this", not "what did they say three weeks ago".
  claims.sort((a, b) => b.day.localeCompare(a.day));
  return NextResponse.json({ ok: true, count: claims.length, claims });
}
