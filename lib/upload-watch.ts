import { claimOnce, enqueueCheck, getCheckJob, getLedger, getRecentBroadcasts, getLiveState } from "./live-kv";

/**
 * Watch for UPLOADED official videos and queue them for fact-checking.
 *
 * Not everything is live-streamed. Press gaggles on the tarmac or the South
 * Lawn are filmed and posted afterwards — several a week on the White House
 * channel — and the live watcher never sees them. This reads the channel's
 * public RSS feed (keyless, no quota), picks uploads that are actual remarks,
 * and hands new ones to the same "check any video" queue the worker already
 * drains: transcribe → archive → fact-check the whole transcript. They then
 * appear in replays, the ledger, the radar and the trending strip like any
 * broadcast.
 */
const CHANNELS = [
  { id: "UCYxRlFDqcWM4y7FfpiAN3KQ", label: "The White House" },
];

// Remarks worth checking. Promo clips and slogans ("Trump Accounts Turn
// Dreams Into Possibilities") name none of these and are skipped.
const WORTH_CHECKING = /gaggle|press briefing|press conference|remarks|delivers|announcement|interview|roundtable|summit|q&a|participates|hosts|meets with|meeting|signs|speaks|address/i;
// The feed holds ~15 uploads (about a week); look back over all of it so a
// quiet cron or a busy news week doesn't let a gaggle age out unchecked.
const MAX_AGE_MS = 8 * 86400 * 1000;
const PER_DAY = 10;   // cost guardrail: transcription + checking per video

interface Upload { videoId: string; title: string; published: string }

async function readFeed(channelId: string): Promise<Upload[]> {
  const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) return [];
  const xml = await r.text();
  const out: Upload[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const videoId = e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = (e.match(/<title>([^<]*)<\/title>/)?.[1] || "")
      .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    const published = e.match(/<published>([^<]+)<\/published>/)?.[1] || "";
    if (videoId && title && published) out.push({ videoId, title, published });
  }
  return out;
}

/** Cron: at most every ~10 minutes. Returns the uploads newly queued. */
export async function watchUploads(): Promise<Upload[]> {
  if (!(await claimOnce("uploads:poll", 9 * 60))) return [];
  const [ledger, recent, live] = await Promise.all([
    getLedger().catch(() => []), getRecentBroadcasts().catch(() => []), getLiveState().catch(() => null),
  ]);
  const known = new Set([...ledger.map(e => e.videoId), ...recent.map(b => b.videoId)]);
  // The same speech is sometimes streamed live AND re-uploaded under a new
  // id. Matching titles means we already covered it.
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const knownTitles = new Set([...ledger.map(e => norm(e.title)), ...recent.map(b => norm(b.title))]);
  if (live?.videoId) known.add(live.videoId);

  const queued: Upload[] = [];
  for (const ch of CHANNELS) {
    const feed = await readFeed(ch.id).catch(() => []);
    for (const u of feed) {
      if (known.has(u.videoId) || knownTitles.has(norm(u.title))) continue;
      if (Date.now() - Date.parse(u.published) > MAX_AGE_MS) continue;
      if (!WORTH_CHECKING.test(u.title)) continue;
      const job = await getCheckJob(u.videoId).catch(() => null);
      // Queued, running or done: leave it. Failed: try again after 3 hours —
      // failures are usually the transcription service (out of credit, rate
      // limited), not the video, and clear up on their own.
      if (job && (job.status !== "failed" || Date.now() - Date.parse(job.finishedAt || job.requestedAt) < 3 * 3600 * 1000)) continue;
      if (!(await withinDailyCap(new Date().toISOString().slice(0, 10)))) return queued;
      await enqueueCheck(u.videoId, `https://www.youtube.com/watch?v=${u.videoId}`);
      queued.push(u);
    }
  }
  return queued;
}

async function withinDailyCap(day: string): Promise<boolean> {
  for (let i = 0; i < PER_DAY; i++) {
    if (await claimOnce(`uploads:cap:${day}:${i}`, 2 * 86400)) return true;
  }
  return false;
}
