import { NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";

/**
 * POST /api/fetch-transcript
 * Body: { url: string }
 * Returns: { title, videoId, duration, segments: [{time, text}] }
 *
 * Two-strategy approach:
 * 1. Primary: youtube-transcript library (handles innertube API + protobuf)
 * 2. Fallback: Direct page scrape for captionTracks
 *
 * Groups captions into ~15-second segments matching DemoSpeech format.
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
}

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

/** Fetch video title from YouTube page */
async function fetchTitle(videoId: string): Promise<string> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    if (res.ok) {
      const data = await res.json();
      return data.title || "YouTube Video";
    }
  } catch { /* fall through */ }
  return "YouTube Video";
}

/**
 * Strategy 1: youtube-transcript library
 * Uses YouTube's innertube API with correct protobuf encoding.
 */
async function fetchViaLibrary(videoId: string): Promise<CaptionLine[] | null> {
  try {
    const raw = await YoutubeTranscript.fetchTranscript(videoId);
    if (!raw || raw.length === 0) return null;

    return raw.map((r: { text: string; offset: number }) => ({
      text: decodeEntities(r.text),
      startSec: r.offset / 1000,
    }));
  } catch (e) {
    console.error("youtube-transcript library failed:", e);
    return null;
  }
}

/**
 * Strategy 2: Page scrape fallback
 * Scrapes the YouTube watch page for captionTracks and fetches timed text.
 */
async function fetchViaPageScrape(videoId: string): Promise<CaptionLine[] | null> {
  try {
    const pageRes = await fetch(
      `https://www.youtube.com/watch?v=${videoId}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          Cookie:
            "SOCS=CAESEwgDEgk2ODE4NTkxNjQaAmVuIAEaBgiA_LyaBg; CONSENT=YES+",
        },
      }
    );
    if (!pageRes.ok) return null;

    const html = await pageRes.text();

    // Try multiple regex patterns to find captionTracks
    let tracksJson: string | null = null;
    const m1 = html.match(/"captionTracks"\s*:\s*(\[[\s\S]*?\])\s*,\s*"/);
    if (m1) tracksJson = m1[1];
    if (!tracksJson) {
      const m2 = html.match(/"captionTracks"\s*:\s*(\[.*?\])/);
      if (m2) tracksJson = m2[1];
    }
    if (!tracksJson) return null;

    let tracks: { baseUrl: string; languageCode: string; kind?: string }[];
    try {
      tracks = JSON.parse(tracksJson);
    } catch {
      return null;
    }
    if (!tracks || tracks.length === 0) return null;

    // Prefer English
    const enManual = tracks.find(
      (t) => t.languageCode.startsWith("en") && t.kind !== "asr"
    );
    const enAuto = tracks.find(
      (t) => t.languageCode.startsWith("en") && t.kind === "asr"
    );
    const track = enManual || enAuto || tracks.find((t) => t.languageCode.startsWith("en")) || tracks[0];

    const captionUrl = track.baseUrl + "&fmt=json3";
    const captionRes = await fetch(captionUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!captionRes.ok) return null;

    const text = await captionRes.text();
    if (!text || text.length === 0) return null;

    const captionData = JSON.parse(text);
    const events = captionData.events || [];
    const captions: CaptionLine[] = [];

    for (const event of events) {
      if (!event.segs) continue;
      const segText = event.segs
        .map((s: { utf8?: string }) => s.utf8 || "")
        .join("")
        .trim();
      if (!segText || segText === "\n") continue;
      captions.push({
        text: decodeEntities(segText),
        startSec: (event.tStartMs || 0) / 1000,
      });
    }

    return captions.length > 0 ? captions : null;
  } catch (e) {
    console.error("Page scrape failed:", e);
    return null;
  }
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

  // Try library first, then page scrape fallback
  let captions = await fetchViaLibrary(videoId);
  if (!captions || captions.length === 0) {
    console.log("Library failed for", videoId, "- trying page scrape");
    captions = await fetchViaPageScrape(videoId);
  }

  if (!captions || captions.length === 0) {
    return NextResponse.json(
      {
        error:
          "Could not fetch captions for this video. Make sure the video has auto-generated or manual subtitles enabled.",
      },
      { status: 404 }
    );
  }

  // Fetch the title via oembed (lightweight, reliable)
  const title = await fetchTitle(videoId);

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
}
