import { NextResponse } from "next/server";

/**
 * POST /api/fetch-transcript
 * Body: { url: string }
 * Returns: { title, videoId, duration, segments: [{time, text}] }
 *
 * Directly scrapes YouTube's player response to find caption tracks,
 * fetches the actual timed-text data, and groups into ~15-second
 * segments matching the DemoSpeech format for the /live page.
 *
 * No npm dependency — more reliable than youtube-transcript library.
 */

function extractVideoId(url: string): string | null {
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/embed\/([A-Za-z0-9_-]{11})/,
    /\/live\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  if (/^[A-Za-z0-9_-]{11}$/.test(url.trim())) return url.trim();
  return null;
}

/** Decode HTML entities that YouTube puts in caption text */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\n/g, " ")
    .trim();
}

interface CaptionLine {
  text: string;
  startSec: number;
  durSec: number;
}

/** Group raw caption lines into ~15-second windows */
function groupIntoSegments(
  lines: CaptionLine[],
  windowSec = 15
): { time: number; text: string }[] {
  if (lines.length === 0) return [];

  const segments: { time: number; text: string }[] = [];
  let windowStart = Math.floor(lines[0].startSec);
  let buf: string[] = [];

  for (const line of lines) {
    const sec = Math.floor(line.startSec);
    if (sec - windowStart >= windowSec && buf.length > 0) {
      segments.push({ time: windowStart, text: buf.join(" ") });
      buf = [];
      windowStart = sec;
    }
    const clean = line.text.trim();
    if (clean) buf.push(clean);
  }
  if (buf.length > 0) {
    segments.push({ time: windowStart, text: buf.join(" ") });
  }
  return segments;
}

/**
 * Fetch captions directly from YouTube by scraping the watch page
 * and extracting captionTracks from the player response.
 */
async function fetchCaptions(videoId: string): Promise<{
  title: string;
  captions: CaptionLine[];
}> {
  // Fetch the YouTube watch page
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!pageRes.ok) {
    throw new Error(`YouTube returned ${pageRes.status}`);
  }

  const html = await pageRes.text();

  // Extract video title
  let title = "YouTube Video";
  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  if (titleMatch) {
    title = decodeEntities(titleMatch[1]).replace(/ - YouTube$/, "").trim();
  }

  // Find captionTracks in the player response
  // YouTube embeds this in ytInitialPlayerResponse or inside a script tag
  const captionTracksMatch = html.match(
    /"captionTracks"\s*:\s*(\[[\s\S]*?\])\s*,\s*"/
  );

  if (!captionTracksMatch) {
    // Check if captions are explicitly disabled
    if (html.includes('"playabilityStatus"') && html.includes('"ERROR"')) {
      throw new Error("VIDEO_UNAVAILABLE");
    }
    throw new Error("NO_CAPTIONS");
  }

  let tracks: { baseUrl: string; languageCode: string; kind?: string }[];
  try {
    tracks = JSON.parse(captionTracksMatch[1]);
  } catch {
    throw new Error("NO_CAPTIONS");
  }

  if (!tracks || tracks.length === 0) {
    throw new Error("NO_CAPTIONS");
  }

  // Prefer English manual captions, then English auto-generated, then first available
  const enManual = tracks.find(
    (t) => t.languageCode.startsWith("en") && t.kind !== "asr"
  );
  const enAuto = tracks.find(
    (t) => t.languageCode.startsWith("en") && t.kind === "asr"
  );
  const anyEn = tracks.find((t) => t.languageCode.startsWith("en"));
  const track = enManual || enAuto || anyEn || tracks[0];

  // Fetch the actual timed text in JSON3 format
  const captionUrl = track.baseUrl + "&fmt=json3";
  const captionRes = await fetch(captionUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!captionRes.ok) {
    throw new Error("CAPTION_FETCH_FAILED");
  }

  const captionData = await captionRes.json();

  // Parse json3 format: { events: [{ tStartMs, dDurationMs, segs: [{utf8}] }] }
  const events = captionData.events || [];
  const captions: CaptionLine[] = [];

  for (const event of events) {
    if (!event.segs) continue; // skip window-positioning events
    const text = event.segs
      .map((s: { utf8?: string }) => s.utf8 || "")
      .join("")
      .trim();
    if (!text || text === "\n") continue;

    captions.push({
      text: decodeEntities(text),
      startSec: (event.tStartMs || 0) / 1000,
      durSec: (event.dDurationMs || 0) / 1000,
    });
  }

  return { title, captions };
}

export async function POST(req: Request) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = (body.url || "").trim();
  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return NextResponse.json(
      { error: "Could not parse a YouTube video ID from that URL." },
      { status: 400 }
    );
  }

  try {
    const { title, captions } = await fetchCaptions(videoId);

    if (captions.length === 0) {
      return NextResponse.json(
        {
          error:
            "No captions found for this video. Try a video with auto-generated or manual subtitles.",
        },
        { status: 404 }
      );
    }

    const segments = groupIntoSegments(captions);
    const lastSeg = segments[segments.length - 1];
    const estMinutes = Math.ceil((lastSeg?.time || 0) / 60);

    return NextResponse.json({
      videoId,
      title,
      speaker: "Unknown",
      date: new Date().toISOString().slice(0, 10),
      duration: `${estMinutes}m`,
      segments,
    });
  } catch (e) {
    console.error("Transcript fetch error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";

    if (msg === "NO_CAPTIONS") {
      return NextResponse.json(
        {
          error:
            "This video doesn't have captions available. Try a video with auto-generated or manual subtitles.",
        },
        { status: 404 }
      );
    }
    if (msg === "VIDEO_UNAVAILABLE") {
      return NextResponse.json(
        { error: "This video is unavailable or private." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: `Failed to fetch transcript: ${msg}` },
      { status: 500 }
    );
  }
}
