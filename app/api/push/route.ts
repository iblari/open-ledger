import { NextRequest, NextResponse } from "next/server";
import { getVapidKeys, addSub, removeSub, getSubs } from "@/lib/push";

/** GET  → { publicKey }               (for the client's subscribe call)
 *  POST { subscription } → store      (called after the user grants permission)
 *  DELETE { endpoint }   → remove */
export async function GET() {
  const keys = await getVapidKeys();
  if (!keys) return NextResponse.json({ error: "push not configured" }, { status: 503 });
  return NextResponse.json({ publicKey: keys.publicKey }, {
    headers: { "Cache-Control": "public, s-maxage=3600" },
  });
}

export async function POST(req: NextRequest) {
  try {
    const { subscription } = await req.json();
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
    }
    const total = await addSub({ endpoint: subscription.endpoint, keys: subscription.keys });
    return NextResponse.json({ ok: true, total });
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { endpoint } = await req.json();
    if (endpoint) await removeSub(endpoint);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
}

// Count endpoint for the admin page (reuses GET's route file — HEAD variant).
export async function HEAD() {
  const subs = await getSubs();
  return new NextResponse(null, { headers: { "x-push-subscribers": String(subs.length) } });
}
