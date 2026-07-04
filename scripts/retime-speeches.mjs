#!/usr/bin/env node
// Offline caption alignment for the /live demo speeches.
//
// PROBLEM this solves: the demo JSONs carry hand-curated segment times that
// assume the speech starts at 0:00 — but archive videos (e.g. the WSJ upload
// of the 2025 address) have 20+ minutes of pre-speech coverage, so every
// fact-check timestamp and subtitle landed in the wrong place. The /live page
// tries to re-time at runtime by fetching YouTube captions, but YouTube
// routinely blocks datacenter IPs (Vercel), so production fell back to the
// wrong times (the "APPROX." badge).
//
// FIX: run this script ONCE per demo video from a residential IP (your
// laptop). It fetches the real captions, fuzzy-matches every segment to where
// its words actually occur, rewrites segment.time, and embeds the verbatim
// caption track in the JSON under `captions`. The page then has ground-truth
// timing baked in — no runtime fetch, no APPROX. fallback.
//
// Usage:
//   node scripts/retime-speeches.mjs                  # all speeches
//   node scripts/retime-speeches.mjs sotu-2024.json   # one speech

import { readFile, writeFile, readdir } from "fs/promises";
import path from "path";

const SPEECH_DIR = path.join(process.cwd(), "public", "speeches");
const INNERTUBE_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const CLIENT_VERSION = "20.10.38";
const UA = `com.google.android.youtube/${CLIENT_VERSION} (Linux; U; Android 14)`;

/* ── caption fetching (mirrors app/api/fetch-transcript) ── */

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/\n/g, " ").trim();
}

function parseTranscriptXml(xml) {
  const items = [];
  const pRe = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = pRe.exec(xml)) !== null) {
    const inner = m[3];
    let text = "";
    const sRe = /<s[^>]*>([^<]*)<\/s>/g;
    let s;
    while ((s = sRe.exec(inner)) !== null) text += s[1];
    if (!text) text = inner.replace(/<[^>]+>/g, "");
    text = decodeEntities(text).trim();
    if (text) items.push({ startSec: parseInt(m[1], 10) / 1000, text });
  }
  if (items.length === 0) {
    const tRe = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
    while ((m = tRe.exec(xml)) !== null) {
      const text = decodeEntities(m[3]);
      if (text) items.push({ startSec: parseFloat(m[1]), text });
    }
  }
  return items;
}

function groupIntoSegments(items, windowSec = 15) {
  if (items.length === 0) return [];
  const out = [];
  let winStart = Math.floor(items[0].startSec);
  let buf = [];
  for (const it of items) {
    const sec = Math.floor(it.startSec);
    if (sec - winStart >= windowSec && buf.length > 0) {
      out.push({ time: winStart, text: buf.join(" ") });
      buf = [];
      winStart = sec;
    }
    if (it.text.trim()) buf.push(it.text.trim());
  }
  if (buf.length > 0) out.push({ time: winStart, text: buf.join(" ") });
  return out;
}

function pickTrack(tracks) {
  return (
    tracks.find(t => t.languageCode?.startsWith("en") && t.kind !== "asr") ||
    tracks.find(t => t.languageCode?.startsWith("en")) ||
    tracks[0]
  );
}

async function tracksViaInnerTube(videoId, clientName, clientVersion, userAgent) {
  const resp = await fetch(INNERTUBE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": userAgent },
    body: JSON.stringify({
      context: { client: { clientName, clientVersion } },
      videoId,
    }),
  });
  if (!resp.ok) throw new Error(`InnerTube(${clientName}) ${resp.status}`);
  const data = await resp.json();
  return data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || null;
}

