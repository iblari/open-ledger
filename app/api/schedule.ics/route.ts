import { createHash } from "crypto";
import { type ScheduledEvent } from "@/lib/schedule";
import { loadAllScheduleEvents } from "@/lib/schedule-store";
import { recordCalendarPoll } from "@/lib/live-kv";

/** Classify the polling calendar client from its User-Agent. */
function classifyClient(ua: string): string {
  const u = ua.toLowerCase();
  if (u.includes("google-calendar") || u.includes("feedfetcher")) return "google";
  if (u.includes("dataaccessd") || u.includes("iphone") || u.includes("ios") || u.includes("calendaragent") || u.includes("mac os")) return "apple";
  if (u.includes("outlook") || u.includes("microsoft")) return "outlook";
  if (u.includes("mozilla")) return "browser";
  return "other";
}

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

  // File events (repo) + KV events (autopilot) merged — WITHOUT this the
  // feed silently omitted every automatically-scheduled event, breaking the
  // core promise that subscriptions update themselves.
  let events: ScheduledEvent[] = [];
  try {
    events = await loadAllScheduleEvents();
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

  // Track distinct polling clients (anonymous: hashed IP + client class) so
  // /api/admin/subscribers can report approximate calendar-subscriber counts.
  try {
    const ua = req.headers.get("user-agent") || "";
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const ipHash = createHash("sha256").update(ip).digest("hex").slice(0, 16);
    await recordCalendarPoll(ipHash, classifyClient(ua));
  } catch { /* tracking must never break the feed */ }

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // INLINE, not attachment: iOS Safari can't "download files" — with
      // attachment it errors ("Safari cannot download this file"); inline
      // hands the calendar straight to the Calendar app. Desktop browsers
      // still save/open it fine. (Subscribe links use webcal:// anyway.)
      "Content-Disposition": `inline; filename="${only ? only : "voteunbiased-live"}.ics"`,
      // No CDN cache: calendar clients poll hours apart (tiny traffic), and
      // each poll must reach the function for subscriber counting AND to
      // serve freshly-autopiloted events.
      "Cache-Control": "private, max-age=0",
    },
  });
}
