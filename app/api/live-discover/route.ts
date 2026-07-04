import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

/**
 * GET /api/live-discover
 *
 * Keyless live-stream discovery + schedule autopilot source. Probes the
 * YouTube /live URL of each channel in public/live-channels.json and
 * reports:
 *   live:     streams broadcasting right now
 *   upcoming: scheduled streams (with YouTube's own scheduledStartTime) —
 *             the raw material for the KV schedule autopilot
 *
 * EDITORIAL FILTER: the product surfaces OFFICIAL EXECUTIVE VOICES —
 * President, Vice President, press briefings, cabinet secretaries. Broad
 * channels (C-SPAN) also stream concerts, pro-forma sessions, and
 * unrelated hearings; channels flagged officialOnly only surface streams
 * whose title matches the official-speaker pattern (null title fails
 * closed). The White House channel is exempt: everything it streams is
 * official by definition. Because the filter lives HERE, it governs the
 * site display, worker auto-coverage, and the schedule autopilot at once.
 *
 * Detection is keyless (no YouTube API quota): fetch the page, read
 * ytInitialPlayerResponse flags; titles fall back to YouTube's oEmbed
 * endpoint (channel pages served to datacenter IPs often omit title
 * metas). If YouTube changes page shape, detection degrades to "nothing
 * found" — never a hard failure. Results cached 60s.
 */

interface ChannelDef { id: string; label: string; url: string; officialOnly?: boolean }
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

const OFFICIAL_SPEAKER_RE = new RegExp(
  [
    "\\bpresident\\b", "\\bpotus\\b", "vice president", "\\bvp\\b",
    "white house", "press briefing", "press secretary", "press conference",
    "\\bcabinet\\b", "secretary", "attorney general",
    "state of the union", "address to", "oval office", "joint session",
    "inaugurat",
  ].join("|"),
  "i"
);

function passesOfficialFilter(ch: ChannelDef, title: string | null): boolean {
  if (!ch.officialOnly) return true;
  if (!title) return false; // can't judge → fail closed on broad channels
  return OFFICIAL_SPEAKER_RE.test(title);
}

const CACHE_TTL_MS = 60_000;
let cache: { at: number; hits: LiveHit[]; upcoming: UpcomingHit[] } | null = null;

async function probeChannel(ch: ChannelDef): Promise<ProbeResult> {
  const none: ProbeResult = { live: null, upcoming: null };
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
    if (!resp.ok) return none;
    const html = await resp.text();

    const vidMatch = html.match(/"videoId"\s*:\s*"([A-Za-z0-9_-]{11})"/);
    if (!vidMatch) return none;

    // Title: page metas first; oEmbed as the authoritative fallback (the
    // channel /live page served to datacenter IPs often omits the metas).
    const titleMatch =
      html.match(/<meta\s+name="title"\s+content="([^"]+)"/) ||
      html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/) ||
      html.match(/"videoDetails"\s*:\s*\{[^}]*?"title"\s*:\s*"((?:[^"\\]|\\.)+)"/) ||
      html.match(/<title>([^<]+)<\/title>/);
    let title: string | null = titleMatch
      ? titleMatch[1].replace(/\\u0026/g, "&").replace(/\\"/g, '"').replace(/ - YouTube$/, "").trim()
      : null;
    if (!title || title.toLowerCase() === ch.label.toLowerCase()) title = null;
    if (!title) {
      try {
        const oe = await fetch(
          `https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D${vidMatch[1]}&format=json`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (oe.ok) {
          const j = await oe.json();
          if (typeof j.title === "string" && j.title.trim()) title = j.title.trim();
        }
      } catch { /* title stays null → UI uses channel-label fallback */ }
    }

    // Editorial gate — see header comment.
    if (!passesOfficialFilter(ch, title)) return none;

    const base: LiveHit = {
      channelId: ch.id,
      channelLabel: ch.label,
      videoId: vidMatch[1],
      title,
      url: `https://www.youtube.com/watch?v=${vidMatch[1]}`,
    };

    const isUpcoming =
      /"isUpcoming"\s*:\s*true/.test(html) && !/"isLiveNow"\s*:\s*true/.test(html);
    if (isUpcoming) {
      // Scheduled-but-not-started: YouTube embeds the start time as epoch
      // seconds. This is the autopilot's raw "tune in at HH:MM" material.
      const t = html.match(/"scheduledStartTime"\s*:\s*"?(\d{10,13})"?/);
      if (t) {
        const ms = t[1].length >= 13 ? Number(t[1]) : Number(t[1]) * 1000;
        return { live: null, upcoming: { ...base, scheduledStart: new Date(ms).toISOString() } };
      }
      return none;
    }

    if (/"isLive"\s*:\s*true/.test(html)) {
      return { live: base, upcoming: null };
    }
    return none;
  } catch {
    // Timeouts / blocks are expected occasionally — treat as "not live".
    return none;
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
      { ok: false, error: "live-channels.json missing or malformed", detail: String(e), live: [], upcoming: [] },
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
