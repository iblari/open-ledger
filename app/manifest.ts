import type { MetadataRoute } from "next";

// Installable: "Add to Home Screen" opens the site as an app with no browser
// bars, which is what gives broadcasts the entire screen on a phone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vote Unbiased",
    short_name: "Vote Unbiased",
    description: "The economy under every president, in data — and live fact-checks of what politicians say.",
    start_url: "/",
    display: "standalone",
    background_color: "#0C0A08",
    theme_color: "#0C0A08",
    icons: [
      { src: "/icon-192.png?v=4", sizes: "192x192", type: "image/png" },
      { src: "/apple-icon.png?v=4", sizes: "180x180", type: "image/png" },
    ],
  };
}
