#!/usr/bin/env node

/**
 * go-live.mjs — Live Broadcast Pipeline for Vote Unbiased
 *
 * Run this on your local machine when a press conference or speech starts.
 * It captures audio from a YouTube stream, transcribes it via Deepgram in
 * real-time, and sends transcript chunks to your server for AI fact-checking.
 *
 * PREREQUISITES:
 *   1. Install yt-dlp:  brew install yt-dlp   (or pip install yt-dlp)
 *   2. Install ffmpeg:  brew install ffmpeg
 *   3. Set env vars (or pass as args):
 *      - DEEPGRAM_API_KEY   (free at deepgram.com)
 *      - ADMIN_KEY          (same key set in Vercel env vars)
 *      - API_URL            (default: https://voteunbiased.org)
 *
 * USAGE:
 *   node scripts/go-live.mjs "https://youtube.com/watch?v=VIDEO_ID" "White House Press Briefing"
 *
 *   # Or with env vars:
 *   DEEPGRAM_API_KEY=xxx ADMIN_KEY=yyy node scripts/go-live.mjs URL TITLE
 *
 * WHAT HAPPENS:
 *   1. Calls /api/admin/go-live to set the site to "live" mode
 *   2. Uses yt-dlp to extract the audio stream URL
 *   3. Pipes audio through ffmpeg → raw PCM → Deepgram WebSocket
 *   4. Deepgram returns transcript text in real-time
 *   5. Every ~15 seconds of text, sends a chunk to /api/admin/ingest
 *   6. Server fact-checks via Claude and stores results
 *   7. Users on /live see claims appear in real-time (via polling)
 *
 *   Press Ctrl+C to stop. It will call /api/admin/go-live with action "stop".
 */

import { spawn } from "child_process";
import WebSocket from "ws";

// ── Config ──────────────────────────────────────────────────────

const DEEPGRAM_KEY = process.env.DEEPGRAM_API_KEY;
const ADMIN_KEY = process.env.ADMIN_KEY;
const API_URL = process.env.API_URL || "https://voteunbiased.org";

const YOUTUBE_URL = process.argv[2];
const TITLE = process.argv[3] || "Live Broadcast";

if (!YOUTUBE_URL) {
  console.error("Usage: node scripts/go-live.mjs <youtube-url> [title]");
  console.error("  e.g. node scripts/go-live.mjs https://youtube.com/watch?v=abc123 'Press Briefing'");
  process.exit(1);
}

if (!DEEPGRAM_KEY) {
  console.error("ERROR: Set DEEPGRAM_API_KEY env var (free at deepgram.com)");
  process.exit(1);
}

if (!ADMIN_KEY) {
  console.error("ERROR: Set ADMIN_KEY env var (same key as in your Vercel env)");
  process.exit(1);
}

// ── Helpers ─────────────────────────────────────────────────────

async function adminCall(endpoint, body) {
  const resp = await fetch(`${API_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ADMIN_KEY}`,
    },
    body: JSON.stringify(body),
  });
  return resp.json();
}

function extractVideoId(url) {
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/live\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return url.trim();
}

// ── Step 1: Go live ─────────────────────────────────────────────

const videoId = extractVideoId(YOUTUBE_URL);
console.log(`\n📡 Vote Unbiased — Live Broadcast Pipeline`);
console.log(`   Video: ${videoId}`);
console.log(`   Title: ${TITLE}`);
console.log(`   API:   ${API_URL}`);
console.log(``);

console.log("→ Setting site to LIVE...");
const goLiveResp = await adminCall("/api/admin/go-live", {
  action: "start",
  videoId,
  title: TITLE,
  source: "youtube",
});
if (goLiveResp.error) {
  console.error("  ERROR:", goLiveResp.error);
  process.exit(1);
}
console.log("  ✓ Site is now LIVE");

// ── Step 2: Get audio stream URL via yt-dlp ────────────────────

console.log("→ Extracting audio stream URL...");
const ytdlp = spawn("yt-dlp", [
  "-f", "bestaudio",
  "--get-url",
  YOUTUBE_URL,
]);

let audioUrl = "";
ytdlp.stdout.on("data", (d) => { audioUrl += d.toString().trim(); });
ytdlp.stderr.on("data", (d) => {
  const msg = d.toString().trim();
  if (msg && !msg.startsWith("[")) console.error("  yt-dlp:", msg);
});

await new Promise((resolve, reject) => {
  ytdlp.on("close", (code) => {
    if (code !== 0 || !audioUrl) {
      console.error("  ERROR: yt-dlp failed. Is it installed? (brew install yt-dlp)");
      reject(new Error("yt-dlp failed"));
    } else {
      console.log("  ✓ Got audio stream URL");
      resolve(undefined);
    }
  });
});

