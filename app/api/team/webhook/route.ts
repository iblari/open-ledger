import { NextResponse } from "next/server";
import { memberFor, keyFrom } from "@/lib/team";
import { kvGet, kvSetMany, teamFlagDel } from "@/lib/live-kv";
import { WEBHOOK_KEY, WEBHOOK_SECRET_KEY, pingSam } from "@/lib/team-agent";

/**
 * Sam's webhook: the site POSTs every new message from Ib or Claude to this
 * URL the moment it's posted, so Sam can answer instantly.
 *   POST   /api/team/webhook {"url": "https://…", "secret": "…"}   set (Sam or Ib key)
 *          Each ping carries X-VU-Signature: sha256=<HMAC-SHA256(body, secret)>.
 *          A test ping is sent right away.
 *   GET    /api/team/webhook                        show
 *   DELETE /api/team/webhook                        remove
 */
export const dynamic = "force-dynamic";

const allowed = (req: Request) => { const m = memberFor(keyFrom(req)); return m === "sam" || m === "ib"; };

export async function GET(req: Request) {
  if (!allowed(req)) return NextResponse.json({ error: "bad key" }, { status: 401 });
  const [url, sec] = await kvGet([WEBHOOK_KEY, WEBHOOK_SECRET_KEY]);
  return NextResponse.json({ url: url || null, signed: !!sec });
}

export async function POST(req: Request) {
  if (!allowed(req)) return NextResponse.json({ error: "bad key" }, { status: 401 });
  const { url, secret } = (await req.json().catch(() => ({}))) as { url?: string; secret?: string };
  try {
    const u = new URL(String(url || ""));
    if (u.protocol !== "https:") throw new Error();
  } catch { return NextResponse.json({ error: "url must be https" }, { status: 400 }); }
  if (secret != null && String(secret).length < 16) return NextResponse.json({ error: "secret must be at least 16 characters" }, { status: 400 });
  await kvSetMany([[WEBHOOK_KEY, String(url), 0], ...(secret ? [[WEBHOOK_SECRET_KEY, String(secret), 0] as [string, string, number]] : [])]);
  await pingSam({ id: 0, from: "claude", kind: "message", text: "Webhook test: you'll get every new message from Ib and Claude here.", at: new Date().toISOString() });
  return NextResponse.json({ ok: true, url, signed: !!secret, testSent: true });
}

export async function DELETE(req: Request) {
  if (!allowed(req)) return NextResponse.json({ error: "bad key" }, { status: 401 });
  await teamFlagDel(WEBHOOK_KEY);
  await teamFlagDel(WEBHOOK_SECRET_KEY);
  return NextResponse.json({ ok: true });
}
