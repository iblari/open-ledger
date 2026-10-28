import { RATING_SCALE, ratingName } from "./broadcast-pages";

/** schema.org ClaimReview for one fact-check (1 = False … 4 = True). */
export function claimReviewLd(o: { url: string; quote: string; rating: string; speaker: string | null; date: string; appearance: string; appearanceUrl?: string; reviewBody?: string }) {
  const r = (o.rating || "").toUpperCase();
  return {
    "@context": "https://schema.org", "@type": "ClaimReview",
    url: o.url, claimReviewed: o.quote, datePublished: o.date.slice(0, 10),
    author: { "@type": "Organization", name: "Vote Unbiased", url: "https://voteunbiased.org" },
    itemReviewed: {
      "@type": "Claim", datePublished: o.date.slice(0, 10),
      ...(o.speaker ? { author: { "@type": "Person", name: o.speaker } } : {}),
      appearance: { "@type": "CreativeWork", name: o.appearance, ...(o.appearanceUrl ? { url: o.appearanceUrl } : {}) },
    },
    reviewRating: { "@type": "Rating", ratingValue: RATING_SCALE[r] ?? 2, worstRating: 1, bestRating: 4, alternateName: ratingName(r) },
    ...(o.reviewBody ? { reviewBody: o.reviewBody.slice(0, 500) } : {}),
  };
}
