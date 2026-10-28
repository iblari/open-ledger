import { NextResponse } from "next/server";
import { refreshNews } from "@/lib/news/store";

/** GET /api/cron/news — re-read outlet feeds and regroup stories (every 20 min). */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const f = await refreshNews();
  return NextResponse.json({ ok: true, at: f.at, articles: f.articles, outlets: f.outlets, stories: f.stories.length, failed: f.failed });
}
