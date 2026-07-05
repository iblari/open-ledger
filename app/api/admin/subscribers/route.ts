import { NextResponse } from "next/server";
import { getSubscribers, getCalendarPollStats } from "@/lib/live-kv";

/**
 * GET /api/admin/subscribers — export the subscriber list (ADMIN_KEY).
 *   ?format=csv  → CSV download for mail tools
 *   default      → JSON { count, subscribers }
 */
export async function GET(req: Request) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || req.headers.get("authorization") !== `Bearer ${adminKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subs = await getSubscribers();
  const { searchParams } = new URL(req.url);

  if (searchParams.get("format") === "csv") {
    const esc = (s: string) => `"${(s || "").replace(/"/g, '""')}"`;
    const csv = ["email,signed_up_at,source,feedback"]
      .concat(subs.map(s => [esc(s.email), esc(s.signed_up_at), esc(s.source), esc(s.feedback)].join(",")))
      .join("\r\n") + "\r\n";
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="voteunbiased-subscribers.csv"',
      },
    });
  }

  // Calendar-feed subscribers are anonymous by design; report approximate
  // distinct clients (30d). Google fetches centrally for ALL its users, so
  // "google" means the fetcher is active (≥1 user), not a people-count.
  const calendar = await getCalendarPollStats();
  return NextResponse.json({ count: subs.length, subscribers: subs, calendar });
}
