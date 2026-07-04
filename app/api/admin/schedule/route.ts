import { NextResponse } from "next/server";
import {
  getKvScheduleEvents,
  upsertKvScheduleEvents,
  type KvScheduledEvent,
} from "@/lib/live-kv";

/**
 * /api/admin/schedule — autopilot's write path into the broadcast schedule.
 *
 * POST { events: KvScheduledEvent[] }  — upsert by id (auth: ADMIN_KEY)
 * GET                                  — list KV events (auth: ADMIN_KEY)
 *
 * Events land in Upstash KV, NOT the repo JSON — no commit, no deploy, no
 * human. /api/live-schedule and /api/schedule.ics merge KV + file events,
 * so anything posted here is on the site and in subscribers' calendar
 * feeds within seconds.
 */

function authorized(req: Request): boolean {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return false;
  return req.headers.get("authorization") === `Bearer ${adminKey}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, events: await getKvScheduleEvents() });
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { events?: KvScheduledEvent[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.events)) {
    return NextResponse.json({ error: "events must be an array" }, { status: 400 });
  }
  // Light validation — computeStatus() defends again at read time.
  const sane = body.events.filter(e =>
    e && typeof e.id === "string" && e.id.length > 0 &&
    typeof e.title === "string" &&
    (e.youtubeUrl || e.streamUrl) &&
    !isNaN(Date.parse(e.scheduledStart)) &&
    !isNaN(Date.parse(e.scheduledEnd))
  );
  const result = await upsertKvScheduleEvents(sane);
  console.log(`[admin/schedule] upsert: ${JSON.stringify(result)}`);
  return NextResponse.json({ ok: true, ...result, rejected: body.events.length - sane.length });
}
