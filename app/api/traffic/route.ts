import { NextResponse } from "next/server";
import { trafficReport, dayET } from "@/lib/traffic";
import { memberFor, keyFrom } from "@/lib/team";

/** GET /api/traffic?since=YYYY-MM-DD — visits by post (utm_content), page, source and day.
 *  Team key required (Ib, Sam or Claude). */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!memberFor(keyFrom(req))) return NextResponse.json({ error: "bad key" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("since");
  const since = q && /^\d{4}-\d{2}-\d{2}/.test(q) ? q.slice(0, 10) : dayET(new Date(Date.now() - 7 * 864e5));
  return NextResponse.json(await trafficReport(since), { headers: { "Cache-Control": "no-store" } });
}
