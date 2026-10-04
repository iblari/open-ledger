#!/usr/bin/env node
/**
 * watch-live.mjs — the continuous coverage watcher.
 *
 * WHY THIS EXISTS
 * GitHub's scheduled workflows are throttled hard: measured gaps between our
 * cron runs ran 57-227 minutes (avg ~85). Official events last 20-60 minutes.
 * A one-shot "is anything live right now?" check therefore MISSES most events
 * — of four White House streams on Jul 23-25, cron fired inside exactly one,
 * two minutes before it ended. The pipeline was never the problem; the
 * sampling rate was.
 *
 * Instead of sampling, this process WATCHES: one job stays alive for hours,
 * polling discovery every 2 minutes, and launches the coverage pipeline the
 * moment a watched channel goes live. Public repos get unlimited Actions
 * minutes, so continuous watching is free. Overlapping cron runs are held by
 * the workflow's concurrency group, so each new run takes over as the last
 * one retires — approximating 24/7 coverage with no extra infrastructure
 * and no personal access token.
 *
 * Usage: node scripts/watch-live.mjs --minutes 300
 */
import { spawn } from "child_process";

const API = process.env.API_URL || "https://voteunbiased.org";
const POLL_MS = 60_000;                        // 1 minute — a late join is the costliest failure
const argMin = process.argv.indexOf("--minutes");
const WATCH_MIN = argMin > -1 ? Number(process.argv[argMin + 1]) : 300;
// Leave headroom so a late-starting event doesn't get cut off mid-sentence
// by the runner's hard timeout.
const RESERVE_MIN = 10;
const deadline = Date.now() + WATCH_MIN * 60_000;

const covered = new Set();   // videoIds already handled this session
// Candidates the pipeline refused as not live, with when. Discovery keeps
// surfacing old uploads and not-yet-started streams; they're skipped for a
// while instead of forever, because an upcoming stream does go live.
const notLiveAt = new Map();
const NOT_LIVE_TTL_MS = 10 * 60_000;
const retries = new Map();   // videoId → transient failures this run
const MAX_RETRIES = 20;
/** Outcome of a coverage attempt. go-live exit codes: 3 not live,
 *  4 no audio URL, 5 transcription refused; anything else = covered. */
function afterCover(id, code) {
  if (code === 3) { covered.delete(id); notLiveAt.set(id, Date.now()); return "skip"; }
  if (code === 4 || code === 5) {
    const n = (retries.get(id) || 0) + 1; retries.set(id, n);
    if (n < MAX_RETRIES) { covered.delete(id); log(`  ↻ ${id}: transient failure (exit ${code}), retry ${n}/${MAX_RETRIES} next poll`); }
    else log(`  ✗ ${id}: giving up after ${n} attempts`);
    return "retry";
  }
  return "done";
}
const recentlyNotLive = (id) => { const t = notLiveAt.get(id); return t != null && Date.now() - t < NOT_LIVE_TTL_MS; };
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const BACKFILL_EVERY_POLLS = 10;   // ~20 minutes at a 2-minute poll
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** Channels we're allowed to auto-cover, from the repo config. */
async function autoCoverChannels() {
  const cfg = await getJson(`${API}/live-channels.json`).catch(() => null);
  const list = cfg?.channels || [];
  return new Map(list.filter(c => c.autoCover).map(c => [c.id, c]));
}

/**
 * Repair late joins. The watcher can only start covering a stream once
 * YouTube reports it live, so a broadcast already in progress is captured
 * from the moment we arrive. Once a stream ENDS, YouTube publishes captions
 * for the whole video — so the missing head becomes recoverable a few
 * minutes later. This sweep is idempotent and skips anything without a gap,
 * which is why it's safe to run on a timer rather than reasoning about
 * exactly when captions appear.
 *
 * It lives in the watcher (not a cron job) because the watcher is the one
 * process we know runs continuously — GitHub's scheduled runs are throttled
 * to 57-227 minute gaps.
 */
