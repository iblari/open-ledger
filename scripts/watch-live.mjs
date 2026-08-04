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
const POLL_MS = 120_000;                       // 2 minutes
const argMin = process.argv.indexOf("--minutes");
const WATCH_MIN = argMin > -1 ? Number(process.argv[argMin + 1]) : 300;
// Leave headroom so a late-starting event doesn't get cut off mid-sentence
// by the runner's hard timeout.
const RESERVE_MIN = 10;
const deadline = Date.now() + WATCH_MIN * 60_000;

const covered = new Set();   // videoIds already handled this session
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
        return { title: data?.videoDetails?.title || "YouTube video", segments };
      }
    } catch (e) {
      log(`  caption fetch (${c.name}) failed: ${e.message}`);
    }
  }
  return null;
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
    const got = await fetchCaptions(job.videoId);

    if (!got) {
      await fetch(`${API}/api/admin/check-queue`, {
        method: "POST", headers: auth,
        body: JSON.stringify({ videoId: job.videoId, error: "No captions available for this video, or YouTube blocked the request." }),
      });
      log(`  ✗ ${job.videoId}: no captions`);
      return;
    }

    await fetch(`${API}/api/admin/check-queue`, {
      method: "POST", headers: auth,
      body: JSON.stringify({ videoId: job.videoId, title: got.title, segments: got.segments }),
      signal: AbortSignal.timeout(60_000),
    });
    log(`  ✓ ${job.videoId}: ${got.segments.length} segments archived — fact-checking`);

    // Backfill turns the archived transcript into verified claims. Reusing it
    // means there is exactly one implementation of that step.
    await fetch(`${API}/api/admin/backfill`, {
      method: "POST", headers: auth,
      body: JSON.stringify({ videoId: job.videoId, checkClaims: true, limit: 1 }),
      signal: AbortSignal.timeout(280_000),
    }).catch(e => log(`  fact-check failed: ${e.message}`));
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
      if (!covered.has(id)) {
        covered.add(id);
        const remain = (deadline - Date.now()) / 60_000 - RESERVE_MIN;
        const cap = Math.min(remain, (sched.activeSecondsRemaining || 7200) / 60 + 5);
        if (cap > 3) await cover(url, active.title || "Scheduled broadcast", cap);
        continue;
      }
    }

    // 2. Otherwise, discovery: any watched channel actually on air.
    const disc = await getJson(`${API}/api/live-discover`).catch(() => null);
    const hits = (disc?.live || []).filter(h => channels.has(h.channelId) && !covered.has(h.videoId));
    if (hits.length) {
      const hit = hits[0];
      covered.add(hit.videoId);
      const ch = channels.get(hit.channelId);
      const remain = (deadline - Date.now()) / 60_000 - RESERVE_MIN;
      const cap = Math.min(remain, ch.maxCoverMinutes || 180);
      if (cap > 3) {
        await cover(hit.url, hit.title || `${ch.label} live`, cap);
        // YouTube needs a few minutes after a stream ends to publish captions.
        log("waiting 5min for YouTube captions, then repairing any late-join gap…");
        await sleep(5 * 60_000);
        await sweepBackfill("post-coverage");
      } else {
        log(`skipping ${hit.videoId}: only ${Math.round(remain)}min left in this watch window`);
      }
      continue;
    }

    // Nothing live — spend the idle poll on any queued on-demand checks.
    await drainCheckQueue();

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
