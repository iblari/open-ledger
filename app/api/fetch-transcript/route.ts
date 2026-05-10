import { NextResponse } from "next/server";

// Use Node.js runtime (default Vercel serverless)

/**
 * POST /api/fetch-transcript
 * Body: { url: string }
 *
 * Returns EITHER:
 *   { title, videoId, duration, segments: [{time, text}] }        — full transcript
 *   { clientFetch: true, videoId, title, captionUrl }              — client should fetch timedtext
 *   { error: "..." }                                               — unrecoverable error
 *
 * Architecture:
 * 1. Server tries InnerTube ANDROID client (forwarding client IP)
 * 2. If InnerTube returns captions → server fetches timedtext XML → returns segments
 * 3. If server can get caption URLs but timedtext fetch fails → returns URLs for client-side fetch
 * 4. If all server strategies fail → returns clientFetch signal for browser-based approach
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
 */
function parseTranscriptXml(xml: string): TranscriptItem[] {
  const results: TranscriptItem[] = [];

  // Try srv3 format: <p t="ms" d="ms"><s>word</s>...</p>
  const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let match;
  while ((match = pRegex.exec(xml)) !== null) {
    const startMs = parseInt(match[1], 10);
    const inner = match[3];
    let text = "";
    const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
    let sMatch;
    while ((sMatch = sRegex.exec(inner)) !== null) {
      text += sMatch[1];
    }
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

/** Pick the best English caption track from a list */
function pickBestTrack(tracks: CaptionTrack[]): CaptionTrack {
  return (
    tracks.find(
      (t) => t.languageCode.startsWith("en") && t.kind !== "asr"
    ) ||
    tracks.find(
      (t) => t.languageCode.startsWith("en") && t.kind === "asr"
    ) ||
    tracks.find((t) => t.languageCode.startsWith("en")) ||
    tracks[0]
  );
}

/**
 * Call InnerTube ANDROID client to get caption track URLs.
 * Forwards the real client IP via X-Forwarded-For to help bypass datacenter IP blocks.
 */
async function getInnerTubeData(
  videoId: string,
  clientIp?: string
): Promise<{
  title: string;
  captionTracks: CaptionTrack[];
} | null> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": INNERTUBE_USER_AGENT,
    };
    // Forward the real client IP — YouTube may use this instead of the server IP
    if (clientIp) {
      headers["X-Forwarded-For"] = clientIp;
    }

    const resp = await fetch(INNERTUBE_API_URL, {
      method: "POST",
      headers,
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

    return { title, captionTracks };
  } catch (e) {
    console.error(`[${videoId}] InnerTube error:`, e);
    return null;
  }
}

/**
 * Fetch and parse timedtext XML from a caption track URL.
 */
async function fetchTimedtext(
  videoId: string,
  baseUrl: string
): Promise<TranscriptItem[] | null> {
  try {
    const txResp = await fetch(baseUrl, {
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
    return items.length > 0 ? items : null;
  } catch (e) {
    console.error(`[${videoId}] Timedtext error:`, e);
    return null;
  }
}

/**
 * Strategy 2: Web page scraping fallback.
 * Returns caption tracks (not full transcript) so client can fetch if server timedtext fails.
 */
async function getWebPageCaptionTracks(
  videoId: string
): Promise<{ title: string; captionTracks: CaptionTrack[] } | null> {
  try {
    const resp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent": WEB_USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
        Cookie:
          "SOCS=CAESEwgDEgk2ODE4NTkxNjQaAmVuIAEaBgiA_LyaBg; CONSENT=YES+cb.20210328-17-p0.en+FX+299",
      },
    });

    if (!resp.ok) return null;

    const html = await resp.text();
    if (html.includes('class="g-recaptcha"')) return null;

    const titleMatch = html.match(/<title>([^<]*)<\/title>/);
    const title = titleMatch
      ? titleMatch[1].replace(" - YouTube", "").trim()
      : "YouTube Video";

    const startToken = "var ytInitialPlayerResponse = ";
    const startIndex = html.indexOf(startToken);
    if (startIndex === -1) return null;

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

    if (jsonEnd === -1) return null;

    const playerResponse = JSON.parse(html.slice(jsonStart, jsonEnd));
    const captionTracks: CaptionTrack[] | undefined =
      playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!Array.isArray(captionTracks) || captionTracks.length === 0) return null;

    return { title, captionTracks };
  } catch {
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

  // Extract client IP for forwarding to YouTube
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    undefined;
  console.log(`[${videoId}] Starting transcript fetch (client IP: ${clientIp || "unknown"})...`);

  // Strategy 1: InnerTube ANDROID client
  let trackData = await getInnerTubeData(videoId, clientIp);

  // Strategy 2: Web page scraping fallback
  if (!trackData) {
    console.log(`[${videoId}] InnerTube failed, trying web page fallback...`);
    trackData = await getWebPageCaptionTracks(videoId);
  }

  // If we have caption tracks, try to fetch the transcript server-side
  if (trackData && trackData.captionTracks.length > 0) {
    const track = pickBestTrack(trackData.captionTracks);

    // Try server-side timedtext fetch
    const items = await fetchTimedtext(videoId, track.baseUrl);

    if (items && items.length > 0) {
      // Full success — return complete transcript
      console.log(
        `[${videoId}] Server-side success! ${items.length} items, title: "${trackData.title}"`
      );
      const segments = groupIntoSegments(items);
      const lastSeg = segments[segments.length - 1];
      const estMinutes = Math.ceil((lastSeg?.time || 0) / 60);

      return NextResponse.json({
        videoId,
        title: trackData.title,
        speaker: "Unknown",
        date: new Date().toISOString().slice(0, 10),
        duration: `${estMinutes}m`,
        segments,
      });
    }

    // Server got caption URLs but timedtext fetch failed (IP blocked for content)
    // Return the signed URL so the CLIENT browser can fetch it (timedtext has CORS!)
    console.log(
      `[${videoId}] Server timedtext blocked — returning URL for client-side fetch`
    );
    return NextResponse.json({
      clientFetch: true,
      videoId,
      title: trackData.title,
      captionUrl: track.baseUrl,
    });
  }

  // Total server failure — tell client to try its own approach
  console.log(`[${videoId}] All server strategies failed — signaling client fallback`);
  return NextResponse.json(
    {
      clientFetch: true,
      videoId,
      title: "YouTube Video",
      captionUrl: null,
      error:
        "Server couldn't access captions. Your browser will attempt to load them directly.",
    },
    { status: 200 }
  );
}
