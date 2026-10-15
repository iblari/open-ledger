import { NextResponse } from "next/server";
import { backfillClaimCharts } from "@/lib/trending-claims";

/** GET /api/cron/claim-charts — build charts for new True/False claims (4 per run). */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const n = await backfillClaimCharts(4).catch(e => { console.error("[claim-charts]", (e as Error).message); return 0; });
  if (n) console.log(`[claim-charts] built ${n}`);
  return NextResponse.json({ ok: true, built: n });
}
