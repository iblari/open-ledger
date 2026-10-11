import { NextResponse } from "next/server";
import { dailySignalJob } from "@/lib/signal-score";

/** GET /api/cron/signals — once a day: open new radar flags, resolve old ones
 *  against Federal Register actions and FRED prices (see lib/signal-score). */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const r = await dailySignalJob().catch(e => ({ error: (e as Error).message }));
  console.log("[signals]", JSON.stringify(r));
  return NextResponse.json({ ok: true, result: r });
}
