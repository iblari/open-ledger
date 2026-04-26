import { NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";

/**
 * POST /api/fetch-transcript
 * Body: { url: string }
 * Returns: { title, videoId, segments: [{time, text}] }
 *
 * Fetches the YouTube auto-generated or manual captions,
 * groups them into ~15-second windows, and returns timed segments
 * that match the DemoSpeech format used by the /live page.
 */

function extractVideoId(url: string): string | null {
  // Handle: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID, youtube.com/live/ID
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
  // Maybe they just pasted the ID itself
  if (/^[A-Za-z0-9_-]{11}$/.test(url.trim())) return url.trim();
  return null;
}

/** Group raw transcript lines into ~15-second windows */
function groupIntoSegments(
  lines: { text: string; offset: number; duration: number }[],
  windowSec = 15
): { time: number; text: string }[] {
  if (lines.length === 0) return [];

  const segments: { time: number; text: string }[] = [];
  let windowStart = Math.floor(lines[0].offset / 1000);
  let buf: string[] = [];

  for (const line of lines) {
    const sec = Math.floor(line.offset / 1000);
    if (sec - windowStart >= windowSec && buf.length > 0) {
      segments.push({ time: windowStart, text: buf.join(" ") });
      buf = [];
      windowStart = sec;
    }
    buf.push(line.text.replace(/\n/g, " ").trim());
  }
  if (buf.length > 0) {
    segments.push({ time: windowStart, text: buf.join(" ") });
  }
  return segments;
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
    const raw = await YoutubeTranscript.fetchTranscript(videoId);
    if (!raw || raw.length === 0) {
      return NextResponse.json(
        { error: "No captions found for this video. The video may not have subtitles enabled." },
        { status: 404 }
      );
    }

    const segments = groupIntoSegments(
      raw.map((r: { text: string; offset: number; duration: number }) => ({
        text: r.text,
        offset: r.offset,
        duration: r.duration,
      }))
    );

    // Estimate duration from last segment
    const lastSeg = segments[segments.length - 1];
    const estMinutes = Math.ceil((lastSeg?.time || 0) / 60);

    return NextResponse.json({
      videoId,
      title: `YouTube Video`,
      speaker: "Unknown",
      date: new Date().toISOString().slice(0, 10),
      duration: `${estMinutes}m`,
      segments,
    });
  } catch (e) {
    console.error("Transcript fetch error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    // Common case: video has no captions
    if (msg.includes("Could not get the transcript") || msg.includes("disabled")) {
      return NextResponse.json(
        { error: "This video doesn't have captions/subtitles available. Try a video with auto-generated or manual captions." },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: `Failed to fetch transcript: ${msg}` },
      { status: 500 }
    );
  }
}
