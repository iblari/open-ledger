import { NextResponse } from "next/server";

// Run on Vercel Edge Runtime (Cloudflare network) instead of Node.js (AWS).
export const runtime = "edge";

/**
 * POST /api/fetch-transcript
 * Body: { url: string }
 * Returns: { title, videoId, duration, segments: [{time, text}] }
 *
 * Pure fetch() implementation — Edge Runtime compatible.
 * Uses YouTube InnerTube ANDROID client API (same approach as youtube-transcript npm).
 */

const INNERTUBE_API_URL =
  "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const INNERTUBE_CLIENT_VERSION = "20.10.38";
const INNERTUBE_USER_AGENT = `com.google.android.youtube/${INNERTUBE_CLIENT_VERSION} (Linux; U; Android 14)`;
const WEB_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)";

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
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10))
    )
    .replace(/\n/g, " ")
    .trim();
}

interface TranscriptItem {
  text: string;
  startSec: number;
}

function groupIntoSegments(
  lines: TranscriptItem[],
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

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
}

/**
 * Parse transcript XML — supports both srv3 format and classic format.
 * Exactly matches youtube-transcript npm library parsing.
 */
function parseTranscriptXml(xml: string): TranscriptItem[] {
  const results: TranscriptItem[] = [];

  // Try srv3 format: <p t="ms" d="ms"><s>word</s>...</p>
  const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let match;
  while ((match = pRegex.exec(xml)) !== null) {
    const startMs = parseInt(match[1], 10);
    const inner = match[3];
    // Extract text from <s> tags
    let text = "";
    const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
    let sMatch;
    while ((sMatch = sRegex.exec(inner)) !== null) {
      text += sMatch[1];
    }
    // Fallback: strip all tags
    if (!text) {
      text = inner.replace(/<[^>]+>/g, "");
    }
    text = decodeEntities(text).trim();
    if (text) {
      results.push({ text, startSec: startMs / 1000 });
    }
  }
  if (results.length > 0) return results;

  // Classic format: <text start="s" dur="s">content</text>
  const textRegex = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
  while ((match = textRegex.exec(xml)) !== null) {
    const text = decodeEntities(match[3]);
    if (text) {
      results.push({
        text,
        startSec: parseFloat(match[1]),
      });
    }
  }
  return results;
}

/**
 * Strategy 1: InnerTube ANDROID client API
 * This is the primary approach used by youtube-transcript npm.
 * Uses ANDROID client context which returns full player data including captions.
 */
async function fetchViaInnerTube(
  videoId: string
): Promise<{ items: TranscriptItem[]; title: string } | null> {
  try {
    const resp = await fetch(INNERTUBE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": INNERTUBE_USER_AGENT,
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: INNERTUBE_CLIENT_VERSION,
          },
        },
        videoId,
      }),
    });

    if (!resp.ok) {
      console.log(`[${videoId}] InnerTube API returned ${resp.status}`);
      return null;
    }

    const data = await resp.json();
    const status = data?.playabilityStatus?.status;
    console.log(`[${videoId}] InnerTube status: ${status}`);

    const title = data?.videoDetails?.title || "YouTube Video";
    const captionTracks: CaptionTrack[] | undefined =
      data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!Array.isArray(captionTracks) || captionTracks.length === 0) {
      console.log(`[${videoId}] InnerTube: no caption tracks`);
      return null;
    }

    console.log(
      `[${videoId}] InnerTube: ${captionTracks.length} tracks, first: ${captionTracks[0].languageCode} (${captionTracks[0].kind || "manual"})`
    );

    // Pick best track (prefer English manual, then English ASR, then first)
    const track =
      captionTracks.find(
        (t) => t.languageCode.startsWith("en") && t.kind !== "asr"
      ) ||
      captionTracks.find(
        (t) => t.languageCode.startsWith("en") && t.kind === "asr"
      ) ||
      captionTracks.find((t) => t.languageCode.startsWith("en")) ||
      captionTracks[0];

    // Fetch the transcript XML
    const txResp = await fetch(track.baseUrl, {
      headers: { "User-Agent": WEB_USER_AGENT },
    });

    if (!txResp.ok) {
      console.log(`[${videoId}] Timedtext fetch returned ${txResp.status}`);
      return null;
    }

    const xml = await txResp.text();
    console.log(`[${videoId}] Timedtext XML length: ${xml.length}`);

    if (!xml || xml.length < 50) {
      console.log(`[${videoId}] Timedtext XML too short or empty`);
      return null;
    }

    const items = parseTranscriptXml(xml);
    console.log(`[${videoId}] Parsed ${items.length} transcript items`);

    return items.length > 0 ? { items, title } : null;
  } catch (e) {
    console.error(`[${videoId}] InnerTube error:`, e);
    return null;
  }
}

