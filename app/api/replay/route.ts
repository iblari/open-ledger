import { NextResponse } from "next/server";
import { getReplayableOne } from "@/lib/live-kv";

/**
 * GET /api/replay?v=<videoId> — one broadcast, any age, ready to replay:
 * video id, every check (with its "why" where the full record exists),
 * the recording-timed transcript. Powers the permanent Replays section.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const v = new URL(req.url).searchParams.get("v")?.trim();
  if (!v) return NextResponse.json({ ok: false, error: "v required" }, { status: 400 });
  const b = await getReplayableOne(v);
  if (!b) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, broadcast: b }, { headers: { "Cache-Control": "public, s-maxage=60" } });
}
