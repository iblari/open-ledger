import { NextResponse } from "next/server";

// Run on Vercel Edge Runtime (Cloudflare network) instead of Node.js (AWS).
// YouTube blocks requests from AWS data center IPs but not edge IPs.
// IMPORTANT: No Node.js-specific imports allowed here — only Web APIs (fetch, etc.)
export const runtime = "edge";

/**
 * POST /api/fetch-transcript
 * Body: { url: string }
 * Returns: { title, videoId, duration, segments: [{time, text}] }
 *
 * Pure fetch()-based implementation — no npm libraries that require Node.js.
 * Three strategies:
 * 1. Primary: Page scrape for captionTracks + fetch timed text (json3)
 * 2. Fallback: Page scrape + fetch timed text (srv3 XML)
 * 3. Fallback: Innertube API get_transcript endpoint
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

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const YT_HEADERS = {
  "User-Agent": BROWSER_UA,
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

/** Fetch the YouTube watch page HTML */
async function fetchWatchPage(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/watch?v=${videoId}&hl=en`,
      {
        headers: {
          ...YT_HEADERS,
          Cookie:
            "SOCS=CAESEwgDEgk2ODE4NTkxNjQaAmVuIAEaBgiA_LyaBg; CONSENT=YES+cb.20210328-17-p0.en+FX+299",
        },
      }
    );
    if (!res.ok) {
      console.error("Watch page fetch failed:", res.status);
      return null;
    }
    return await res.text();
  } catch (e) {
    console.error("Watch page fetch error:", e);
    return null;
  }
}

/** Extract captionTracks from YouTube page HTML */
function extractCaptionTracks(
  html: string
): { baseUrl: string; languageCode: string; kind?: string }[] | null {
  // Try multiple regex patterns
  const patterns = [
    /"captionTracks"\s*:\s*(\[[\s\S]*?\])\s*,\s*"/,
    /"captionTracks"\s*:\s*(\[.*?\])/,
  ];

  for (const pattern of patterns) {
    const m = html.match(pattern);
    if (m) {
      try {
        const tracks = JSON.parse(m[1]);
        if (Array.isArray(tracks) && tracks.length > 0) return tracks;
      } catch {
        continue;
      }
    }
  }
  return null;
}

/** Pick the best caption track (prefer English manual) */
function pickBestTrack(
  tracks: { baseUrl: string; languageCode: string; kind?: string }[]
): { baseUrl: string; languageCode: string; kind?: string } {
  const enManual = tracks.find(
    (t) => t.languageCode.startsWith("en") && t.kind !== "asr"
  );
  const enAuto = tracks.find(
    (t) => t.languageCode.startsWith("en") && t.kind === "asr"
  );
  return (
    enManual ||
    enAuto ||
    tracks.find((t) => t.languageCode.startsWith("en")) ||
    tracks[0]
  );
}

/**
 * Strategy 1: Fetch timed text as JSON3
 */
async function fetchCaptionsJson3(
  baseUrl: string
): Promise<CaptionLine[] | null> {
  try {
    const url = baseUrl + "&fmt=json3";
    const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA } });
    if (!res.ok) return null;

    const text = await res.text();
    if (!text || text.length < 10) return null;

    const data = JSON.parse(text);
    const events = data.events || [];
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
    console.error("JSON3 caption fetch failed:", e);
    return null;
  }
}

/**
 * Strategy 2: Fetch timed text as SRV3 (XML)
 */
async function fetchCaptionsSrv3(
  baseUrl: string
): Promise<CaptionLine[] | null> {
  try {
    const url = baseUrl + "&fmt=srv3";
    const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA } });
    if (!res.ok) return null;

    const xml = await res.text();
    if (!xml || xml.length < 10) return null;

    const captions: CaptionLine[] = [];
    // Parse <p t="startMs" d="durationMs">text</p> elements
    const pRegex = /<p\s+t="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
    let match;
    while ((match = pRegex.exec(xml)) !== null) {
      const startMs = parseInt(match[1], 10);
      // Strip any inner tags like <s> spans
      const rawText = match[2].replace(/<[^>]+>/g, "").trim();
      if (rawText) {
        captions.push({
          text: decodeEntities(rawText),
          startSec: startMs / 1000,
        });
      }
    }

    // If srv3 format didn't match, try basic timedtext XML format
    if (captions.length === 0) {
      const textRegex =
        /<text\s+start="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
      while ((match = textRegex.exec(xml)) !== null) {
        const startSec = parseFloat(match[1]);
        const rawText = match[2].replace(/<[^>]+>/g, "").trim();
        if (rawText) {
          captions.push({
            text: decodeEntities(rawText),
            startSec,
          });
        }
      }
    }

    return captions.length > 0 ? captions : null;
  } catch (e) {
    console.error("SRV3 caption fetch failed:", e);
    return null;
  }
}

/**
 * Strategy 3: YouTube innertube API (get_transcript)
 * Replicates what the youtube-transcript npm library does, using pure fetch.
 */
async function fetchViaInnertube(
  videoId: string,
  html: string
): Promise<CaptionLine[] | null> {
  try {
    // Extract innertube API key
    const apiKeyMatch = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/);
    if (!apiKeyMatch) return null;
    const apiKey = apiKeyMatch[1];

    // Extract client version
    const clientVersionMatch = html.match(
      /"INNERTUBE_CLIENT_VERSION"\s*:\s*"([^"]+)"/
    );
    const clientVersion = clientVersionMatch
      ? clientVersionMatch[1]
      : "2.20240101.00.00";

    // Extract serialized share entity (for get_transcript)
    // The params are a base64-encoded protobuf that identifies the video
    // We'll construct a minimal one
    const params = btoa(
      `\n\r\n\x0b${videoId}\x12\x00\x18\x01`
    );

    const res = await fetch(
      `https://www.youtube.com/youtubei/v1/get_transcript?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": BROWSER_UA,
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "WEB",
              clientVersion,
              hl: "en",
              gl: "US",
            },
          },
          params,
        }),
      }
    );

    if (!res.ok) return null;

    const data = await res.json();

    // Navigate the response structure
    const transcriptRenderer =
      data?.actions?.[0]?.updateEngagementPanelAction?.content
        ?.transcriptRenderer?.content?.transcriptSearchPanelRenderer?.body
        ?.transcriptSegmentListRenderer?.initialSegments;

    if (!transcriptRenderer || !Array.isArray(transcriptRenderer)) return null;

    const captions: CaptionLine[] = [];
    for (const seg of transcriptRenderer) {
      const renderer = seg?.transcriptSegmentRenderer;
      if (!renderer) continue;
      const text = renderer?.snippet?.runs
        ?.map((r: { text: string }) => r.text)
        .join("");
      const startMs = parseInt(renderer?.startMs || "0", 10);
      if (text && text.trim()) {
        captions.push({
          text: decodeEntities(text),
          startSec: startMs / 1000,
        });
      }
    }

    return captions.length > 0 ? captions : null;
  } catch (e) {
    console.error("Innertube API failed:", e);
    return null;
  }
}

