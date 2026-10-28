import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/api/og"], disallow: ["/api/", "/admin", "/lab", "/og-video", "/share", "/team"] }],
    sitemap: "https://voteunbiased.org/sitemap.xml",
    host: "https://voteunbiased.org",
  };
}
