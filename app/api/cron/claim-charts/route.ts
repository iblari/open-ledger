import { NextResponse } from "next/server";
import { backfillClaimCharts, backfillClaimSeries } from "@/lib/trending-claims";
import { recheckClaims, FOREIGN_SCOPE_FIX, NATIONAL_SCOPE_FIX } from "@/lib/claim-repair";

/** GET /api/cron/claim-charts — build charts for new True/False claims (4 per run). */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // One-off repairs (each target runs once, guarded in KV).
  const rep = await recheckClaims("fs1", FOREIGN_SCOPE_FIX, 4).catch(e => ({ fixed: [] as string[], failed: [(e as Error).message] }));
  const rep2 = await recheckClaims("ns1", NATIONAL_SCOPE_FIX, 2).catch(e => ({ fixed: [] as string[], failed: [(e as Error).message] }));
  rep.fixed.push(...rep2.fixed); rep.failed.push(...rep2.failed);
  if (rep.fixed.length || rep.failed.length) console.log("[claim-charts] repair", JSON.stringify(rep));
  const mapped = await backfillClaimSeries(20).catch(e => { console.error("[claim-series]", (e as Error).message); return 0; });
  const n = await backfillClaimCharts(rep.fixed.length ? 3 : 6).catch(e => { console.error("[claim-charts]", (e as Error).message); return 0; });
  if (n) console.log(`[claim-charts] built ${n}`);
  return NextResponse.json({ ok: true, built: n, mapped, repair: rep });
}