async function tracksViaWatchPage(videoId) {
  const resp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!resp.ok) throw new Error(`watch page ${resp.status}`);
  const html = await resp.text();
  const m = html.match(/"captionTracks"\s*:\s*(\[.*?\])\s*,\s*"/s);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

async function fetchCaptions(videoId) {
  // Different videos gate captions behind different clients — try in order.
  let tracks = null;
  const attempts = [
    () => tracksViaInnerTube(videoId, "ANDROID", CLIENT_VERSION, UA),
    () => tracksViaInnerTube(videoId, "WEB", "2.20250101.00.00",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"),
    () => tracksViaWatchPage(videoId),
  ];
  for (const attempt of attempts) {
    try {
      tracks = await attempt();
      if (Array.isArray(tracks) && tracks.length > 0) break;
      tracks = null;
    } catch { /* next strategy */ }
  }
  if (!tracks) throw new Error("no caption tracks (all strategies)");

  const track = pickTrack(tracks);
  const xmlResp = await fetch(track.baseUrl, { headers: { "User-Agent": UA } });
  if (!xmlResp.ok) throw new Error(`timedtext ${xmlResp.status}`);
  const xml = await xmlResp.text();
  const items = parseTranscriptXml(xml);
  if (items.length === 0) throw new Error("empty transcript");
  return items;
}

/* ── fuzzy quote→caption matching (mirrors app/live/page.tsx) ── */

const STOPWORDS = new Set([
  "the","and","of","to","a","in","is","it","you","that","we","for","on",
  "are","as","with","this","be","at","have","or","not","but","by","from",
  "they","an","i","my","your","their",
]);
// Crude stemmer: "paying"/"pays"/"paid" ≠ "pay" defeats exact-token overlap
// on paraphrased demo quotes; stripping common suffixes recovers those.
const stem = w => w
  .replace(/ies$/, "y").replace(/ing$/, "").replace(/ed$/, "")
  .replace(/s$/, "");
const tokens = s => s.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/)
  .filter(w => w.length > 2 && !STOPWORDS.has(w))
  .map(stem);

function matchScore(quote, captions) {
  const qWords = tokens(quote);
  if (qWords.length < 3) return { score: 0, time: null };
  const qSet = new Set(qWords);
  let best = { score: 0, time: null };
  for (let i = 0; i < captions.length; i++) {
    let windowText = "";
    for (let j = i; j < captions.length && captions[j].time - captions[i].time < 25; j++) {
      windowText += " " + captions[j].text;
    }
    const wSet = new Set(tokens(windowText));
    let overlap = 0;
    for (const w of qSet) if (wSet.has(w)) overlap++;
    const score = overlap / qSet.size;
    if (score > best.score) best = { score, time: captions[i].time };
  }
  return best;
}

/** Try every claim quote in the segment PLUS the segment text, take the
 *  best-scoring probe. Offline we can afford this thoroughness. */
function findSegmentTime(seg, captions, minOverlap = 0.45) {
  const probes = [...(seg.claims || []).map(c => c.quote), seg.text].filter(Boolean);
  let best = { score: 0, time: null };
  for (const probe of probes) {
    const r = matchScore(probe, captions);
    if (r.score > best.score) best = r;
  }
  return best.score >= minOverlap ? best : { ...best, time: null };
}

/* ── main ── */

const only = process.argv[2];
const files = only
  ? [only]
  : (await readdir(SPEECH_DIR)).filter(f => f.endsWith(".json"));

for (const f of files) {
  const p = path.join(SPEECH_DIR, f);
  const speech = JSON.parse(await readFile(p, "utf8"));
  process.stdout.write(`${f} (${speech.videoId}): fetching captions… `);
  let items;
  try {
    items = await fetchCaptions(speech.videoId);
  } catch (e) {
    console.log(`FAILED (${e.message}) — skipped, times unchanged`);
    continue;
  }
  const captions = groupIntoSegments(items);
  console.log(`${captions.length} caption segments`);

  // Pass 1: direct caption matches.
  const results = speech.segments.map(seg => ({ seg, r: findSegmentTime(seg, captions) }));
  const pairs = results.filter(x => x.r.time != null)
    .map(x => ({ old: x.seg.time, neu: x.r.time }));

  // Pass 2: segments whose paraphrased text never appears verbatim in the
  // captions get a CALIBRATED time instead of their broken curated one.
  // The curated timeline is internally consistent (relative to speech start);
  // the video just starts earlier and drifts with applause. A least-squares
  // linear fit old→new from the matched pairs captures both offset and drift.
  let fit = null;
  if (pairs.length >= 3) {
    const n = pairs.length;
    const sx = pairs.reduce((s, p) => s + p.old, 0);
    const sy = pairs.reduce((s, p) => s + p.neu, 0);
    const sxx = pairs.reduce((s, p) => s + p.old * p.old, 0);
    const sxy = pairs.reduce((s, p) => s + p.old * p.neu, 0);
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const intercept = (sy - slope * sx) / n;
    const meanY = sy / n;
    const ssTot = pairs.reduce((s, p) => s + (p.neu - meanY) ** 2, 0);
    const ssRes = pairs.reduce((s, p) => s + (p.neu - (slope * p.old + intercept)) ** 2, 0);
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    fit = { slope, intercept, r2 };
    console.log(`  linear fit old→new: t' = ${slope.toFixed(4)}·t + ${intercept.toFixed(1)}  (R²=${r2.toFixed(4)}, n=${n})`);
  }

  let matched = 0, calibrated = 0, kept = 0;
  const retimed = results.map(({ seg, r }) => {
    if (r.time != null) { matched++; return { ...seg, time: r.time }; }
    if (fit && fit.r2 >= 0.95) {
      calibrated++;
      const t = Math.max(0, Math.round(fit.slope * seg.time + fit.intercept));
      console.log(`  CALIBRATED t=${seg.time}→${t} (best match ${r.score.toFixed(2)}): ${(seg.claims?.[0]?.quote || seg.text).slice(0, 60)}`);
      return { ...seg, time: t };
    }
    kept++;
    console.log(`  KEPT t=${seg.time} (no fit, best=${r.score.toFixed(2)}): ${(seg.claims?.[0]?.quote || seg.text).slice(0, 60)}`);
    return seg;
  });
  retimed.sort((a, b) => a.time - b.time);

  speech.segments = retimed;
  // Embed the verbatim caption track so the /live page has real subtitles +
  // a matching target for per-claim re-timing WITHOUT any runtime fetch.
  speech.captions = captions;
  await writeFile(p, JSON.stringify(speech, null, 2) + "\n");
  console.log(`  → ${matched} matched, ${calibrated} calibrated, ${kept} kept of ${speech.segments.length}; captions embedded; saved.`);
}
