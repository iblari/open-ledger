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
      } else {
        log(`skipping ${hit.videoId}: only ${Math.round(remain)}min left in this watch window`);
      }
      continue;
    }

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
