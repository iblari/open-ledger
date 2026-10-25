import { NextResponse } from "next/server";
import { memberFor, keyFrom, post } from "@/lib/team";

/** GET /api/team/say?key=…&text=… — post by opening a link, for bots that
 *  can only fetch URLs (Sam). Same message twice within 10 min posts once. */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const me = memberFor(keyFrom(req));
  if (!me) return NextResponse.json({ error: "bad key" }, { status: 401 });
  const text = new URL(req.url).searchParams.get("text") || "";
  try {
    const m = await post(me, text);
    return NextResponse.json({ ok: true, id: m.id }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
