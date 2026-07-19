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

// Parse positional args + flags. Positionals stay in the original order so
// the manual-invocation README example still works:
//   node scripts/go-live.mjs <youtube-url> [title]
// Flags (any position):
//   --duration <seconds>   Auto-stop after N seconds. Used by the GitHub
//                           Action so a 90-minute event doesn't run forever.
//                           Without it, the script runs until ffmpeg exits
//                           (broadcaster ends stream) or Ctrl+C.
const rawArgs = process.argv.slice(2);
let durationSec = null;
let displayArg = null; // --display: what the SITE shows (YouTube URL/id, or "none")
const positionals = [];
for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i] === "--duration") {
    durationSec = Number(rawArgs[++i]);
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      console.error("ERROR: --duration must be a positive number of seconds");
      process.exit(1);
    }
  } else if (rawArgs[i] === "--display") {
    displayArg = rawArgs[++i] || "none";
  } else if (rawArgs[i].startsWith("--")) {
    console.error(`ERROR: unknown flag ${rawArgs[i]}`);
    process.exit(1);
  } else {
    positionals.push(rawArgs[i]);
  }
}
// Env var fallback for --duration so the GitHub Action can pass it cleanly
// without quoting issues. CLI flag takes precedence.
if (durationSec == null && process.env.LIVE_DURATION_SECONDS) {
  durationSec = Number(process.env.LIVE_DURATION_SECONDS);
  if (!Number.isFinite(durationSec) || durationSec <= 0) durationSec = null;
}

const YOUTUBE_URL = positionals[0];
const TITLE = positionals[1] || "Live Broadcast";

