/**
 * Stable, shareable addresses for individual fact-checks.
 *
 * Claims have no id that survives the trip from the live feed into the
 * permanent ledger (the ledger keeps quote, verdict and figures only), so the
 * key is derived from what both sides DO keep: the broadcast's videoId and
 * the quote. Hashing a normalised quote means a link shared mid-broadcast
 * still resolves after the broadcast is archived.
 *
 * Shared by the client (Share button) and the server (/c/[key] lookup), so it
 * must stay dependency-free.
 */

export function normQuote(q: string): string {
  return (q || "")
    .toLowerCase()
    .replace(/[‘’“”"'`]/g, "")
    .replace(/[^a-z0-9$%.,\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** FNV-1a, 32-bit, base36 — short and stable; collisions within one site's
 *  few thousand claims are negligible, and the lookup checks the quote too. */
export function claimHash(videoId: string, quote: string): string {
  const s = `${videoId}|${normQuote(quote)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).padStart(7, "0");
}

/** First ~8 words of the quote, for a readable (and searchable) URL. */
export function claimSlug(quote: string): string {
  return normQuote(quote)
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/).filter(Boolean).slice(0, 8).join("-")
    .slice(0, 70)
    .replace(/-+$/, "");
}

export function claimPath(videoId: string, quote: string): string {
  const slug = claimSlug(quote);
  return `/c/${slug ? slug + "-" : ""}${claimHash(videoId, quote)}`;
}

/** The hash is always the last dash-separated segment of the key. */
export function hashFromKey(key: string): string {
  const parts = decodeURIComponent(key || "").split("-");
  return parts[parts.length - 1] || "";
}
