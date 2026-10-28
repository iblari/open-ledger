import { permanentRedirect } from "next/navigation";

/** Trending is now the Claims view of the News tab. */
export default function TrendingPage() {
  permanentRedirect("/news?view=claims");
}
