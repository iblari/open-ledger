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
 * Pure fetch()-based, Edge Runtime compatible.
 * Strategy:
 * 1. Call YouTube innertube /player API to get caption track URLs
 * 2. Fetch timed text from the caption URL (json3 or XML)
 * 3. Group into ~15s segments
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

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
  name?: { simpleText?: string };
}

/**
 * Use YouTube's innertube /player API to get caption track URLs.
 * This doesn't require scraping HTML — it's a direct API call.
 */
async function getPlayerCaptionTracks(
  videoId: string
): Promise<{ tracks: CaptionTrack[]; title: string } | null> {
  // Try multiple client configurations
  const clients = [
    {
      clientName: "WEB",
      clientVersion: "2.20241126.01.00",
      apiKey: "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
    },
    {
      clientName: "ANDROID",
      clientVersion: "19.29.37",
      apiKey: "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w",
    },
    {
      clientName: "IOS",
      clientVersion: "19.29.1",
      apiKey: "AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc",
    },
  ];

  for (const client of clients) {
    try {
      const payload: Record<string, unknown> = {
        videoId,
        context: {
          client: {
            clientName: client.clientName,
            clientVersion: client.clientVersion,
            hl: "en",
            gl: "US",
          },
        },
      };

      // Android client needs additional params
      if (client.clientName === "ANDROID") {
        (payload.context as Record<string, unknown>).client = {
          ...(payload.context as Record<string, Record<string, unknown>>).client,
          androidSdkVersion: 30,
          osName: "Android",
          osVersion: "11",
          platform: "MOBILE",
        };
      }

      const res = await fetch(
        `https://www.youtube.com/youtubei/v1/player?key=${client.apiKey}&prettyPrint=false`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent":
              client.clientName === "ANDROID"
                ? "com.google.android.youtube/19.29.37 (Linux; U; Android 11) gzip"
                : BROWSER_UA,
          },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        console.log(`Player API (${client.clientName}) returned ${res.status}`);
        continue;
      }

      const data = await res.json();
      const title =
        data?.videoDetails?.title || "YouTube Video";
      const captionTracks =
        data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

      if (captionTracks && Array.isArray(captionTracks) && captionTracks.length > 0) {
        console.log(
          `Player API (${client.clientName}): found ${captionTracks.length} caption tracks`
        );
        return { tracks: captionTracks, title };
      }

      console.log(
        `Player API (${client.clientName}): no caption tracks in response`
      );
    } catch (e) {
      console.error(`Player API (${client.clientName}) error:`, e);
    }
  }

  return null;
}

/** Pick the best caption track (prefer English manual) */
function pickBestTrack(tracks: CaptionTrack[]): CaptionTrack {
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

/** Fetch captions as JSON3 format */
async function fetchCaptionsJson3(
  baseUrl: string
): Promise<CaptionLine[] | null> {
  try {
    const url = baseUrl + (baseUrl.includes("?") ? "&" : "?") + "fmt=json3";
    const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA } });
    if (!res.ok) {
      console.log("JSON3 fetch status:", res.status);
      return null;
    }

    const text = await res.text();
    if (!text || text.length < 10) {
      console.log("JSON3 response too short:", text.length);
      return null;
    }

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

/** Fetch captions as XML (srv3 or default) */
async function fetchCaptionsXml(
  baseUrl: string
): Promise<CaptionLine[] | null> {
  try {
    const res = await fetch(baseUrl, {
      headers: { "User-Agent": BROWSER_UA },
    });
    if (!res.ok) return null;

    const xml = await res.text();
    if (!xml || xml.length < 10) return null;

    const captions: CaptionLine[] = [];
    let match;

    // Try <text start="..." dur="...">content</text> format
    const textRegex = /<text\s+start="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
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

    // Try <p t="ms" d="ms">content</p> format (srv3)
    if (captions.length === 0) {
      const pRegex = /<p\s+t="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
      while ((match = pRegex.exec(xml)) !== null) {
        const startMs = parseInt(match[1], 10);
        const rawText = match[2].replace(/<[^>]+>/g, "").trim();
        if (rawText) {
          captions.push({
            text: decodeEntities(rawText),
            startSec: startMs / 1000,
          });
        }
      }
    }

    return captions.length > 0 ? captions : null;
  } catch (e) {
    console.error("XML caption fetch failed:", e);
    return null;
  }
}

/**
 * Fallback: scrape YouTube watch page for captionTracks
 */
