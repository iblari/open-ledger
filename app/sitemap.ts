import type { MetadataRoute } from "next";
import { getLedger } from "@/lib/live-kv";
import { claimPath } from "@/lib/claim-link";
import { toVerdict } from "@/lib/live-design";

// The public, linked-from-home pages, plus one page per settled fact-check
// (true / misleading / false) — the pages people search for by quote.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://voteunbiased.org";
  const now = new Date();
  const pages: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/dashboard`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/live`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
  ];
  try {
    const seen = new Set<string>();
    for (const e of await getLedger()) for (const c of e.claims) {
      if (!c.quote || !toVerdict(c.rating)) continue;
      const p = claimPath(e.videoId, c.quote);
      if (seen.has(p)) continue; seen.add(p);
      pages.push({ url: base + p, lastModified: new Date(e.endedAt || e.startedAt), changeFrequency: "monthly", priority: 0.6 });
    }
  } catch { /* KV down: the core pages are still a valid sitemap */ }
  return pages;
}
