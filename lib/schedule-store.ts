// Server-side loader that merges the two schedule sources:
//   1. public/live-schedule.json — hand-maintained events (repo commits)
//   2. Upstash KV               — autopilot-discovered events (no deploys)
//
// KV wins on id collision (autopilot may refine a hand-entered event's
// times). Consumers: /api/live-schedule, /api/schedule.ics.

import { promises as fs } from "fs";
import path from "path";
import { getKvScheduleEvents } from "./live-kv";
import { type ScheduledEvent } from "./schedule";

export async function loadAllScheduleEvents(): Promise<ScheduledEvent[]> {
  let fileEvents: ScheduledEvent[] = [];
  try {
    const file = path.join(process.cwd(), "public", "live-schedule.json");
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    fileEvents = Array.isArray(parsed.events) ? parsed.events : [];
  } catch { /* file missing/malformed → KV only */ }

  let kvEvents: ScheduledEvent[] = [];
  try {
    kvEvents = (await getKvScheduleEvents()) as ScheduledEvent[];
  } catch { /* KV down → file only */ }

  const byId = new Map<string, ScheduledEvent>();
  for (const e of fileEvents) if (e?.id) byId.set(e.id, e);
  for (const e of kvEvents) if (e?.id) byId.set(e.id, e);
  return [...byId.values()];
}
