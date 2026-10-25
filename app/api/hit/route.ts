import { NextResponse } from "next/server";
import { recordHit } from "@/lib/traffic";

/** POST /api/hit {path, utm_source?, utm_content?, utm_campaign?} — page-view beacon. */
export const dynamic = "force-dynamic";
const BOT = /bot|crawl|spider|preview|facebookexternalhit|slurp|headless|lighthouse/i;

export async function POST(req: Request) {
  if (BOT.test(req.headers.get("user-agent") || "")) return new NextResponse(null, { status: 204 });
  const b = (await req.json().catch(() => null)) as { path?: string; utm_source?: string; utm_content?: string; utm_campaign?: string } | null;
  if (b?.path && b.path.startsWith("/") && !/^\/(api|team|share|og|_next)/.test(b.path)) {
    await recordHit({ path: b.path, utmSource: b.utm_source, utmContent: b.utm_content, utmCampaign: b.utm_campaign }).catch(() => {});
  }
  return new NextResponse(null, { status: 204 });
}
