import { NextResponse } from "next/server";
import { getReleaseCalendar } from "@/lib/release-calendar";

/** GET /api/release-calendar — upcoming official data releases (CPI, jobs, PPI, GDP, gas). */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ releases: await getReleaseCalendar() }, { headers: { "Cache-Control": "public, s-maxage=1800", "Access-Control-Allow-Origin": "*" } });
}