/**
 * Strategy 2: Web page scraping fallback
 * Scrapes ytInitialPlayerResponse from the YouTube watch page.
 */
async function fetchViaWebPage(
  videoId: string
): Promise<{ items: TranscriptItem[]; title: string } | null> {
  try {
    const resp = await fetch(
      `https://www.youtube.com/watch?v=${videoId}`,
      {
        headers: {
          "User-Agent": WEB_USER_AGENT,
          "Accept-Language": "en-US,en;q=0.9",
          Cookie:
            "SOCS=CAESEwgDEgk2ODE4NTkxNjQaAmVuIAEaBgiA_LyaBg; CONSENT=YES+cb.20210328-17-p0.en+FX+299",
        },
      }
    );

    if (!resp.ok) {
      console.log(`[${videoId}] Web page returned ${resp.status}`);
      return null;
    }

    const html = await resp.text();
    console.log(`[${videoId}] Web page HTML length: ${html.length}`);

    if (html.includes('class="g-recaptcha"')) {
      console.log(`[${videoId}] Web page: CAPTCHA detected`);
      return null;
    }

    // Extract title
    const titleMatch = html.match(/<title>([^<]*)<\/title>/);
    const title = titleMatch
      ? titleMatch[1].replace(" - YouTube", "").trim()
      : "YouTube Video";

    // Parse ytInitialPlayerResponse
    const startToken = "var ytInitialPlayerResponse = ";
    const startIndex = html.indexOf(startToken);
    if (startIndex === -1) {
      console.log(`[${videoId}] Web page: no ytInitialPlayerResponse`);
      return null;
    }

    const jsonStart = startIndex + startToken.length;
    let depth = 0;
    let jsonEnd = -1;
    for (let i = jsonStart; i < html.length; i++) {
      if (html[i] === "{") depth++;
      else if (html[i] === "}") {
        depth--;
        if (depth === 0) {
          jsonEnd = i + 1;
          break;
        }
      }
    }

    if (jsonEnd === -1) {
      console.log(`[${videoId}] Web page: couldn't parse player response JSON`);
      return null;
    }

    const playerResponse = JSON.parse(html.slice(jsonStart, jsonEnd));
    const captionTracks: CaptionTrack[] | undefined =
      playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!Array.isArray(captionTracks) || captionTracks.length === 0) {
      console.log(`[${videoId}] Web page: no caption tracks in player response`);
      return null;
    }

    console.log(`[${videoId}] Web page: ${captionTracks.length} caption tracks`);

    // Pick best track
    const track =
      captionTracks.find(
        (t) => t.languageCode.startsWith("en") && t.kind !== "asr"
      ) ||
      captionTracks.find((t) => t.languageCode.startsWith("en")) ||
      captionTracks[0];

    const txResp = await fetch(track.baseUrl, {
      headers: { "User-Agent": WEB_USER_AGENT },
    });

    if (!txResp.ok) {
      console.log(`[${videoId}] Web page timedtext returned ${txResp.status}`);
      return null;
    }

    const xml = await txResp.text();
    if (!xml || xml.length < 50) {
      console.log(`[${videoId}] Web page timedtext empty`);
      return null;
    }

    const items = parseTranscriptXml(xml);
    return items.length > 0 ? { items, title } : null;
  } catch (e) {
    console.error(`[${videoId}] Web page error:`, e);
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

  // Strategy 1: InnerTube ANDROID client (primary — same as youtube-transcript npm)
  console.log(`[${videoId}] Starting transcript fetch...`);
  let result = await fetchViaInnerTube(videoId);

  // Strategy 2: Web page scraping (fallback)
  if (!result) {
    console.log(`[${videoId}] InnerTube failed, trying web page fallback...`);
    result = await fetchViaWebPage(videoId);
  }

  if (!result || result.items.length === 0) {
    return NextResponse.json(
      {
        error:
          "Could not fetch captions for this video. Make sure the video has auto-generated or manual subtitles enabled.",
      },
      { status: 404 }
    );
  }

  console.log(
    `[${videoId}] Success! ${result.items.length} items, title: "${result.title}"`
  );

  const segments = groupIntoSegments(result.items);
  const lastSeg = segments[segments.length - 1];
  const estMinutes = Math.ceil((lastSeg?.time || 0) / 60);

  return NextResponse.json({
    videoId,
    title: result.title,
    speaker: "Unknown",
    date: new Date().toISOString().slice(0, 10),
    duration: `${estMinutes}m`,
    segments,
  });
}
