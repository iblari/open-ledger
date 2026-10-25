import { NextResponse } from "next/server";
import { memberFor, keyFrom, readThread, post, MEMBERS, type Kind } from "@/lib/team";

/**
 * GET  /api/team[?since=ID]            the thread (needs a member key)
 * POST /api/team {text, kind?, ref?}   post as the key's member
 * Key: `Authorization: Bearer <key>` or `?key=<key>`.
 */
export const dynamic = "force-dynamic";
const H = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const me = memberFor(keyFrom(req));
  if (!me) return NextResponse.json({ error: "bad key" }, { status: 401, headers: H });
  const since = Number(new URL(req.url).searchParams.get("since") || 0) || 0;
  return NextResponse.json({ me, members: MEMBERS, ...(await readThread(since)) }, { headers: H });
}

export async function POST(req: Request) {
  const me = memberFor(keyFrom(req));
  if (!me) return NextResponse.json({ error: "bad key" }, { status: 401, headers: H });
  const b = (await req.json().catch(() => ({}))) as { text?: string; kind?: Kind; ref?: number };
  const kind: Kind = ["message", "request", "approve", "decline"].includes(b.kind as string) ? (b.kind as Kind) : "message";
  try {
    return NextResponse.json({ ok: true, message: await post(me, b.text || "", kind, b.ref) }, { headers: H });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400, headers: H });
  }
}
