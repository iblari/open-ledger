import { NextResponse } from "next/server";
import { counts, like, list, post, report, removeOwn, hide, validAnon } from "@/lib/fy-social";

/**
 * GET  ?ids=a,b,c            -> { counts: { id: {likes, comments} } }
 * GET  ?card=id&anon=..      -> { comments: [...] }
 * POST { action: "like", card, anon, on }
 *      { action: "comment", card, anon, text }
 *      { action: "report" | "delete", card, id, anon }
 *      { action: "hide", card, id }  with Authorization: Bearer ADMIN_KEY
 */
export const dynamic = "force-dynamic";
const BOT = /bot|crawl|spider|preview|facebookexternalhit|slurp|headless|lighthouse/i;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET(req: Request) {
  const u = new URL(req.url);
  try {
    const card = u.searchParams.get("card");
    if (card) { const anon = u.searchParams.get("anon"); return NextResponse.json({ comments: await list(card, validAnon(anon) ? anon : null) }, { headers: { "Cache-Control": "no-store" } }); }
    const ids = (u.searchParams.get("ids") || "").split(",").filter(Boolean);
    return NextResponse.json({ counts: await counts(ids) }, { headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60" } });
  } catch { return bad("Unavailable", 503); }
}

export async function POST(req: Request) {
  if (BOT.test(req.headers.get("user-agent") || "")) return bad("No", 403);
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!b || typeof b.action !== "string") return bad("Bad request");
  const card = String(b.card || "");
  try {
    if (b.action === "hide") {
      if (!process.env.ADMIN_KEY || req.headers.get("authorization") !== `Bearer ${process.env.ADMIN_KEY}`) return bad("Unauthorized", 401);
      await hide(card, String(b.id || ""), "admin"); return NextResponse.json({ ok: true });
    }
    if (!validAnon(b.anon)) return bad("Bad request");
    if (b.action === "like") return NextResponse.json({ likes: await like(card, b.anon, b.on !== false) });
    if (b.action === "comment") {
      const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "0";
      const r = await post(card, b.anon, String(b.text || ""), ip);
      return r.ok ? NextResponse.json(r) : NextResponse.json(r, { status: 422 });
    }
    if (b.action === "report") { await report(card, String(b.id || ""), b.anon); return NextResponse.json({ ok: true }); }
    if (b.action === "delete") return NextResponse.json({ ok: await removeOwn(card, String(b.id || ""), b.anon) });
    return bad("Bad request");
  } catch { return bad("Unavailable", 503); }
}
