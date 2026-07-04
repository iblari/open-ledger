import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

/**
 * GET /api/live-discover
 *
 * Keyless live-stream discovery. Probes the YouTube /live URL of each channel
 * in public/live-channels.json and reports which are streaming right now.
 *
 * Why: the schedule (public/live-schedule.json) only knows about events
 * someone manually added. Unscheduled pressers used to mean the /live page
 * showed "No live broadcast right now" while the White House was mid-stream.
 * This endpoint closes that gap — the idle page polls it and surfaces any
 * detected stream immediately.
 *
 * Detection: a channel's /live URL renders a watch page whose HTML embeds
 * ytInitialPlayerResponse with "isLive":true and the videoId when streaming.
 * No API key, no quota. If YouTube changes the page shape, detection degrades
 * to "nothing found" — never a hard failure.
 *
 * Caching: results cached in-module for 60s + CDN s-maxage, so page polling
 * doesn't hammer YouTube (4 channels × 1 fetch/min worst case).
 */

interface ChannelDef { id: string; label: string; url: string }
interface LiveHit {
  channelId: string;
  channelLabel: string;
  videoId: string;
  title: string | null;
  url: string;
}
interface UpcomingHit extends LiveHit {
  /** ISO timestamp YouTube says the stream is scheduled to start. */
  scheduledStart: string;
}
interface ProbeResult { live: LiveHit | null; upcoming: UpcomingHit | null }

const CACHE_TTL_MS = 60_000;
let cache: { at: number; hits: LiveHit[]; upcoming: UpcomingHit[] } | null = null;

async function probeChannel(ch: ChannelDef): Promise<ProbeResult> {
  try {
    const resp = await fetch(ch.url, {
      headers: {
        // Desktop UA — the consent/mobile interstitials are likelier without one.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    if (!resp.ok) return { live: null, upcoming: null };
    const html = await resp.text();

    const vidMatch = html.match(/"videoId"\s*:\s*"([A-Za-z0-9_-]{11})"/);
    if (!vidMatch) return { live: null, upcoming: null };

    const titleMatch =
      html.match(/<meta\s+name="title"\s+content="([^"]+)"/) ||
      html.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch
      ? titleMatch[1].replace(/ - YouTube$/, "").trim()
      : null;

    const base = {
      channelId: ch.id,
      channelLabel: ch.label,
      videoId: vidMatch[1],
      title,
      url: `https://www.youtube.com/watch?v=${vidMatch[1]}`,
    };

    const isUpcoming =
      /"isUpcoming"\s*:\s*true/.test(html) && !/"isLiveNow"\s*:\s*true/.test(html);

    if (isUpcoming) {
      // Scheduled-but-not-started stream: YouTube embeds the start time as
      // epoch seconds in liveStreamability / upcomingEventData. This is the
      // autopilot's raw material — a machine-readable "tune in at HH:MM".
      const t = html.match(/"scheduledStartTime"\s*:\s*"?(\d{10,13})"?/);
      if (t) {
        const ms = t[1].length >= 13 ? Number(t[1]) : Number(t[1]) * 1000;
        return {
          live: null,
          upcoming: { ...base, scheduledStart: new Date(ms).toISOString() },
        };
      }
      return { live: null, upcoming: null };
    }

    if (/"isLive"\s*:\s*true/.test(html)) {
      return { live: base, upcoming: null };
    }
    return { live: null, upcoming: null };
  } catch {
    // Timeouts / blocks are expected occasionally — treat as "not live".
    return { live: null, upcoming: null };
  }
}

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return NextResponse.json(
      { ok: true, cached: true, live: cache.hits, upcoming: cache.upcoming },
      { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=120" } }
    );
  }

  let channels: ChannelDef[] = [];
  try {
    const file = path.join(process.cwd(), "public", "live-channels.json");
    const parsed = JSON.parse(await readFile(file, "utf8"));
    channels = Array.isArray(parsed.channels) ? parsed.channels : [];
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "live-channels.json missing or malformed", detail: String(e), live: [] },
      { status: 200 }
    );
  }

  const results = await Promise.all(channels.map(probeChannel));
  const hits = results.map(r => r.live).filter((h): h is LiveHit => h !== null);
  const upcoming = results.map(r => r.upcoming).filter((u): u is UpcomingHit => u !== null);

  cache = { at: Date.now(), hits, upcoming };
  return NextResponse.json(
    { ok: true, cached: false, live: hits, upcoming },
    { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=120" } }
  );
}
