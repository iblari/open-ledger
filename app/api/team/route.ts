import { NextResponse, after } from "next/server";
import { memberFor, keyFrom, readThread, post, MEMBERS, type Kind, type Member } from "@/lib/team";
import { claudeRespond, pingSam, TYPING_KEY } from "@/lib/team-agent";
import { kvGet } from "@/lib/live-kv";

/**
 * GET  /api/team[?since=ID]            the thread (needs a member key)
 * POST /api/team {text, kind?, ref?}   post as the key's member
 * Key: `Authorization: Bearer <key>` or `?key=<key>`.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const H = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const me = memberFor(keyFrom(req));
  if (!me) return NextResponse.json({ error: "bad key" }, { status: 401, headers: H });
  const since = Number(new URL(req.url).searchParams.get("since") || 0) || 0;
  const who: Member[] = ["claude", "sam"];
  const flags = await kvGet(who.map(TYPING_KEY)).catch(() => []);
  const typing = who.filter((_, i) => flags[i]);
  return NextResponse.json({ me, members: MEMBERS, typing, ...(await readThread(since)) }, { headers: H });
}

export async function POST(req: Request) {
  const me = memberFor(keyFrom(req));
  if (!me) return NextResponse.json({ error: "bad key" }, { status: 401, headers: H });
  const b = (await req.json().catch(() => ({}))) as { text?: string; kind?: Kind; ref?: number };
  const kind: Kind = ["message", "request", "approve", "decline"].includes(b.kind as string) ? (b.kind as Kind) : "message";
  try {
    const message = await post(me, b.text || "", kind, b.ref);
    after(() => Promise.all([claudeRespond(message), pingSam(message)]).then(() => {}));
    return NextResponse.json({ ok: true, message }, { headers: H });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400, headers: H });
  }
}