// ── Step 3: Connect to Deepgram ─────────────────────────────────

console.log("→ Connecting to Deepgram...");

const dgUrl = `wss://api.deepgram.com/v1/listen?` +
  `encoding=linear16&sample_rate=16000&channels=1&` +
  `model=nova-2&language=en&smart_format=true&` +
  `interim_results=false&utterance_end_ms=1500&` +
  `punctuate=true`;

const dgWs = new WebSocket(dgUrl, {
  headers: { Authorization: `Token ${DEEPGRAM_KEY}` },
});

let startTime = Date.now();
let transcriptBuffer = "";
let lastIngestTime = Date.now();
const INGEST_INTERVAL = 15000; // 15 seconds
let totalClaims = 0;

dgWs.on("open", () => {
  console.log("  ✓ Deepgram connected\n");
  console.log("🎙️  LIVE — transcribing and fact-checking in real-time...");
  console.log("   Press Ctrl+C to stop.\n");
  startTime = Date.now();
  lastIngestTime = Date.now();
});

dgWs.on("message", async (data) => {
  try {
    const msg = JSON.parse(data.toString());
    if (msg.type === "Results" && msg.channel?.alternatives?.[0]) {
      const transcript = msg.channel.alternatives[0].transcript;
      if (transcript) {
        transcriptBuffer += " " + transcript;
        // Print transcript in real-time
        process.stdout.write(`   📝 ${transcript}\n`);

        // Send to server every ~15 seconds
        const now = Date.now();
        if (now - lastIngestTime >= INGEST_INTERVAL && transcriptBuffer.trim().length >= 30) {
          lastIngestTime = now;
          const chunk = transcriptBuffer.trim();
          transcriptBuffer = "";
          const videoTime = Math.floor((now - startTime) / 1000);

          // Fire and forget — don't block the transcript flow
          adminCall("/api/admin/ingest", { text: chunk, videoTime })
            .then((resp) => {
              if (resp.claims?.length > 0) {
                totalClaims += resp.claims.length;
                for (const c of resp.claims) {
                  const emoji = c.rating === "TRUE" ? "✅" :
                    c.rating === "MOSTLY TRUE" ? "🟢" :
                    c.rating === "MISLEADING" ? "🟡" :
                    c.rating === "FALSE" ? "🔴" : "⚪";
                  console.log(`\n   ${emoji} ${c.rating}: "${c.quote}"`);
                  console.log(`      Data: ${c.actual}`);
                }
                console.log(`   [${totalClaims} total claims]\n`);
              }
            })
            .catch((e) => console.error("   Ingest error:", e.message));
        }
      }
    }
  } catch {
    // ignore parse errors
  }
});

dgWs.on("error", (err) => {
  console.error("Deepgram error:", err.message);
});

dgWs.on("close", () => {
  console.log("\nDeepgram connection closed.");
});

// ── Step 4: Pipe audio through ffmpeg → Deepgram ───────────────

// Wait for WebSocket to open
await new Promise((resolve) => {
  if (dgWs.readyState === WebSocket.OPEN) resolve(undefined);
  else dgWs.on("open", resolve);
});

const ffmpeg = spawn("ffmpeg", [
  "-i", audioUrl,
  "-f", "s16le",        // raw PCM
  "-acodec", "pcm_s16le",
  "-ar", "16000",        // 16kHz sample rate
  "-ac", "1",            // mono
  "-loglevel", "error",
  "pipe:1",              // output to stdout
]);

ffmpeg.stdout.on("data", (chunk) => {
  if (dgWs.readyState === WebSocket.OPEN) {
    dgWs.send(chunk);
  }
});

ffmpeg.stderr.on("data", (d) => {
  const msg = d.toString().trim();
  if (msg) console.error("  ffmpeg:", msg);
});

ffmpeg.on("close", (code) => {
  console.log(`\nffmpeg exited with code ${code}`);
  dgWs.close();
});

// ── Graceful shutdown ───────────────────────────────────────────

async function shutdown() {
  console.log("\n\n⏹️  Stopping broadcast...");

  // Send any remaining transcript
  if (transcriptBuffer.trim().length >= 30) {
    const videoTime = Math.floor((Date.now() - startTime) / 1000);
    await adminCall("/api/admin/ingest", {
      text: transcriptBuffer.trim(),
      videoTime,
    }).catch(() => {});
  }

  // Set site to off
  await adminCall("/api/admin/go-live", { action: "stop" }).catch(() => {});

  console.log("  ✓ Site is now OFF");
  console.log(`  Total claims fact-checked: ${totalClaims}`);
  console.log(`  Duration: ${Math.floor((Date.now() - startTime) / 60000)} minutes\n`);

  ffmpeg.kill("SIGTERM");
  dgWs.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
