#!/usr/bin/env node

/**
 * detect-preroll.mjs — Detect pre-roll offset for a YouTube video
 *
 * Given a YouTube video ID and the first words of the speech, this script:
 * 1. Downloads the first 5 minutes of audio via yt-dlp
 * 2. Sends it to Deepgram for transcription with word-level timestamps
 * 3. Searches for the first occurrence of the given words
 * 4. Returns the timestamp offset (in seconds)
 *
 * Usage:
 *   node scripts/detect-preroll.mjs <youtubeId> "<first 5-7 words>"
 *
 * Requires:
 *   - yt-dlp (brew install yt-dlp)
 *   - ffmpeg (brew install ffmpeg)
 *   - DEEPGRAM_API_KEY env var
 */

import { spawn } from "child_process";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const DEEPGRAM_KEY = process.env.DEEPGRAM_API_KEY;
const youtubeId = process.argv[2];
const firstWords = process.argv[3];

if (!youtubeId || !firstWords) {
  console.error('Usage: node scripts/detect-preroll.mjs <youtubeId> "<first 5-7 words>"');
  process.exit(1);
}

if (!DEEPGRAM_KEY) {
  console.error("ERROR: Set DEEPGRAM_API_KEY env var");
  process.exit(1);
}

const YOUTUBE_URL = `https://www.youtube.com/watch?v=${youtubeId}`;
const tmpWav = join(tmpdir(), `preroll-detect-${youtubeId}-${Date.now()}.wav`);

// ── Step 1: Download first 5 minutes of audio ──────────────────────

console.error(`→ Downloading first 5 minutes of audio for ${youtubeId}...`);

await new Promise((resolve, reject) => {
  // Use yt-dlp + ffmpeg to extract first 300s as 16kHz mono WAV
  const proc = spawn("bash", ["-c", `
    yt-dlp -f "bestaudio" --get-url "${YOUTUBE_URL}" 2>/dev/null | head -1 | xargs -I{} ffmpeg -i "{}" -t 300 -ar 16000 -ac 1 -f wav "${tmpWav}" -y -loglevel error
  `]);

  proc.stderr.on("data", (d) => {
    const msg = d.toString().trim();
    if (msg) console.error("  ", msg);
  });

  proc.on("close", (code) => {
    if (code !== 0 || !existsSync(tmpWav)) {
      reject(new Error(`yt-dlp/ffmpeg failed with code ${code}`));
    } else {
      resolve(undefined);
    }
  });
});

const audioSize = readFileSync(tmpWav).length;
console.error(`  ✓ Audio downloaded (${(audioSize / 1024 / 1024).toFixed(1)} MB)`);

// ── Step 2: Send to Deepgram ────────────────────────────────────────

console.error("→ Transcribing via Deepgram nova-2...");

const audioBuffer = readFileSync(tmpWav);

const dgResp = await fetch(
  "https://api.deepgram.com/v1/listen?" +
    "model=nova-2&language=en&punctuate=true&" +
    "smart_format=true&utterances=true&" +
    "encoding=linear16&sample_rate=16000&channels=1",
  {
    method: "POST",
    headers: {
      Authorization: `Token ${DEEPGRAM_KEY}`,
      "Content-Type": "audio/wav",
    },
    body: audioBuffer,
  }
);

if (!dgResp.ok) {
  const err = await dgResp.text();
  console.error("Deepgram error:", dgResp.status, err);
  process.exit(1);
}

const dgData = await dgResp.json();
const words = dgData.results?.channels?.[0]?.alternatives?.[0]?.words || [];

console.error(`  ✓ Transcribed ${words.length} words`);

// ── Step 3: Search for first words ──────────────────────────────────

// Normalize tokens
function normalizeTokens(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

const searchTokens = normalizeTokens(firstWords);
const wordTokens = words.map((w) => w.word.toLowerCase().replace(/[^\w]/g, ""));

console.error(`→ Searching for: "${firstWords}" (${searchTokens.length} tokens)`);

// Need at least 4 consecutive matching tokens
const MIN_CONSECUTIVE = Math.min(4, searchTokens.length);
let bestIdx = -1;
let bestConsecutive = 0;
let bestMatchRate = 0;

for (let i = 0; i <= wordTokens.length - MIN_CONSECUTIVE; i++) {
  let consecutive = 0;
  let matches = 0;
  const windowSize = Math.min(searchTokens.length, wordTokens.length - i);

  for (let j = 0; j < windowSize; j++) {
    if (wordTokens[i + j] === searchTokens[j]) {
      matches++;
      consecutive++;
    } else {
      if (consecutive >= MIN_CONSECUTIVE && bestConsecutive < consecutive) {
        // Already found a good match, don't reset
      }
      consecutive = 0;
    }
  }

  const matchRate = matches / searchTokens.length;

  // Accept if we have at least MIN_CONSECUTIVE consecutive AND decent overall match
  const maxConsecutiveInWindow = Math.max(consecutive, (() => {
    let mc = 0, c = 0;
    for (let j = 0; j < windowSize; j++) {
      if (wordTokens[i + j] === searchTokens[j]) { c++; mc = Math.max(mc, c); }
      else { c = 0; }
    }
    return mc;
  })());

  if (maxConsecutiveInWindow >= MIN_CONSECUTIVE && matchRate > bestMatchRate) {
    bestMatchRate = matchRate;
    bestConsecutive = maxConsecutiveInWindow;
    bestIdx = i;
  }
}

// Cleanup temp file
try { unlinkSync(tmpWav); } catch {}

if (bestIdx === -1) {
  console.error("  ✗ Could not find matching words in transcript");
  console.error("  First 20 transcribed words:", wordTokens.slice(0, 20).join(" "));
  process.exit(1);
}

const offset = Math.round(words[bestIdx].start * 10) / 10;
const matchedText = words
  .slice(bestIdx, bestIdx + searchTokens.length)
  .map((w) => w.punctuated_word || w.word)
  .join(" ");
const avgConfidence =
  words.slice(bestIdx, bestIdx + searchTokens.length).reduce((s, w) => s + w.confidence, 0) /
  Math.min(searchTokens.length, words.length - bestIdx);

const result = {
  youtubeId,
  offset,
  matchedText,
  confidence: Math.round(avgConfidence * 100) / 100,
  matchRate: Math.round(bestMatchRate * 100) / 100,
  consecutiveMatches: bestConsecutive,
};

console.error(`  ✓ Match found at ${offset}s (confidence: ${result.confidence}, match rate: ${result.matchRate})`);
console.log(JSON.stringify(result, null, 2));
