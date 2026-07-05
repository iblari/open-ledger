import { NextResponse } from "next/server";
import { appendSubscriber } from "@/lib/live-kv";

const BASE44_APP_ID = "69cef7927e5cceaa129290ca";
const BASE44_ENTITY = "Subscribers";
const BASE44_URL = `https://app.base44.com/api/v1/apps/${BASE44_APP_ID}/entities/${BASE44_ENTITY}`;

function isValidEmail(email: string): boolean {
  if (!email) return false;
  return email.includes("@") && email.includes(".");
}

export async function POST(req: Request) {
  let body: { email?: string; feedback?: string | null; source?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = (body.email || "").trim();
  const feedback = body.feedback || "";
  const source = body.source || "popup";

  // Must have at least one of email or feedback
  if (!email && !feedback) {
    return NextResponse.json({ error: "Email or feedback required" }, { status: 400 });
  }

  // If email was provided, validate it
  if (email && !isValidEmail(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  const payload = {
    email: email || "(feedback-only)",
    feedback,
    signed_up_at: new Date().toISOString(),
    source,
  };

  // ALWAYS persist to our own KV first — this is the durable system of
  // record. (Historic bug: with no BASE44_API_KEY configured, emails only
  // went to console.log, which Vercel retains ~1 day. Subscribers were
  // being lost.) Export: GET /api/admin/subscribers.
  let kvOk = false;
  try {
    await appendSubscriber(payload);
    kvOk = true;
  } catch (e) {
    console.error("[SUBSCRIBE] KV persist failed:", e);
  }
  // Belt-and-braces: still log, so even a KV outage leaves a trace.
  console.log(
    `[NEW SUBSCRIBER] ${payload.email} | feedback: ${payload.feedback || "(none)"} | source: ${payload.source} | ${payload.signed_up_at}`
  );

  const apiKey = process.env.BASE44_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: true, mode: kvOk ? "kv" : "log" });
  }

  // Post to Base44
  try {
    const res = await fetch(BASE44_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error(`[BASE44 ERROR ${res.status}] ${txt}`);
      // Still log it so we don't lose the subscriber
      console.log(
        `[NEW SUBSCRIBER — FALLBACK LOG] ${payload.email} | feedback: ${payload.feedback || "(none)"} | ${payload.signed_up_at}`
      );
      return NextResponse.json({ success: true, mode: "log-fallback" });
    }

    return NextResponse.json({ success: true, mode: kvOk ? "kv+base44" : "base44" });
  } catch (e: any) {
    console.error("[SUBSCRIBE ERROR]", e?.message || e);
    console.log(
      `[NEW SUBSCRIBER — FALLBACK LOG] ${payload.email} | feedback: ${payload.feedback || "(none)"} | ${payload.signed_up_at}`
    );
    return NextResponse.json({ success: true, mode: "log-fallback" });
  }
}
