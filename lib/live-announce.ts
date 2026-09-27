/**
 * Tell subscribers a broadcast is live — once it is PROVEN live.
 *
 * Alerts used to go out the instant go-live started, before a single word had
 * been transcribed. On 22 Sep the JD Vance press conference on fraud started at
 * 15:57:25, both subscribers were emailed, and the worker died 34 seconds later
 * without sending any transcript. Nothing was covered and nothing was archived,
 * so the alert led to an empty page during the broadcast and nothing after it.
 *
 * Now the ingest route calls this when the first transcript chunk arrives. The
 * cost is ~45 seconds between the stream starting and the email; the gain is
 * that an alert means coverage is actually running.
 */

import { claimOnce, type LiveState } from "./live-kv";
import { sendLiveAlert } from "./email-alerts";
import { sendPushToAll } from "./push";

export async function announceOnce(state: LiveState): Promise<boolean> {
  if (state.status !== "live" || !state.startedAt) return false;
  if (!(await claimOnce(`live:announced:${state.startedAt}`, 24 * 3600))) return false;

  const title = state.title || "An official broadcast";
  const [pushRes, mailRes] = await Promise.allSettled([
    sendPushToAll({
      title: "🔴 Live fact-check in progress",
      body: title,
      url: state.videoId ? `/live?v=${encodeURIComponent(state.videoId)}` : "/live",
    }),
    sendLiveAlert(title, state.source, state.videoId),
  ]);
  console.log(`[announce] "${title}" — push: ${pushRes.status === "fulfilled" ? `${pushRes.value.sent} sent` : `FAILED ${pushRes.reason}`}; email: ${mailRes.status === "fulfilled" ? JSON.stringify(mailRes.value) : `FAILED ${mailRes.reason}`}`);
  return true;
}
