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

const CACHE_TTL_MS = 60_000;
let cache: { at: number; hits: LiveHit[] } | null = null;

async function probeChannel(ch: ChannelDef): Promise<LiveHit | null> {
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
    if (!resp.ok) return null;
    const html = await resp.text();

    // Live check: player response marks the stream live.
    if (!/"isLive"\s*:\s*true/.test(html)) return null;
    // Some "upcoming" pages also embed isLive-adjacent flags; require absence
    // of the explicit upcoming marker.
    if (/"isUpcoming"\s*:\s*true/.test(html) && !/"isLiveNow"\s*:\s*true/.test(html)) return null;

    const vidMatch = html.match(/"videoId"\s*:\s*"([A-Za-z0-9_-]{11})"/);
    if (!vidMatch) return null;

    // Title matters for editorial judgment: C-SPAN's channel streams
    // everything from hearings to holiday concerts — a generic "C-SPAN —
    // Live broadcast" card gives viewers no way to tell which. Try three
    // sources; normalize empty/derived-from-channel-name results to null
    // so the UI's fallback label is at least honest.
    const titleMatch =
      html.match(/<meta\s+name="title"\s+content="([^"]+)"/) ||
      html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/) ||
      html.match(/"videoDetails"\s*:\s*\{[^}]*?"title"\s*:\s*"((?:[^"\\]|\\.)+)"/) ||
      html.match(/<title>([^<]+)<\/title>/);
    let title: string | null = titleMatch
      ? titleMatch[1].replace(/\\u0026/g, "&").replace(/\\"/g, '"').replace(/ - YouTube$/, "").trim()
      : null;
    if (!title || title.toLowerCase() === ch.label.toLowerCase()) title = null;

    // The channel /live page served to datacenter IPs sometimes omits the
    // title metas entirely (observed for C-SPAN in production). YouTube's
    // official oEmbed endpoint is keyless, cheap, and authoritative.
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

    return {
      channelId: ch.id,
      channelLabel: ch.label,
      videoId: vidMatch[1],
      title,
      url: `https://www.youtube.com/watch?v=${vidMatch[1]}`,
    };
  } catch {
    // Timeouts / blocks are expected occasionally — treat as "not live".
    return null;
  }
}

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return NextResponse.json(
      { ok: true, cached: true, live: cache.hits },
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
  const hits = results.filter((h): h is LiveHit => h !== null);

  cache = { at: Date.now(), hits };
  return NextResponse.json(
    { ok: true, cached: false, live: hits },
    { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=120" } }
  );
}
