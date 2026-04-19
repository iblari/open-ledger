import { NextResponse } from "next/server";
import {
  BASES,
  CSGS,
  BTF_EVENTS,
  PERSONNEL_BY_COUNTRY,
  THEATERS,
  HEADER_METRICS,
} from "@/lib/abroad-data";

/**
 * GET /api/abroad-data
 *
 * Serves all Abroad tab data as JSON with per-layer lastUpdated timestamps.
 *
 * Architecture note for real-time updates:
 * ─────────────────────────────────────────
 * Right now this reads from the static lib/abroad-data.ts module. To make
 * updates possible without redeploying, swap the import for one of:
 *
 *   1. A JSON file on disk (read with fs.readFileSync) — update via git push
 *   2. A Supabase/Postgres query — update via admin dashboard
 *   3. A Google Sheets fetch — update by editing a spreadsheet
 *   4. An S3/R2 JSON file — update via CLI or scheduled Lambda
 *
 * The frontend already fetches from this endpoint, so the swap is invisible
 * to the client. The `lastUpdated` fields below should reflect the actual
 * freshness of each data layer.
 *
 * Revalidation: cached for 1 hour. Vercel ISR will serve stale while
 * revalidating, so updates propagate within ~1h without a redeploy.
 */

export const revalidate = 3600; // 1 hour

export async function GET() {
  return NextResponse.json({
    // Per-layer timestamps — update these when data changes
    lastUpdated: {
      bases: "2024-07-01",       // DoD BSR FY2024
      csgs: "2026-04-13",        // USNI Fleet Tracker snapshot
      btf: "2025-05-15",         // Most recent BTF press release
      personnel: "2024-03-31",   // DMDC quarterly
    },
    bases: BASES,
    csgs: CSGS,
    btfEvents: BTF_EVENTS,
    personnelByCountry: PERSONNEL_BY_COUNTRY,
    theaters: THEATERS,
    headerMetrics: HEADER_METRICS,
  });
}