if (!YOUTUBE_URL) {
  console.error("Usage: node scripts/go-live.mjs <youtube-url> [title] [--duration <seconds>]");
  console.error("  e.g. node scripts/go-live.mjs https://youtube.com/watch?v=abc123 'Press Briefing'");
  console.error("  e.g. node scripts/go-live.mjs https://youtube.com/watch?v=abc123 'SOTU' --duration 5400");
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

// ── Source detection ────────────────────────────────────────────
//
// The pipeline is SOURCE-AGNOSTIC: the positional URL is whatever ffmpeg
// should listen to. YouTube URLs go through the yt-dlp ladder (bot-check
// mitigation and all); anything else — an HLS .m3u8, a radio/Icecast
// stream, any URL ffmpeg can read — is fed to ffmpeg directly, which
// entirely sidesteps the YouTube datacenter-IP problem for sources like
// C-SPAN Radio that simulcast most official events.
//
// What the SITE displays is a separate concern (--display):
//   --display <youtube-url-or-id>  embed that YouTube player
//   --display none                 "monitor mode": fact-check feed only
// Default: for YouTube sources, the same video; for direct streams, none.

function isYouTubeUrl(u) {
  return /(?:youtube\.com|youtu\.be)\//i.test(u) || /^[A-Za-z0-9_-]{11}$/.test(u.trim());
}

// ── Step 1: Resolve display + go live ──────────────────────────

const sourceIsYouTube = isYouTubeUrl(YOUTUBE_URL);
const videoId = displayArg
  ? (displayArg === "none" ? "" : extractVideoId(displayArg))
  : (sourceIsYouTube ? extractVideoId(YOUTUBE_URL) : "");
console.log(`\n📡 Vote Unbiased — Live Broadcast Pipeline`);
console.log(`   Video:    ${videoId}`);
console.log(`   Title:    ${TITLE}`);
console.log(`   API:      ${API_URL}`);
if (durationSec) {
  const mins = Math.round(durationSec / 60);
  console.log(`   Duration: ${mins} min (auto-stop)`);
}
console.log(``);

// ── Step 1: Get audio stream URL via yt-dlp ────────────────────
//
// ORDER MATTERS: extract audio BEFORE flipping the site to live. The old
// order set the site live first, so a yt-dlp failure (e.g. YouTube's
// "confirm you're not a bot" challenge on datacenter IPs) left the site
// stuck showing a phantom live card with a stale transcript.
//
// Bot-check mitigation: YouTube gates the default web client behind PO
// tokens on datacenter IPs (GitHub runners). The android/tv/ios players
// usually aren't gated — try a sequence of client configs before giving
// up. Extra args can be injected via YT_DLP_EXTRA_ARGS (space-separated,
// e.g. "--cookies /path/cookies.txt") without a code change.

function tryYtDlp(extraArgs) {
  return new Promise((resolve) => {
    // bestaudio/best: many LIVE streams expose only muxed (audio+video)
    // formats — audio-only "bestaudio" fails with "Requested format is not
    // available" (observed on the July 4th White House stream). The muxed
    // fallback is fine: ffmpeg extracts the audio track either way.
    // Prefer the HLS manifest (protocol m3u8*): ffmpeg follows a live HLS
    // playlist indefinitely. A progressive googlevideo URL on a LIVE stream
    // serves a finite window and then EOFs — observed killing the audio
    // chain ~4 minutes into every session ("Stream ends prematurely").
    // --print release_timestamp: the stream's ACTUAL start epoch. Every
    // transcript chunk and claim gets anchored to VIDEO time (seconds since
    // stream start) instead of worker time — so replays stay in sync even
    // when the worker joins late or the chain restarts mid-session.
    const args = [
      "-f", "bestaudio[protocol*=m3u8]/best[protocol*=m3u8]/bestaudio/best",
      "--print", "release_timestamp", "--print", "urls",
      ...extraArgs, YOUTUBE_URL,
    ];
    // YT_PROXY_URL (static-residential proxy) routes extraction around
    // YouTube's datacenter-IP bot-check — set it as a GitHub secret and
    // every attempt in the ladder uses it automatically.
    if (process.env.YT_PROXY_URL) args.unshift("--proxy", process.env.YT_PROXY_URL);
    const proc = spawn("yt-dlp", args);
    let out = "";
    let errText = "";
    proc.stdout.on("data", (d) => { out += d.toString(); });
    proc.stderr.on("data", (d) => { errText += d.toString(); });
    proc.on("error", () => resolve({ url: null, errText: "yt-dlp not installed (brew install yt-dlp)" }));
    proc.on("close", (code) => {
      const lines = out.split("\n").map(l => l.trim()).filter(Boolean);
      // Line order matches --print order: [release_timestamp, url]
      const ts = Number(lines[0]);
      const url = lines.find(l => /^https?:\/\//.test(l)) || null;
      resolve({
        url: code === 0 ? url : null,
        streamStartEpoch: Number.isFinite(ts) && ts > 1e9 ? ts : null,
        errText,
      });
    });
  });
}

// Stream's true start epoch (seconds) — set on first successful extraction.
// null = unknown (direct streams): fall back to worker-relative time.
let streamStartEpoch = null;

/** Run the yt-dlp client ladder once; returns a fresh stream URL or null.
 *  Called at startup AND on every chain restart — googlevideo URLs are
 *  proxy-IP-bound and can expire mid-session. */
async function extractAudioUrl() {
  if (!sourceIsYouTube) return YOUTUBE_URL; // direct streams need no extraction
  const userExtra = (process.env.YT_DLP_EXTRA_ARGS || "").split(/\s+/).filter(Boolean);
  const CLIENT_ATTEMPTS = [
    [],                                                        // default client
    ["--extractor-args", "youtube:player_client=android,tv"],
    ["--extractor-args", "youtube:player_client=ios"],
    ["--extractor-args", "youtube:player_client=tv_embedded"],
  ].map(a => [...userExtra, ...a]);
  for (const attempt of CLIENT_ATTEMPTS) {
    const label = attempt.length ? attempt.join(" ") : "(default client)";
    const { url, streamStartEpoch: ts, errText } = await tryYtDlp(attempt);
    if (url) {
      console.log(`  ✓ Got audio stream URL via ${label}${url.includes(".m3u8") || url.includes("/hls_") ? " (HLS manifest)" : " (progressive)"}`);
      if (ts && !streamStartEpoch) {
        streamStartEpoch = ts;
        console.log(`  ✓ Stream started ${new Date(ts * 1000).toISOString()} — timestamps anchored to video time`);
      }
      return url;
    }
    const firstErr = (errText.split("\n").find(l => l.includes("ERROR")) || errText.split("\n")[0] || "").trim();
    console.error(`  ✗ ${label}: ${firstErr.slice(0, 160)}`);
  }
  return null;
}

let audioUrl = null;
if (!sourceIsYouTube) {
  console.log("→ Direct stream source — skipping yt-dlp, ffmpeg will ingest it.");
  audioUrl = YOUTUBE_URL;
} else {
  // Pre-flight: verify the stream is ACTUALLY live before touching the site.
  // Stale discovery once pointed a worker at a briefing that had ended seven
  // hours earlier — yt-dlp happily extracts the VOD, and the site would have
  // shown a phantom "LIVE" card over a recording.
  console.log("→ Pre-flight: verifying stream is live...");
  const status = await new Promise((resolve) => {
    const args = ["--print", "live_status", YOUTUBE_URL];
    if (process.env.YT_PROXY_URL) args.unshift("--proxy", process.env.YT_PROXY_URL);
    const proc = spawn("yt-dlp", args);
    let out = "";
    proc.stdout.on("data", (d) => { out += d.toString(); });
    proc.on("error", () => resolve("unknown"));
    proc.on("close", () => resolve(out.trim() || "unknown"));
  });
  console.log(`  live_status: ${status}`);
  if (status === "was_live" || status === "not_live" || status === "post_live") {
    console.log("  Stream is not live — refusing to cover a recording. Exiting cleanly.");
    process.exit(0);
  }

  console.log("→ Extracting audio stream URL...");
  audioUrl = await extractAudioUrl();
  if (!audioUrl) {
    console.error("  ERROR: all yt-dlp client attempts failed. On a datacenter IP,");
    console.error("  YouTube may require cookies: set YT_DLP_EXTRA_ARGS='--cookies <file>'.");
    console.error("  TIP: if the event is simulcast on a direct stream (C-SPAN Radio, an");
    console.error("  HLS .m3u8), pass THAT as the source URL — no extraction needed.");
    process.exit(1);
  }
}

// ── Step 2: Set the site LIVE (only now that we have audio) ────

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

// From here on, ANY exit — crash, rejection — must flip the site back to
// off, or viewers see a phantom live card until the next successful run.
let siteStopped = false;
async function emergencyStop(reason) {
  if (siteStopped) return;
  siteStopped = true;
  try {
    await adminCall("/api/admin/go-live", { action: "stop" });
    console.log(`\n✓ Site set to OFF (${reason})`);
  } catch (e) {
    console.error("  WARNING: failed to stop site:", e?.message || e);
  }
}
process.on("uncaughtException", async (e) => {
  console.error("UNCAUGHT:", e);
  await emergencyStop("uncaught exception");
  process.exit(1);
});
process.on("unhandledRejection", async (e) => {
  console.error("UNHANDLED REJECTION:", e);
  await emergencyStop("unhandled rejection");
  process.exit(1);
});

// ── Step 3+4: SUPERVISED audio → transcription chain ────────────────
//
// The old implementation built the chain once (extract → Deepgram → ffmpeg)
// and had no supervision: when the stream URL EOF'd (~4 min on progressive
// live URLs) or the proxy hiccuped, ffmpeg exited, Deepgram closed, and the
// worker sat idle for the rest of its 3-hour window — every session since
// launch captured only the first few minutes. Now each death of the chain
// triggers a fresh URL extraction and a rebuild, with a circuit breaker so
// a genuinely-ended stream doesn't loop forever.

function dgUrlFor(model) {
  return `wss://api.deepgram.com/v1/listen?` +
    `encoding=linear16&sample_rate=16000&channels=1&` +
    `model=${model}&language=en&smart_format=true&` +
    `interim_results=false&punctuate=true`;
}

function connectDeepgram(models) {
  return new Promise((resolve, reject) => {
    const tryNext = (i) => {
      if (i >= models.length) return reject(new Error("all Deepgram models rejected"));
      const model = models[i];
      const ws = new WebSocket(dgUrlFor(model), {
        headers: { Authorization: `Token ${DEEPGRAM_KEY}` },
      });
      let settled = false;
      ws.on("open", () => { settled = true; console.log(`  ✓ Deepgram connected (model=${model})`); resolve(ws); });
      ws.on("unexpected-response", (_req, res) => {
        let body = "";
        res.on("data", (d) => { body += d; });
        res.on("end", () => {
          console.error(`  ✗ Deepgram ${model}: HTTP ${res.statusCode} — ${body.slice(0, 300)}`);
          if (!settled) { settled = true; tryNext(i + 1); }
        });
      });
      ws.on("error", (err) => {
        if (!settled) { settled = true; console.error(`  ✗ Deepgram ${model}:`, err.message); tryNext(i + 1); }
      });
    };
    tryNext(0);
  });
}

// Session-scoped state: videoTime stays continuous across chain restarts
// because startTime is set exactly once.
const startTime = Date.now();
let transcriptBuffer = "";
let lastIngestTime = Date.now();
let totalClaims = 0;
let sessionEnded = false;
let currentFfmpeg = null;
let currentWs = null;
let lastTranscriptAt = Date.now();

// ── Silence watchdog ──
// "Process running" is not "pipeline working": every pre-fix session died
// silently minutes in while the workflow stayed green. 10 minutes without
// a single word → tear the chain down (supervisor rebuilds with a fresh
// URL). 45 minutes of total silence → exit non-zero so the workflow run
// goes RED and the failure is visible.
setInterval(() => {
  if (sessionEnded || shuttingDown) return;
  const quietMs = Date.now() - lastTranscriptAt;
  if (quietMs > 45 * 60 * 1000) {
    console.error("🚨 45 minutes without any transcript — failing loudly.");
    shutdown("silence watchdog: 45min without transcript", 7);
  } else if (quietMs > 10 * 60 * 1000) {
    console.error(`⚠️  ${Math.round(quietMs / 60000)} min without transcript — forcing chain rebuild.`);
    try { currentFfmpeg?.kill("SIGKILL"); } catch { /* fine */ }
    try { currentWs?.close(); } catch { /* fine */ }
    lastTranscriptAt = Date.now() - 5 * 60 * 1000; // half-reset: escalate if still dead
  }
}, 60 * 1000).unref?.();

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Speech reaching us NOW was spoken roughly this many seconds ago
// (HLS live-edge distance + STT buffering). Tunable via env.
const LIVE_LATENCY_S = Number(process.env.LIVE_LATENCY_S || 12);

function currentVideoTime(nowMs) {
  if (streamStartEpoch) {
    return Math.max(0, Math.floor(nowMs / 1000 - streamStartEpoch - LIVE_LATENCY_S));
  }
  return Math.floor((nowMs - startTime) / 1000); // fallback: worker-relative
}

function ingestBufferedChunk(force = false) {
  const now = Date.now();
  if (!force && now - lastIngestTime < INGEST_INTERVAL) return;
  if (transcriptBuffer.trim().length < 30) return;
  lastIngestTime = now;
  const chunk = transcriptBuffer.trim();
  transcriptBuffer = "";
  const videoTime = currentVideoTime(now);
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

const INGEST_INTERVAL = 15000; // 15 seconds

/** Build one audio→STT chain and resolve when any part of it dies. */
async function runChain(url) {
  const dgWs = await connectDeepgram(["nova-3", "nova-2", "base"]);
  currentWs = dgWs;

  dgWs.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "Results" && msg.channel?.alternatives?.[0]) {
        const transcript = msg.channel.alternatives[0].transcript;
        if (transcript) {
          lastTranscriptAt = Date.now();
          transcriptBuffer += " " + transcript;
          process.stdout.write(`   📝 ${transcript}\n`);
          ingestBufferedChunk();
        }
      }
    } catch { /* ignore parse errors */ }
  });
  dgWs.on("error", (err) => console.error("Deepgram error:", err.message));

  // Audio download must ALSO go through the proxy when one is set: YouTube
  // binds stream URLs to the requesting IP.
  const ffmpeg = spawn("ffmpeg", [
    ...(process.env.YT_PROXY_URL && /^https?:/i.test(url)
      ? ["-http_proxy", process.env.YT_PROXY_URL]
      : []),
    // Aggressive reconnect flags: survive transient TLS/proxy hiccups on
    // long-lived live streams without tearing the whole chain down.
    ...(/^https?:/i.test(url)
      ? ["-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "10"]
      : []),
    "-i", url,
    "-f", "s16le",
    "-acodec", "pcm_s16le",
    "-ar", "16000",
    "-ac", "1",
    "-loglevel", "error",
    "pipe:1",
  ]);
  currentFfmpeg = ffmpeg;

  ffmpeg.stdout.on("data", (chunk) => {
    if (dgWs.readyState === WebSocket.OPEN) dgWs.send(chunk);
  });
  ffmpeg.stderr.on("data", (d) => {
    const msg = d.toString().trim();
    if (msg) console.error("  ffmpeg:", msg);
  });

  // Resolve when EITHER side dies; the supervisor decides what to do next.
  await new Promise((resolve) => {
    let done = false;
    const finish = (why) => {
      if (done) return;
      done = true;
      console.log(`\n⚠️  Chain down: ${why}`);
      try { ffmpeg.kill("SIGKILL"); } catch { /* already dead */ }
      try { dgWs.close(); } catch { /* already closed */ }
      resolve(undefined);
    };
    ffmpeg.on("close", (code) => finish(`ffmpeg exited (code ${code})`));
    ffmpeg.on("error", (e) => finish(`ffmpeg error: ${e.message}`));
    dgWs.on("close", () => finish("Deepgram socket closed"));
  });
}

