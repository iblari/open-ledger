import { NextResponse } from "next/server";
import { memberFor, keyFrom } from "@/lib/team";
import { kvGet, kvSetMany, teamFlagDel } from "@/lib/live-kv";
import { WEBHOOK_KEY, WEBHOOK_SECRET_KEY, WEBHOOK_HEADERS_KEY, pingSam } from "@/lib/team-agent";

/**
 * Sam's webhook: the site POSTs every new message from Ib or Claude to this
 * URL the moment it's posted, so Sam can answer instantly.
 *   POST   /api/team/webhook {"url": "https://…", "secret": "…"}   set (Sam or Ib key)
 *          Each ping carries X-VU-Signature: sha256=<HMAC-SHA256(body, secret)>.
 *          Optional "headers": {"Authorization": "Bearer …"} are sent with every
 *          ping (for receivers that want their own sender key in a header).
 *          A test ping is sent right away; GET shows the last delivery result.
 *   GET    /api/team/webhook                        show
 *   DELETE /api/team/webhook                        remove
 */
export const dynamic = "force-dynamic";

const allowed = (req: Request) => { const m = memberFor(keyFrom(req)); return m === "sam" || m === "ib"; };

export async function GET(req: Request) {
  if (!allowed(req)) return NextResponse.json({ error: "bad key" }, { status: 401 });
  const [url, sec, hdrs, last] = await kvGet([WEBHOOK_KEY, WEBHOOK_SECRET_KEY, WEBHOOK_HEADERS_KEY, "team:webhook:sam:last"]);
  return NextResponse.json({ url: url ? url.replace(/([?&](key|token|secret)=)[^&]+/gi, "$1…") : null, signed: !!sec, headers: hdrs ? Object.keys(JSON.parse(hdrs)) : [], lastDelivery: last ? JSON.parse(last) : null });
}

export async function POST(req: Request) {
  if (!allowed(req)) return NextResponse.json({ error: "bad key" }, { status: 401 });
  const { url, secret, headers } = (await req.json().catch(() => ({}))) as { url?: string; secret?: string; headers?: Record<string, unknown> };
  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers || {})) {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(k) || /^(host|content-length|content-type)$/i.test(k)) return NextResponse.json({ error: `header not allowed: ${k}` }, { status: 400 });
    extra[k] = String(v).slice(0, 500);
  }
  try {
    const u = new URL(String(url || ""));
    if (u.protocol !== "https:") throw new Error();
  } catch { return NextResponse.json({ error: "url must be https" }, { status: 400 }); }
  if (secret != null && String(secret).length < 16) return NextResponse.json({ error: "secret must be at least 16 characters" }, { status: 400 });
  await kvSetMany([[WEBHOOK_KEY, String(url), 0], [WEBHOOK_HEADERS_KEY, JSON.stringify(extra), 0], ...(secret ? [[WEBHOOK_SECRET_KEY, String(secret), 0] as [string, string, number]] : [])]);
  await pingSam({ id: 0, from: "claude", kind: "message", text: "Webhook test: you'll get every new message from Ib and Claude here.", at: new Date().toISOString() });
  const [last] = await kvGet(["team:webhook:sam:last"]);
  return NextResponse.json({ ok: true, url, signed: !!secret, headers: Object.keys(extra), test: last ? JSON.parse(last) : null });
}

export async function DELETE(req: Request) {
  if (!allowed(req)) return NextResponse.json({ error: "bad key" }, { status: 401 });
  await teamFlagDel(WEBHOOK_KEY);
  await teamFlagDel(WEBHOOK_SECRET_KEY);
  await teamFlagDel(WEBHOOK_HEADERS_KEY);
  return NextResponse.json({ ok: true });
}
