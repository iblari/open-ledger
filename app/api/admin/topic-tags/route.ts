import { NextResponse } from "next/server";
import { untaggedQuotes, storeTags, tagPending } from "@/lib/topic-tags";
import { getTopicTagMap } from "@/lib/live-kv";

/**
 * Topic tags (auth: ADMIN_KEY).
 *   GET                 → how many claims are tagged, and the untagged ones
 *   POST { tags }       → store reviewed tags { quote: topic }
 *   POST { run: true }  → tag the next batch with the model now
 */
export const dynamic = "force-dynamic";

function authed(req: Request): boolean {
  const key = process.env.ADMIN_KEY;
  return !!key && req.headers.get("authorization") === `Bearer ${key}`;
}

export async function GET(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [tags, untagged] = await Promise.all([getTopicTagMap(), untaggedQuotes(500)]);
  return NextResponse.json({ ok: true, tagged: Object.keys(tags).length, untagged: untagged.length, sample: untagged.slice(0, 20) });
}

export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body.run) return NextResponse.json({ ok: true, ...(await tagPending(40)) });
  if (!body.tags || typeof body.tags !== "object") return NextResponse.json({ error: "tags required" }, { status: 400 });
  return NextResponse.json({ ok: true, ...(await storeTags(body.tags)) });
}