async function fetchViaPageScrape(videoId: string): Promise<{
  tracks: CaptionTrack[];
  title: string;
} | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/watch?v=${videoId}&hl=en`,
      {
        headers: {
          "User-Agent": BROWSER_UA,
          "Accept-Language": "en-US,en;q=0.9",
          Cookie:
            "SOCS=CAESEwgDEgk2ODE4NTkxNjQaAmVuIAEaBgiA_LyaBg; CONSENT=YES+cb.20210328-17-p0.en+FX+299",
        },
      }
    );
    if (!res.ok) return null;

    const html = await res.text();
    console.log(`Watch page HTML length: ${html.length}`);

    // Extract title
    const titleMatch = html.match(/<title>([^<]*)<\/title>/);
    const title = titleMatch
      ? titleMatch[1].replace(" - YouTube", "").trim()
      : "YouTube Video";

    // Try to find captionTracks
    const patterns = [
      /"captionTracks"\s*:\s*(\[[\s\S]*?\])\s*,\s*"/,
      /"captionTracks"\s*:\s*(\[.*?\])/,
    ];

    for (const pattern of patterns) {
      const m = html.match(pattern);
      if (m) {
        try {
          const tracks = JSON.parse(m[1]);
          if (Array.isArray(tracks) && tracks.length > 0) {
            console.log(`Page scrape: found ${tracks.length} caption tracks`);
            return { tracks, title };
          }
        } catch {
          continue;
        }
      }
    }

    console.log("Page scrape: no captionTracks found in HTML");
    return null;
  } catch (e) {
    console.error("Page scrape failed:", e);
    return null;
  }
}

/**
 * Innertube get_transcript endpoint (returns transcript segments directly)
 */
async function fetchViaGetTranscript(
  videoId: string
): Promise<CaptionLine[] | null> {
  try {
    // Construct the protobuf params for get_transcript
    // This encodes the video ID in the format YouTube expects
    const innerBytes = `\n\x0b${videoId}`;
    const outerBytes = `\n\r${innerBytes}\x12\x00\x18\x01`;
    const params = btoa(outerBytes);

    const res = await fetch(
      "https://www.youtube.com/youtubei/v1/get_transcript?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8&prettyPrint=false",
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
              clientVersion: "2.20241126.01.00",
              hl: "en",
              gl: "US",
            },
          },
          params,
        }),
      }
    );

    if (!res.ok) {
      console.log("get_transcript status:", res.status);
      return null;
    }

    const data = await res.json();

    // Navigate the deeply nested response
    const body =
      data?.actions?.[0]?.updateEngagementPanelAction?.content
        ?.transcriptRenderer?.content?.transcriptSearchPanelRenderer?.body
        ?.transcriptSegmentListRenderer?.initialSegments;

    if (!body || !Array.isArray(body)) {
      console.log("get_transcript: no segments in response");
      return null;
    }

    const captions: CaptionLine[] = [];
    for (const seg of body) {
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

    console.log(`get_transcript: found ${captions.length} segments`);
    return captions.length > 0 ? captions : null;
  } catch (e) {
    console.error("get_transcript failed:", e);
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

  let captions: CaptionLine[] | null = null;
  let title = "YouTube Video";

  // Strategy 1: Innertube /player API → get caption track URLs → fetch captions
  console.log(`[${videoId}] Trying innertube /player API...`);
  const playerResult = await getPlayerCaptionTracks(videoId);
  if (playerResult && playerResult.tracks.length > 0) {
    title = playerResult.title;
    const track = pickBestTrack(playerResult.tracks);
    console.log(
      `[${videoId}] Using track: ${track.languageCode} (${track.kind || "manual"})`
    );

    // Try JSON3 first, then XML
    captions = await fetchCaptionsJson3(track.baseUrl);
    if (!captions) {
      console.log(`[${videoId}] JSON3 failed, trying XML...`);
      captions = await fetchCaptionsXml(track.baseUrl);
    }
  }

  // Strategy 2: Innertube get_transcript endpoint (returns text directly)
  if (!captions) {
    console.log(`[${videoId}] Trying innertube /get_transcript...`);
    captions = await fetchViaGetTranscript(videoId);
  }

  // Strategy 3: Page scrape fallback
  if (!captions) {
    console.log(`[${videoId}] Trying page scrape fallback...`);
    const scrapeResult = await fetchViaPageScrape(videoId);
    if (scrapeResult && scrapeResult.tracks.length > 0) {
      title = scrapeResult.title;
      const track = pickBestTrack(scrapeResult.tracks);
      captions = await fetchCaptionsJson3(track.baseUrl);
      if (!captions) {
        captions = await fetchCaptionsXml(track.baseUrl);
      }
    }
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

  console.log(
    `[${videoId}] Success! ${captions.length} caption lines, title: "${title}"`
  );

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
