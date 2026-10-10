import { kvGet, kvSetMany } from "./live-kv";

/**
 * Daily closes for the last 14 calendar days, per ticker, for the radar's
 * "price, last 14 days" column. Yahoo's public chart endpoint (no key);
 * cached in KV for 6 hours per symbol, so a busy page costs a few dozen
 * requests a day at most. Any failure just means no chart for that row.
 *
 * Context only: the line shows how the stock moved over the same window the
 * mentions were counted in. It does not claim the mentions moved it.
 */
export interface Stock14 { symbol: string; closes: number[]; dates: string[]; changePct: number; asOf: string }

const KEY = (s: string) => `stock:v1:${s}`;
const TTL = 6 * 3600;

/** Only real listed symbols: "AAPL", "TM", "005930.KS", "ASB.AX". */
export function isTicker(t?: string): t is string {
  return !!t && /^[A-Z0-9]{1,6}(?:\.[A-Z]{1,3})?$/.test(t);
}

async function fetchOne(symbol: string): Promise<Stock14 | null> {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; VoteUnbiased/1.0)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    const ts: number[] = res?.timestamp || [];
    const cl: (number | null)[] = res?.indicators?.quote?.[0]?.close || [];
    const cutoff = Date.now() / 1000 - 14 * 86400;
    const pts = ts.map((t, i) => ({ t, c: cl[i] })).filter(p => p.t >= cutoff && typeof p.c === "number") as { t: number; c: number }[];
    if (pts.length < 2) return null;
    const first = pts[0].c, last = pts[pts.length - 1].c;
    return {
      symbol,
      closes: pts.map(p => Math.round(p.c * 100) / 100),
      dates: pts.map(p => new Date(p.t * 1000).toISOString().slice(0, 10)),
      changePct: Math.round(((last - first) / first) * 1000) / 10,
      asOf: new Date(pts[pts.length - 1].t * 1000).toISOString(),
    };
  } catch { return null; }
}

export async function getStocks(symbols: string[]): Promise<Record<string, Stock14>> {
  const syms = [...new Set(symbols.filter(isTicker))];
  if (!syms.length) return {};
  const cached = await kvGet(syms.map(KEY)).catch(() => syms.map(() => null));
  const out: Record<string, Stock14> = {};
  const missing: string[] = [];
  syms.forEach((s, i) => {
    const raw = cached[i];
    if (raw) { try { const v = JSON.parse(raw); if (v && v.closes) { out[s] = v; return; } if (v && v.none) return; } catch { /* refetch */ } }
    missing.push(s);
  });
  // Six at a time: polite to the endpoint, quick enough for ~30 symbols.
  const save: [string, string, number][] = [];
  for (let i = 0; i < missing.length; i += 6) {
    const batch = missing.slice(i, i + 6);
    const got = await Promise.all(batch.map(fetchOne));
    batch.forEach((s, k) => {
      const v = got[k];
      if (v) out[s] = v;
      // Remember a miss too (shorter), so a delisted symbol isn't retried every load.
      save.push([KEY(s), JSON.stringify(v ?? { none: true }), v ? TTL : 3600]);
    });
  }
  if (save.length) await kvSetMany(save).catch(() => {});
  return out;
}
