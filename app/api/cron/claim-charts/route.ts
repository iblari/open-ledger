import { NextResponse } from "next/server";
import { backfillClaimCharts } from "@/lib/trending-claims";
import { recheckClaims, FOREIGN_SCOPE_FIX } from "@/lib/claim-repair";

/** GET /api/cron/claim-charts — build charts for new True/False claims (4 per run). */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // One-off repairs (each target runs once, guarded in KV).
  const rep = await recheckClaims("fs1", FOREIGN_SCOPE_FIX, 4).catch(e => ({ fixed: [], failed: [(e as Error).message] }));
  if (rep.fixed.length || rep.failed.length) console.log("[claim-charts] repair", JSON.stringify(rep));
  const n = await backfillClaimCharts(rep.fixed.length ? 2 : 4).catch(e => { console.error("[claim-charts]", (e as Error).message); return 0; });
  if (n) console.log(`[claim-charts] built ${n}`);
  return NextResponse.json({ ok: true, built: n, repair: rep });
}