/** Fetch video title via oembed (lightweight, reliable) */
async function fetchTitle(videoId: string): Promise<string> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    if (res.ok) {
      const data = await res.json();
      return data.title || "YouTube Video";
    }
  } catch {
    /* fall through */
  }
  return "YouTube Video";
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

  // Fetch the YouTube watch page (from Cloudflare edge IPs — not blocked)
  const html = await fetchWatchPage(videoId);
  if (!html) {
    return NextResponse.json(
      { error: "Could not fetch video page from YouTube." },
      { status: 502 }
    );
  }

  let captions: CaptionLine[] | null = null;

  // Strategy 1 & 2: Extract captionTracks from page, fetch timed text
  const tracks = extractCaptionTracks(html);
  if (tracks && tracks.length > 0) {
    const track = pickBestTrack(tracks);
    console.log(
      "Found caption track:",
      track.languageCode,
      track.kind || "manual"
    );

    // Try JSON3 format first
    captions = await fetchCaptionsJson3(track.baseUrl);

    // Fall back to SRV3/XML
    if (!captions) {
      console.log("JSON3 failed, trying SRV3 XML...");
      captions = await fetchCaptionsSrv3(track.baseUrl);
    }

    // Try raw baseUrl (default XML format)
    if (!captions) {
      console.log("SRV3 failed, trying default XML...");
      captions = await fetchCaptionsSrv3(track.baseUrl.split("&fmt=")[0]);
    }
  }

  // Strategy 3: Innertube API
  if (!captions) {
    console.log("Caption tracks approach failed, trying innertube API...");
    captions = await fetchViaInnertube(videoId, html);
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

  console.log(`Successfully fetched ${captions.length} caption lines for ${videoId}`);

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
