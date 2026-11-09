import { NextResponse } from "next/server";
import { forYouFeed, recordFy, fyStats } from "@/lib/for-you";

/** GET /api/for-you[?st=XX] — the feed as JSON. GET ?stats=1 — 7-day usage
 *  (sessions, cards per session, open rate). POST {session?, views?, open?, done?} — beacon. */
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const BOT = /bot|crawl|spider|preview|facebookexternalhit|slurp|headless|lighthouse/i;

export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("stats")) return NextResponse.json(await fyStats(Math.min(30, +(u.searchParams.get("days") || 7) || 7)));
  const st = (u.searchParams.get("st") || req.headers.get("x-vercel-ip-country-region") || "").toUpperCase().slice(0, 2) || null;
  return NextResponse.json(await forYouFeed(st), { headers: { "Cache-Control": "private, max-age=60" } });
}

export async function POST(req: Request) {
  if (BOT.test(req.headers.get("user-agent") || "")) return new NextResponse(null, { status: 204 });
  const b = await req.json().catch(() => null);
  if (b && typeof b === "object") await recordFy({ session: !!b.session, views: Array.isArray(b.views) ? b.views.filter((x: unknown) => typeof x === "string") : [], open: typeof b.open === "string" ? b.open : undefined, done: typeof b.done === "number" ? b.done : 0 }).catch(() => {});
  return new NextResponse(null, { status: 204 });
}
