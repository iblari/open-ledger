/**
 * Email alerts — "we're live fact-checking X right now".
 *
 * The universal channel. Push is instant but demands an install on iPhone;
 * email reaches every subscriber on a list that already exists, and most
 * people already have mail notifications on their phone.
 *
 * Sent by Resend (free tier ≈ 3,000/month, well beyond a few alerts a week).
 * Configure RESEND_API_KEY in Vercel; without it every function here no-ops,
 * so the code is safe to ship before the key exists.
 *
 * Discipline:
 *  - One-click unsubscribe, honoured instantly, plus the List-Unsubscribe
 *    header so Gmail/Apple render their native unsubscribe button.
 *  - Alerts only fire at go-live: no digests, no drip, no marketing.
 *  - Failures are logged and swallowed — a mail outage must never break a
 *    live broadcast.
 */

import { createHmac } from "crypto";
import { getSubscribers } from "./live-kv";

const RESEND_URL = "https://api.resend.com/emails";
const FROM = process.env.ALERT_FROM || "Vote Unbiased <alerts@voteunbiased.org>";
// Until the domain's DNS records are verified with Resend, the branded sender
// is rejected (403 validation_error). Rather than dropping the alert, retry
// once from Resend's shared sender — deliverability is worse but the viewer
// still gets told a broadcast is live. Once DNS verifies, the branded sender
// succeeds on the first attempt and this never fires.
const FALLBACK_FROM = "Vote Unbiased <onboarding@resend.dev>";
const SITE = "https://voteunbiased.org";

/** Stateless unsubscribe token — no extra storage, can't be forged. */
export function unsubToken(email: string): string {
  const secret = process.env.ADMIN_KEY || "vu-unsub";
  return createHmac("sha256", secret).update(email.toLowerCase()).digest("hex").slice(0, 24);
}
export function verifyUnsub(email: string, token: string): boolean {
  return !!email && !!token && unsubToken(email) === token;
}

function unsubUrl(email: string): string {
  return `${SITE}/api/unsubscribe?e=${encodeURIComponent(email)}&t=${unsubToken(email)}`;
}

function html(title: string, sourceLabel: string, email: string): string {
  const u = unsubUrl(email);
  return `<!doctype html><html><body style="margin:0;background:#f8f5f0;font-family:-apple-system,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f5f0;padding:24px 12px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border:1px solid #e2ded6;border-radius:8px;overflow:hidden">
        <tr><td style="padding:18px 22px;border-bottom:1px solid #e2ded6">
          <span style="font-family:Georgia,serif;font-size:17px;font-weight:900;color:#1a1a1a">Vote Unbiased</span>
          <span style="float:right;font-size:12px;font-weight:700;color:#c1272d">● LIVE NOW</span>
        </td></tr>
        <tr><td style="padding:22px">
          <p style="margin:0 0 6px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#5c5856">Fact-checking in progress</p>
          <h1 style="margin:0 0 10px;font-family:Georgia,serif;font-size:22px;line-height:1.25;color:#1a1a1a;font-weight:600">${title}</h1>
          <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#5c5856">
            We're transcribing this broadcast and checking every economic claim against official data —
            BLS, BEA, Treasury and the Fed — as it's spoken. ${sourceLabel}
          </p>
          <a href="${SITE}/live" style="display:inline-block;background:#b8372d;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:13px 26px;border-radius:6px">Watch the live fact-check →</a>
          <p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#9a9490">
            Claims appear with their rating, the real number, and a link to the source. No spin — you interpret.
          </p>
        </td></tr>
        <tr><td style="padding:14px 22px;background:#f3ede5;font-size:11px;line-height:1.6;color:#9a9490">
          You're receiving this because you subscribed at voteunbiased.org.
          <a href="${u}" style="color:#5c5856">Unsubscribe</a> — one click, takes effect immediately.
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

export interface AlertResult { sent: number; failed: number; skipped?: string }

/** Email every subscriber that coverage has begun. */
export async function sendLiveAlert(title: string, source?: string): Promise<AlertResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: 0, failed: 0, skipped: "RESEND_API_KEY not configured" };

  const subs = await getSubscribers();
  const emails = [...new Set(subs.map(s => s.email).filter(e => /.+@.+\..+/.test(e)))];
  if (!emails.length) return { sent: 0, failed: 0, skipped: "no subscribers" };

  const sourceLabel = source ? `Source: ${source}.` : "";
  let sent = 0, failed = 0;

  // Small batches keep us clear of rate limits and let one bad address fail alone.
  for (let i = 0; i < emails.length; i += 10) {
    const batch = emails.slice(i, i + 10);
    await Promise.all(batch.map(async (email) => {
      const send = (from: string) => fetch(RESEND_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          from,
          to: [email],
          subject: `🔴 Live now: ${title}`,
          html: html(title, sourceLabel, email),
          headers: {
            // Gmail/Apple render a native unsubscribe control from these.
            "List-Unsubscribe": `<${unsubUrl(email)}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }),
      });
      try {
        let r = await send(FROM);
        if (r.status === 403 && FROM !== FALLBACK_FROM) {
          console.warn("[email] branded sender rejected (domain not verified yet) — using fallback");
          r = await send(FALLBACK_FROM);
        }
        if (r.ok) sent++;
        else { failed++; console.error("[email] resend", r.status, await r.text().catch(() => "")); }
      } catch (e) { failed++; console.error("[email] failed:", (e as Error).message); }
    }));
  }
  console.log(`[email] live alert "${title}": ${sent} sent, ${failed} failed`);
  return { sent, failed };
}
