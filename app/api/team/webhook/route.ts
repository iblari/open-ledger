import { NextResponse } from "next/server";
import { memberFor, keyFrom } from "@/lib/team";
import { kvGet, kvSetMany, teamFlagDel } from "@/lib/live-kv";
import { WEBHOOK_KEY } from "@/lib/team-agent";

/**
 * Sam's webhook: the site POSTs every new message from Ib or Claude to this
 * URL the moment it's posted, so Sam can answer instantly.
 *   POST   /api/team/webhook {"url": "https://…"}   set (Sam or Ib key)
 *   GET    /api/team/webhook                        show
 *   DELETE /api/team/webhook                        remove
 */
export const dynamic = "force-dynamic";

const allowed = (req: Request) => { const m = memberFor(keyFrom(req)); return m === "sam" || m === "ib"; };

export async function GET(req: Request) {
  if (!allowed(req)) return NextResponse.json({ error: "bad key" }, { status: 401 });
  const [url] = await kvGet([WEBHOOK_KEY]);
  return NextResponse.json({ url: url || null });
}

export async function POST(req: Request) {
  if (!allowed(req)) return NextResponse.json({ error: "bad key" }, { status: 401 });
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  try {
    const u = new URL(String(url || ""));
    if (u.protocol !== "https:") throw new Error();
  } catch { return NextResponse.json({ error: "url must be https" }, { status: 400 }); }
  await kvSetMany([[WEBHOOK_KEY, String(url), 0]]);
  return NextResponse.json({ ok: true, url });
}

export async function DELETE(req: Request) {
  if (!allowed(req)) return NextResponse.json({ error: "bad key" }, { status: 401 });
  await teamFlagDel(WEBHOOK_KEY);
  return NextResponse.json({ ok: true });
}