// ── Graceful shutdown ────────────────────────────────────────────

let shuttingDown = false;
async function shutdown(reason = "signal", exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  sessionEnded = true;
  console.log(`\n\n⏹️  Stopping broadcast (${reason})...`);
  ingestBufferedChunk(true); // flush the tail
  await sleep(1500);         // let the flush POST land
  await adminCall("/api/admin/go-live", { action: "stop" }).catch(() => {});
  console.log("  ✓ Site is now OFF");
  console.log(`  Total claims fact-checked: ${totalClaims}`);
  console.log(`  Duration: ${Math.floor((Date.now() - startTime) / 60000)} minutes\n`);
  try { currentFfmpeg?.kill("SIGTERM"); } catch { /* fine */ }
  try { currentWs?.close(); } catch { /* fine */ }
  process.exit(exitCode);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

if (durationSec != null) {
  setTimeout(() => shutdown(`reached --duration of ${durationSec}s`), durationSec * 1000);
}

// ── Supervisor loop ──────────────────────────────────────────────

console.log("🎙️  LIVE — transcribing and fact-checking in real-time...\n");

let restarts = 0;
const deaths = []; // wall-clock ms of recent chain deaths (circuit breaker)

let chainUrl = audioUrl;
for (;;) {
  const chainStart = Date.now();
  try {
    await runChain(chainUrl);
  } catch (e) {
    console.error("  Chain build failed:", e.message);
  }
  if (sessionEnded || shuttingDown) break;

  // Circuit breaker: 6 deaths inside 15 minutes, each after <90s of life,
  // means the stream is over (or unreachable) — stop cleanly instead of
  // burning restarts against a dead stream.
  const lifetime = Date.now() - chainStart;
  const now = Date.now();
  deaths.push(now);
  while (deaths.length && now - deaths[0] > 15 * 60 * 1000) deaths.shift();
  if (deaths.length >= 6 && lifetime < 90 * 1000) {
    console.log("  Stream appears to have ended (repeated rapid chain deaths).");
    break;
  }

  restarts++;
  console.log(`  ↻ Restarting audio chain (restart #${restarts}) in 5s — re-extracting stream URL...`);
  await sleep(5000);
  const fresh = await extractAudioUrl();
  if (fresh) {
    chainUrl = fresh;
  } else {
    console.error("  Re-extraction failed — retrying the previous URL.");
  }
}

await shutdown("stream ended");