async function sweepBackfill(reason) {
  if (!ADMIN_KEY) return;
  try {
    const r = await fetch(`${API}/api/admin/backfill`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ checkClaims: true, limit: 10 }),
      signal: AbortSignal.timeout(280_000),
    });
    const j = await r.json().catch(() => ({}));
    const filled = (j.report || []).filter(x => x.segmentsAdded);
    if (filled.length) {
      log(`↩ backfill (${reason}): ${filled.map(f => `${f.videoId} +${f.segmentsAdded} segs/+${f.claimsAdded} claims`).join(", ")}`);
    }
  } catch (e) {
    log("backfill sweep failed:", e.message);
  }
}

/**
 * ── On-demand video checks ─────────────────────────────────────────
 *
 * As of 3 Aug 2026 YouTube refuses caption access to the web server from
 * every egress path it has: the player API answers "Sign in to confirm
 * you're not a bot" on both the proxy IP and Vercel's, and the watch page
 * comes back stripped of caption metadata. Actions runners still get
 * through, so "Check any video" enqueues in KV and this loop does the work.
 *
 * Drained on the same 2-minute poll as live discovery, which is why no
 * dispatch token is needed — the same reasoning that made this watcher
 * poll-driven in the first place.
 */
const INNERTUBE = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const IT_CLIENTS = [
  { name: "ANDROID", ver: "20.10.38", ua: "com.google.android.youtube/20.10.38 (Linux; U; Android 14)" },
  { name: "IOS", ver: "20.10.4", ua: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)" },
  { name: "WEB", ver: "2.20250101.00.00", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36" },
];

async function fetchCaptions(videoId) {
  for (const c of IT_CLIENTS) {
    try {
      const resp = await fetch(INNERTUBE, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": c.ua },
        body: JSON.stringify({ context: { client: { clientName: c.name, clientVersion: c.ver } }, videoId }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      const status = data?.playabilityStatus?.status;
      if (status === "LOGIN_REQUIRED" || status === "ERROR") {
        log(`  ${c.name}: ${status} — this runner IP is flagged too`);
        continue;
      }
      const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (!Array.isArray(tracks) || !tracks.length) continue;

      // Prefer a human-made English track; auto-generated ("asr") is the
      // fallback because its punctuation is worse and the extractor keys off
      // sentence boundaries.
      const en = tracks.filter(t => (t.languageCode || "").startsWith("en"));
      const track = en.find(t => t.kind !== "asr") || en[0] || tracks[0];

      const xml = await fetch(track.baseUrl, {
        headers: { "User-Agent": c.ua },
        signal: AbortSignal.timeout(30_000),
      }).then(r => (r.ok ? r.text() : ""));
      if (!xml || xml.length < 50) continue;

      const segments = [];
      for (const m of xml.matchAll(/<text start="([\d.]+)"[^>]*>(.*?)<\/text>/gs)) {
        const text = m[2]
          .replace(/&amp;#39;/g, "'").replace(/&amp;quot;/g, '"')
          .replace(/&amp;amp;/g, "&").replace(/&amp;lt;/g, "<").replace(/&amp;gt;/g, ">")
          .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
          .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (text) segments.push({ time: Math.round(Number(m[1])), text });
      }
      if (segments.length) {
        // When it happened. The audio path reads this from yt-dlp; without it
        // here, a video recovered through captions was dated the day it was
        // queued (the UN address showed as 27 Sep).
        const mf = data?.microformat?.playerMicroformatRenderer || {};
        const when = mf.liveBroadcastDetails?.startTimestamp || mf.publishDate || mf.uploadDate || null;
        const ms = when ? Date.parse(when) : NaN;
        return {
          title: data?.videoDetails?.title || "YouTube video",
          startedAt: Number.isFinite(ms) ? new Date(ms).toISOString() : null,
          segments,
        };
      }
    } catch (e) {
      log(`  caption fetch (${c.name}) failed: ${e.message}`);
    }
  }
  return null;
}

/**
 * Audio fallback for on-demand checks: download the soundtrack and transcribe
 * it with Deepgram's prerecorded API.
 *
 * The caption path above asks YouTube for its subtitle track, and from a
 * datacenter IP YouTube now answers "Sign in to confirm you're not a bot" —
 * so every "Check any video" request was failing within a second (the UN
 * General Assembly address on 27 Sep among them). Live coverage never had the
 * problem because it takes the audio instead, through yt-dlp with the proxy
 * and PO-token sidecar. This reuses exactly that route for recordings.
 */
async function fetchAudioTranscript(videoId) {
  const key = process.env.DEEPGRAM_API_KEY;
  fetchAudioTranscript.lastError = "";
  if (!key) { fetchAudioTranscript.lastError = "DEEPGRAM_API_KEY not set on the worker"; log("  audio fallback skipped: DEEPGRAM_API_KEY not set"); return null; }
  const { readFile, unlink } = await import("fs/promises");
  const out = `/tmp/check-${videoId}.%(ext)s`;
  const userExtra = (process.env.YT_DLP_EXTRA_ARGS || "").split(/\s+/).filter(Boolean);
  // The same client ladder live coverage uses. The default client is the one
  // YouTube challenges hardest from a datacenter IP; the first version of
  // this fallback tried only that, and failed in five seconds on the UN
  // address. Each client is tried through the proxy, then direct.
  const CLIENTS = [
    [],
    ["--extractor-args", "youtube:player_client=android,tv"],
    ["--extractor-args", "youtube:player_client=ios"],
    ["--extractor-args", "youtube:player_client=tv_embedded"],
  ];
  const EGRESS = process.env.YT_PROXY_URL ? [["--proxy", process.env.YT_PROXY_URL], []] : [[]];
  const errors = [];

  const attempt = (client, egress) => new Promise((resolve) => {
    const args = [
      ...egress,
      "-f", "bestaudio/best", "--no-playlist", "--no-simulate",
      "--max-filesize", "600M",
      "--print", "title", "--print", "%(release_timestamp,timestamp)s", "--print", "after_move:filepath",
      "-o", out, ...userExtra, ...client,
      `https://www.youtube.com/watch?v=${videoId}`,
    ];
    const proc = spawn("yt-dlp", args);
    let stdout = "", stderr = "";
    const kill = setTimeout(() => proc.kill("SIGKILL"), 8 * 60_000);
    proc.stdout.on("data", d => { stdout += d; });
    proc.stderr.on("data", d => { stderr += d; });
    proc.on("error", e => { clearTimeout(kill); resolve({ err: `spawn: ${e.message}` }); });
    proc.on("close", code => {
      clearTimeout(kill);
      const lines = stdout.split("\n").map(l => l.trim()).filter(Boolean);
      if (code === 0 && lines.length >= 2) {
        const ts = Number(lines[1]);
        return resolve({
          title: lines[0], file: lines[lines.length - 1],
          // When the stream started or the video was published — so a recovered
          // speech is dated when it happened, not when it was checked.
          startedAt: Number.isFinite(ts) && ts > 1e9 ? new Date(ts * 1000).toISOString() : null,
        });
      }
      const firstErr = (stderr.split("\n").find(l => l.includes("ERROR")) || stderr.trim().split("\n").pop() || `exit ${code}`).trim();
      resolve({ err: firstErr.slice(0, 180) });
    });
  });

  let dl = null;
  outer: for (const client of CLIENTS) {
    for (const egress of EGRESS) {
      const r = await attempt(client, egress);
      if (r.file) { dl = r; break outer; }
      const label = `${client.length ? client[1].split("=")[1] : "default"}${egress.length ? "/proxy" : "/direct"}`;
      errors.push(`${label}: ${r.err}`);
      log(`  audio ${label} failed: ${r.err}`);
    }
  }
  // Kept on the function so callers can report WHY, not just that it failed.
  fetchAudioTranscript.lastError = errors.slice(-3).join(" | ");
  if (!dl) return null;

  try {
    const audio = await readFile(dl.file);
    log(`  audio downloaded (${(audio.length / 1e6).toFixed(1)} MB) — transcribing`);
    const r = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&utterances=true&language=en",
      {
        method: "POST",
        headers: { Authorization: `Token ${key}`, "Content-Type": "application/octet-stream" },
        body: audio,
        signal: AbortSignal.timeout(10 * 60_000),
      },
    );
    if (!r.ok) {
      const t = (await r.text()).slice(0, 200);
      fetchAudioTranscript.lastError = `deepgram ${r.status}: ${t}`;
      log(`  deepgram ${r.status}: ${t}`); return null;
    }
    const data = await r.json();
    // Utterances carry their own start times, which is what anchors each claim
    // to the right moment in the replay.
    const utts = data?.results?.utterances || [];
    const segments = utts
      .map(u => ({ time: Math.round(u.start), text: String(u.transcript || "").trim() }))
      .filter(x => x.text);
    // Word-level times, for re-timing a finished broadcast's claims. Compact
    // pairs keep a three-hour recording's ~30k words well inside a request.
    const words = (data?.results?.channels?.[0]?.alternatives?.[0]?.words || [])
      .map(w => [w.punctuated_word || w.word, Math.round(w.start * 100) / 100]);
    const utterances = utts.map(u => [Math.round(u.start * 10) / 10, String(u.transcript || "").trim()]);
    return segments.length ? { title: dl.title || "YouTube video", startedAt: dl.startedAt, segments, words, utterances } : null;
  } catch (e) {
    fetchAudioTranscript.lastError = `transcription: ${e.message}`;
    log(`  audio transcription failed: ${e.message}`);
    return null;
  } finally {
    await unlink(dl.file).catch(() => {});
  }
}

/**
 * Re-time one finished broadcast against its own recording.
 *
 * Live stamps mark when a transcript chunk FINISHED, in stream time; replays
 * compensated with a fixed 30-second lead and a guessed stream→video shift,
 * so "jump to claim" landed anywhere in a minute. Here the recording itself is
 * transcribed with word timings and the server locates every quote in it.
 *
 * Runs in the background: a long recording takes minutes to download and
 * transcribe, and none of that may delay noticing a broadcast going live.
 */
let realignBusy = false;
let claimsBusy = false;
let queueBusy = false;
async function realignOne() {
  if (!ADMIN_KEY || realignBusy) return;
  realignBusy = true;
  const auth = { Authorization: `Bearer ${ADMIN_KEY}`, "Content-Type": "application/json" };
  try {
    const r = await fetch(`${API}/api/admin/realign`, { headers: auth, signal: AbortSignal.timeout(20_000) });
    const { target } = await r.json().catch(() => ({}));
    if (!target) return;
    log(`⟲ re-timing claims: ${target.title} (${target.videoId})`);
    const got = await fetchAudioTranscript(target.videoId);
    if (!got?.words?.length) {
      await fetch(`${API}/api/admin/realign`, { method: "POST", headers: auth,
        body: JSON.stringify({ videoId: target.videoId, error: `no audio transcript: ${fetchAudioTranscript.lastError || "unknown"}`.slice(0, 600) }) }).catch(() => {});
      log(`  ✗ ${target.videoId}: could not transcribe the recording`);
      return;
    }
    const res = await fetch(`${API}/api/admin/realign`, {
      method: "POST", headers: auth, signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({ videoId: target.videoId, words: got.words, utterances: got.utterances }),
    }).then(x => x.json()).catch(e => ({ error: e.message }));
    log(`  ✓ ${target.videoId}: ${res.matched ?? "?"}/${res.total ?? "?"} claims located, offset ${res.offset ?? "?"}s`, res.error ? `(${res.error})` : "");
  } catch (e) {
    log("realign error:", e.message);
  } finally {
    realignBusy = false;
  }
}

/**
 * When a video happened, from yt-dlp's metadata alone (no download). Used when
 * the transcript came from captions: the InnerTube clients that still return
 * captions omit the microformat block that carries the date, so the UN address
 * kept being dated the day it was queued.
 */
async function getVideoStart(videoId) {
  const userExtra = (process.env.YT_DLP_EXTRA_ARGS || "").split(/\s+/).filter(Boolean);
  const egress = process.env.YT_PROXY_URL ? [["--proxy", process.env.YT_PROXY_URL], []] : [[]];
  for (const e of egress) {
    const ts = await new Promise(resolve => {
      const p = spawn("yt-dlp", [...e, "--skip-download", "--no-warnings", "--print", "%(release_timestamp,timestamp)s", ...userExtra, `https://www.youtube.com/watch?v=${videoId}`]);
      let out = ""; const kill = setTimeout(() => p.kill("SIGKILL"), 60_000);
      p.stdout.on("data", d => { out += d; });
      p.on("error", () => { clearTimeout(kill); resolve(null); });
      p.on("close", () => { clearTimeout(kill); const n = Number(out.trim().split("\n")[0]); resolve(Number.isFinite(n) && n > 1e9 ? n : null); });
    });
    if (ts) return new Date(ts * 1000).toISOString();
  }
  return null;
}

async function checkAllClaims(videoId) {
  const auth = { Authorization: `Bearer ${ADMIN_KEY}`, "Content-Type": "application/json" };
  for (let pass = 0; pass < 60; pass++) {
    const r = await fetch(`${API}/api/admin/check-claims`, {
      method: "POST", headers: auth, signal: AbortSignal.timeout(300_000),
      body: JSON.stringify(videoId ? { videoId } : {}),
    }).then(x => x.json()).catch(e => ({ error: e.message }));
    if (r.error) { log(`  fact-check error: ${r.error}`); return; }
    if (!r.target) return;
    if (r.busy) { await sleep(30_000); continue; }
    log(`  fact-check ${r.target}: +${r.added} (total ${r.total})${r.done ? " — done" : ""}`);
    if (r.done) { if (videoId) return; videoId = null; }
  }
}

async function drainCheckQueue() {
  if (!ADMIN_KEY) return;
  const auth = { Authorization: `Bearer ${ADMIN_KEY}`, "Content-Type": "application/json" };
  // One job per poll. A queued check should never delay noticing that a
  // broadcast has gone live — that is this process's actual job.
  try {
    const r = await fetch(`${API}/api/admin/check-queue`, { headers: auth, signal: AbortSignal.timeout(20_000) });
    const { job } = await r.json().catch(() => ({}));
    if (!job) return;

    log(`▷ on-demand check: ${job.videoId}`);
    const got = (await fetchCaptions(job.videoId)) || (await fetchAudioTranscript(job.videoId));

    if (!got) {
      await fetch(`${API}/api/admin/check-queue`, {
        method: "POST", headers: auth,
        body: JSON.stringify({ videoId: job.videoId, error: `Could not get a transcript: no captions, and no audio. ${fetchAudioTranscript.lastError || ""}`.trim().slice(0, 600) }),
      });
      log(`  ✗ ${job.videoId}: no captions and no audio`);
      return;
    }

    await fetch(`${API}/api/admin/check-queue`, {
      method: "POST", headers: auth,
      body: JSON.stringify({ videoId: job.videoId, title: got.title, startedAt: got.startedAt || (await getVideoStart(job.videoId)), segments: got.segments }),
      signal: AbortSignal.timeout(60_000),
    });
    log(`  ✓ ${job.videoId}: ${got.segments.length} segments archived — fact-checking`);

    // Fact-check the whole transcript in resumable batches. (This used to call
    // /api/admin/backfill, which only checks the part before a late join — for
    // a transcript starting at 0:00 it checked nothing.)
    await checkAllClaims(job.videoId);
  } catch (e) {
    log("check queue error:", e.message);
  }
}

/** Run the coverage pipeline; resolves when the broadcast ends. */
function cover(url, title, minutes) {
  return new Promise((resolve) => {
    log(`▶ COVERING: ${title} (${minutes}min cap)`);
    const p = spawn("node", [
      "scripts/go-live.mjs", url, title,
      "--duration", String(Math.round(minutes * 60)),
      "--display", url,
    ], { stdio: "inherit", env: process.env });
    p.on("close", (code) => { log(`◼ coverage ended (exit ${code})`); resolve(code); });
    p.on("error", (e) => { log("coverage failed to start:", e.message); resolve(1); });
  });
}

log(`watcher up — polling every ${POLL_MS / 1000}s until ${new Date(deadline).toISOString()}`);
const channels = await autoCoverChannels();
log(`auto-cover channels: ${[...channels.keys()].join(", ") || "(none)"}`);

let polls = 0;
while (Date.now() < deadline - RESERVE_MIN * 60_000) {
  polls++;
  try {
    // 1. Scheduled events take priority (a human/autopilot put them there).
    const sched = await getJson(`${API}/api/live-schedule`).catch(() => null);
    const active = sched?.active;
    if (active && !active.youtubeUrl?.includes("REPLACE_WITH")) {
      const url = active.streamUrl || active.youtubeUrl;
      const id = active.id || url;
      if (!covered.has(id) && !recentlyNotLive(id)) {
        covered.add(id);
        const remain = (deadline - Date.now()) / 60_000 - RESERVE_MIN;
        const cap = Math.min(remain, (sched.activeSecondsRemaining || 7200) / 60 + 5);
        if (cap > 3) afterCover(id, await cover(url, active.title || "Scheduled broadcast", cap));
        continue;
      }
    }

    // 2. Otherwise, discovery: any watched channel actually on air.
    const disc = await getJson(`${API}/api/live-discover`).catch(() => null);
    const hits = (disc?.live || []).filter(h => channels.has(h.channelId) && !covered.has(h.videoId) && !recentlyNotLive(h.videoId));
    let coveredOne = false;
    // Try every candidate this poll: the first is often a stale upload, and
    // the real broadcast should not wait for the next poll behind it.
    for (const hit of hits) {
      covered.add(hit.videoId);
      const ch = channels.get(hit.channelId);
      const remain = (deadline - Date.now()) / 60_000 - RESERVE_MIN;
      const cap = Math.min(remain, ch.maxCoverMinutes || 180);
      if (cap <= 3) { log(`skipping ${hit.videoId}: only ${Math.round(remain)}min left in this watch window`); break; }
      const outcome = afterCover(hit.videoId, await cover(hit.url, hit.title || `${ch.label} live`, cap));
      if (outcome === "skip") continue;       // not live — next candidate, no wait
      if (outcome === "retry") break;         // transient — next poll
      coveredOne = true;
      // Repair any late-join gap once YouTube has published captions — in the
      // background, so a broadcast starting right after this one is picked
      // up on the next poll instead of after a blocking 5-minute sleep.
      log("scheduling late-join repair in 5min (YouTube captions lag the stream)");
      setTimeout(() => { sweepBackfill("post-coverage").catch(e => log("post-coverage repair failed:", e.message)); }, 5 * 60_000);
      break;
    }
    if (hits.length) { if (coveredOne) continue; }

    // Nothing live — spend the idle poll on any queued on-demand checks.
    // Not awaited: an on-demand check downloads and transcribes a whole
    // recording (minutes), and the loop must keep polling for live streams
    // meanwhile. A busy flag stops two drains overlapping.
    if (!queueBusy) { queueBusy = true; drainCheckQueue().finally(() => { queueBusy = false; }); }
    // Housekeeping every 10th idle poll (~10 min), not every minute. Each
    // pass reads the archive from Upstash, and running them per poll was
    // most of what exhausted the database's monthly request quota on 4 Oct.
    // Neither is time-critical: alignment waits 20 minutes after a broadcast
    // anyway, and catch-up fact-checks are for recovered recordings.
    if (polls % 10 === 2) {
      // Deliberately not awaited — see realignOne.
      realignOne();
      // Any recovered broadcast with unchecked transcript (including ones
      // archived before this existed) gets its fact-check pass here.
      if (!claimsBusy) { claimsBusy = true; checkAllClaims(null).finally(() => { claimsBusy = false; }); }
    }

    // Periodic self-repair while idle — catches broadcasts covered by a
    // previous watcher run that retired before captions were ready.
    if (polls % BACKFILL_EVERY_POLLS === 0) await sweepBackfill("periodic");

    if (polls % 15 === 1) {
      const left = Math.round((deadline - Date.now()) / 60_000);
      log(`nothing live (poll ${polls}) — ${left}min left in window`);
    }
  } catch (e) {
    log("poll error:", e.message);
  }
  await sleep(POLL_MS);
}

log(`watch window complete after ${polls} polls; covered ${covered.size} event(s). Exiting for the next runner.`);
