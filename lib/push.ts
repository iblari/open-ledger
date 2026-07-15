// Web-push notifications — "we're live fact-checking X right now".
//
// Design notes:
// - VAPID keys are generated ONCE on first use and persisted in KV, so no
//   secret ever lives in the repo and no manual env setup is needed.
// - Subscriptions are stored in KV (same Upstash the live pipeline uses).
// - The send moment is /api/admin/go-live action:start — the instant the
//   site actually flips live. No cron, no calendar guessing: viewers get
//   pinged exactly when there's something to watch.

import webpush from "web-push";

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function kvCmd(...args: (string | number)[]): Promise<unknown> {
  const resp = await fetch(`${UPSTASH_URL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const data = await resp.json();
  return data.result;
}

const KEYS_KEY = "push:vapid";
const SUBS_KEY = "push:subs";
const SUBJECT = "mailto:ibrahimlari7@gmail.com";

interface VapidKeys { publicKey: string; privateKey: string }

export async function getVapidKeys(): Promise<VapidKeys | null> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;
  const raw = (await kvCmd("GET", KEYS_KEY)) as string | null;
  if (raw) { try { return JSON.parse(raw); } catch { /* regenerate below */ } }
  const keys = webpush.generateVAPIDKeys();
  await kvCmd("SET", KEYS_KEY, JSON.stringify(keys));
  return keys;
}

export interface StoredSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  addedAt: string;
}

export async function getSubs(): Promise<StoredSub[]> {
  const raw = (await kvCmd("GET", SUBS_KEY)) as string | null;
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

async function saveSubs(subs: StoredSub[]): Promise<void> {
  await kvCmd("SET", SUBS_KEY, JSON.stringify(subs.slice(0, 5000)));
}

export async function addSub(sub: Omit<StoredSub, "addedAt">): Promise<number> {
  const subs = await getSubs();
  if (!subs.some(s => s.endpoint === sub.endpoint)) {
    subs.push({ ...sub, addedAt: new Date().toISOString() });
    await saveSubs(subs);
  }
  return subs.length;
}

export async function removeSub(endpoint: string): Promise<void> {
  const subs = await getSubs();
  await saveSubs(subs.filter(s => s.endpoint !== endpoint));
}

/** Push a notification to every subscriber; prunes dead endpoints (404/410). */
export async function sendPushToAll(payload: { title: string; body: string; url?: string }): Promise<{ sent: number; pruned: number }> {
  const keys = await getVapidKeys();
  if (!keys) return { sent: 0, pruned: 0 };
  const subs = await getSubs();
  if (!subs.length) return { sent: 0, pruned: 0 };
  webpush.setVapidDetails(SUBJECT, keys.publicKey, keys.privateKey);

  const dead: string[] = [];
  let sent = 0;
  await Promise.allSettled(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: s.keys },
        JSON.stringify(payload),
        { TTL: 3600 } // stale "we're live" pings are worthless after an hour
      );
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) dead.push(s.endpoint);
    }
  }));
  if (dead.length) {
    await saveSubs((await getSubs()).filter(s => !dead.includes(s.endpoint)));
  }
  return { sent, pruned: dead.length };
}
