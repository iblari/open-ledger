import { NextRequest, NextResponse } from "next/server";
import { verifyUnsub } from "@/lib/email-alerts";
import { getSubscribers, setSubscribers } from "@/lib/live-kv";

/**
 * GET  /api/unsubscribe?e=…&t=…  — one click from an email footer
 * POST same params               — Gmail's One-Click (RFC 8058)
 * Removal is immediate; the token is an HMAC so links can't be forged.
 */
async function remove(email: string, token: string) {
  if (!verifyUnsub(email, token)) return false;
  const subs = await getSubscribers();
  const next = subs.filter(s => s.email.toLowerCase() !== email.toLowerCase());
  await setSubscribers(next);
  return true;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("e") || "";
  const ok = await remove(email, searchParams.get("t") || "");
  const body = ok
    ? `<h1>Unsubscribed</h1><p>${email} has been removed. You won't receive further alerts.</p>`
    : `<h1>Link expired</h1><p>We couldn't verify that unsubscribe link. Reply to any alert and we'll remove you by hand.</p>`;
  return new NextResponse(
    `<!doctype html><html><body style="font-family:-apple-system,sans-serif;max-width:520px;margin:60px auto;padding:0 20px;color:#1a1a1a">
      ${body}<p style="margin-top:24px"><a href="https://voteunbiased.org" style="color:#b8372d">← voteunbiased.org</a></p>
    </body></html>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ok = await remove(searchParams.get("e") || "", searchParams.get("t") || "");
  return NextResponse.json({ ok });
}
