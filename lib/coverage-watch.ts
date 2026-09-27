/**
 * Coverage watch — make a missed event loud.
 *
 * Discovery only covers what appears on a watched channel under a title the
 * filter accepts. On 16 Sep the Fed press conference streamed on a channel we
 * did not watch; on 22 Sep the President's UN address streamed on State and
 * C-SPAN under a title that named no speaker. Both were simply never covered,
 * and nothing said so — the gap was found by a person, days later.
 *
 * No list of channels makes that impossible. What this does is guarantee the
 * failure is not silent: for every calendar event we expect to cover live,
 * fifteen minutes after it starts it checks whether a broadcast is running or
 * was recorded for it. If not, the operator is emailed while the event is
 * still on, which is the only moment the answer can still be "cover it".
 */

import { knownEvents } from "./known-events";
import { claimOnce, getLedger, getLiveState } from "./live-kv";
import { sendAdminAlert } from "./email-alerts";

const GRACE_MS = 15 * 60_000;       // give discovery a fair chance first
const LOOKBACK_MS = 3 * 3600_000;   // still worth reporting after it ends

export interface CoverageDeps {
  state: () => Promise<{ status: string; startedAt?: string } | null>;
  ledger: () => Promise<{ startedAt: string }[]>;
  once: (key: string, ttlSec: number) => Promise<boolean>;
  alert: (subject: string, body: string) => Promise<unknown>;
}

const LIVE_DEPS: CoverageDeps = {
  state: () => getLiveState().catch(() => null),
  ledger: () => getLedger().catch(() => []),
  once: claimOnce,
  alert: sendAdminAlert,
};

export async function checkCoverage(now = Date.now(), deps: CoverageDeps = LIVE_DEPS): Promise<string[]> {
  // knownEvents() drops anything that started more than an hour before the
  // date it is given — right for a "what's coming" list, wrong here: a two-hour
  // press conference would vanish from the check halfway through. Ask from far
  // enough back to still see every event inside the lookback.
  const due = knownEvents(new Date(now - 8 * 3600_000)).filter(e => {
    if (!e.liveCoverage) return false;
    const start = Date.parse(e.startsAt);
    const end = start + e.durationMin * 60_000;
    return now >= start + GRACE_MS && now <= end + LOOKBACK_MS;
  });
  if (!due.length) return [];

  const [state, ledger] = await Promise.all([deps.state(), deps.ledger()]);

  const flagged: string[] = [];
  for (const e of due) {
    const start = Date.parse(e.startsAt);
    const end = start + e.durationMin * 60_000;
    // Anything that started within an hour either side counts. Deliberately
    // loose: a false "covered" costs one missed alert, a false "missed" costs
    // the operator's trust in every alert after it.
    const near = (iso?: string) => {
      const t = iso ? Date.parse(iso) : NaN;
      return Number.isFinite(t) && t >= start - 3600_000 && t <= end + 3600_000;
    };
    const covered =
      (state?.status === "live" && near(state.startedAt)) ||
      ledger.some(b => near(b.startedAt));
    if (covered) continue;

    if (!(await deps.once(`coverage:alerted:${e.id}`, 7 * 24 * 3600))) continue;
    flagged.push(e.id);
    await deps.alert(
      `⚠️ Not covering: ${e.title}`,
      [
        `${e.title} started at ${new Date(start).toUTCString()} and no broadcast is running or recorded for it.`,
        ``,
        `Discovery did not find it on a watched channel. To cover it now, start it manually through /api/admin/go-live, or queue the recording afterwards with POST /api/check-video {"url": "<youtube url>"}.`,
        ``,
        `Source: ${e.sourceUrl}`,
      ].join("\n"),
    );
  }
  return flagged;
}
