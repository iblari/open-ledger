import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/lab", "/og-video"] }],
    sitemap: "https://voteunbiased.org/sitemap.xml",
    host: "https://voteunbiased.org",
  };
}
