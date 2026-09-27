import type { MetadataRoute } from "next";

// The public, linked-from-home pages. Keep this list to pages we want in
// search results; previews and admin tools stay out.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://voteunbiased.org";
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/dashboard`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/live`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
  ];
}
