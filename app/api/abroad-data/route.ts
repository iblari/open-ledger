import { NextResponse } from "next/server";
import {
  POSTURE_ASSETS,
  PERSONNEL_BY_COUNTRY,
  THEATERS,
  HEADER_METRICS,
} from "@/lib/abroad-data";

/**
 * GET /api/abroad-data
 *
 * Serves all Abroad tab data as JSON with per-layer lastUpdated timestamps.
 */

export const revalidate = 3600; // 1 hour

export async function GET() {
  return NextResponse.json({
    lastUpdated: {
      assets: "2026-04-13",
      personnel: "2024-03-31",
    },
    postureAssets: POSTURE_ASSETS,
    personnelByCountry: PERSONNEL_BY_COUNTRY,
    theaters: THEATERS,
    headerMetrics: HEADER_METRICS,
  });
}
