import { readFile } from "fs/promises";
import path from "path";
import { type ScheduledEvent } from "@/lib/schedule";

/**
 * GET /api/schedule.ics            — iCalendar feed of ALL upcoming broadcasts
 * GET /api/schedule.ics?event=<id> — single event (for "Add to calendar")
 *
 * The zero-infrastructure reminder loop: viewers subscribe to this feed
 * (webcal) once, and every event added to public/live-schedule.json shows
 * up in their calendar automatically with a 15-minute alarm. No accounts,
 * no push servers, works on every phone/desktop calendar app.
 */

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** ISO → iCalendar UTC basic format (20260704T190000Z). */
function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function eventToVevent(e: ScheduledEvent): string {
  return [
    "BEGIN:VEVENT",
    `UID:${e.id}@voteunbiased.org`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(e.scheduledStart)}`,
    `DTEND:${icsDate(e.scheduledEnd)}`,
    `SUMMARY:${icsEscape(`🔴 ${e.title} — live fact-check`)}`,
    `DESCRIPTION:${icsEscape(
      `${e.speaker} · ${e.source}\nWatch with real-time AI fact-checking against official data:\nhttps://voteunbiased.org/live`
    )}`,
    "URL:https://voteunbiased.org/live",
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape(`${e.title} starts in 15 minutes — voteunbiased.org/live`)}`,
    "END:VALARM",
    "END:VEVENT",
  ].join("\r\n");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const only = searchParams.get("event");

  let events: ScheduledEvent[] = [];
  try {
    const file = path.join(process.cwd(), "public", "live-schedule.json");
    const parsed = JSON.parse(await readFile(file, "utf8"));
    events = Array.isArray(parsed.events) ? parsed.events : [];
  } catch {
    /* empty calendar below */
  }

  const now = Date.now();
  const upcoming = events.filter(e => {
    if (!e.id || !e.scheduledStart || !e.scheduledEnd) return false;
    // Skip placeholder/example entries and long-past events.
    if (e.youtubeUrl?.includes("REPLACE_WITH")) return false;
    return Date.parse(e.scheduledEnd) > now - 24 * 3600 * 1000;
  });
  const selected = only ? upcoming.filter(e => e.id === only) : upcoming;

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vote Unbiased//Live Broadcast Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Vote Unbiased — Live Fact-Checked Broadcasts",
    "X-WR-CALDESC:Live official broadcasts with real-time AI fact-checking against BLS/BEA/FRED data. voteunbiased.org/live",
    ...selected.map(eventToVevent),
    "END:VCALENDAR",
  ].join("\r\n") + "\r\n";

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${only ? only : "voteunbiased-live"}.ics"`,
      // Calendar apps poll subscriptions infrequently anyway; short CDN
      // cache keeps the endpoint cheap without staleness issues.
      "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
    },
  });
}
