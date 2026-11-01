import { NextResponse } from "next/server";
import { memberFor, keyFrom, BOTS, type Bot } from "@/lib/team";
import { kvGet, kvSetMany, teamFlagDel } from "@/lib/live-kv";
import { hookKeys, pingBot } from "@/lib/team-agent";

/**
 * Bot webhooks (Sam, John): the site POSTs every new message meant for the bot
 * to its URL the moment it's posted, so it can answer instantly. A bot's key
 * manages its own webhook; Ib's key picks one with ?bot=sam|john (default sam).
 *   POST   /api/team/webhook {"url": "https://…", "secret": "…"}   set (Sam or Ib key)
 *          Each ping carries X-VU-Signature: sha256=<HMAC-SHA256(body, secret)>.
 *          Optional "headers": {"Authorization": "Bearer …"} are sent with every
 *          ping (for receivers that want their own sender key in a header).
 *          A test ping is sent right away; GET shows the last delivery result.
 *   GET    /api/team/webhook                        show
 *   DELETE /api/team/webhook                        remove
 */
export const dynamic = "force-dynamic";

/** Which bot's webhook this caller manages, or null if not allowed. */
function botFor(req: Request): Bot | null {
  const m = memberFor(keyFrom(req));
  if ((BOTS as readonly string[]).includes(m as string)) return m as Bot;
  if (m !== "ib") return null;
  const b = new URL(req.url).searchParams.get("bot") || "sam";
  return (BOTS as readonly string[]).includes(b) ? (b as Bot) : null;
}

export async function GET(req: Request) {
  const bot = botFor(req); if (!bot) return NextResponse.json({ error: "bad key" }, { status: 401 });
  const k = hookKeys(bot);
  const [url, sec, hdrs, last] = await kvGet([k.url, k.secret, k.headers, k.last]);
  return NextResponse.json({ bot, url: url ? url.replace(/([?&](key|token|secret)=)[^&]+/gi, "$1…") : null, signed: !!sec, headers: hdrs ? Object.keys(JSON.parse(hdrs)) : [], lastDelivery: last ? JSON.parse(last) : null });
}

export async function POST(req: Request) {
  const bot = botFor(req); if (!bot) return NextResponse.json({ error: "bad key" }, { status: 401 });
  const k = hookKeys(bot);
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
  await kvSetMany([[k.url, String(url), 0], [k.headers, JSON.stringify(extra), 0], ...(secret ? [[k.secret, String(secret), 0] as [string, string, number]] : [])]);
  await pingBot(bot, { id: 0, from: "claude", kind: "message", text: "Webhook test: you'll get new messages meant for you here.", at: new Date().toISOString() });
  const [last] = await kvGet([k.last]);
  return NextResponse.json({ ok: true, bot, url, signed: !!secret, headers: Object.keys(extra), test: last ? JSON.parse(last) : null });
}

export async function DELETE(req: Request) {
  const bot = botFor(req); if (!bot) return NextResponse.json({ error: "bad key" }, { status: 401 });
  const k = hookKeys(bot);
  await teamFlagDel(k.url);
  await teamFlagDel(k.secret);
  await teamFlagDel(k.headers);
  return NextResponse.json({ ok: true });
}
