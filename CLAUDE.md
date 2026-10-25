# Vote Unbiased: notes for Claude

Vote Unbiased (voteunbiased.org) does economic and political intelligence:
live fact-checks of officials' claims against official data, plus charts of
official series. Next.js 16 (App Router) on Vercel, with Upstash KV.

The team: Ib is the CEO and decides. Claude does code and UI design. Sam is
the social media manager. They talk in the /team room.

## Rules for every change

- Every UI change must work on desktop and phone. Check both layouts.
  - Exception: the homepage Trending section is a desktop-only design; phone keeps the swipe strip.
- Neutral and numbers-first: no adjectives about people, no party framing.
- Brand: dark ink #14110E, paper #F8F5F0, red #E0493A. Serif headlines (Newsreader / Source Serif), DM Sans body.
- Don't change the dashboard UI (app/dashboard/DashboardClient.tsx) unless the request asks for it.
- Keep changes small and focused on the request. Read the relevant code before editing.
- `npx tsc --noEmit` already has errors in DashboardClient.tsx and app/api/live-fact-check. Don't add new ones.
- Never touch `.github/`, `lib/team.ts`, `lib/team-build.ts` or `app/api/team/`. They're security-sensitive.
- Never print or commit secrets or keys.

## Where things are

- Series catalog and fetchers: `lib/series.ts`.
- Date-based period math: `lib/period-math.ts`.
- Charts: `components/trending/ProChart.tsx`.
- Share images: `lib/og-chart.tsx`, `app/og/m/[file]`, `app/c/[key]/opengraph-image.tsx`.
- Sam's feed: `lib/share-kit.ts` → `/api/share-kit`, documented in `SAM.md`.
- Videos: `app/og-video/*`, rendered by `scripts/render-og-videos.mjs`.
- Trending claims: `lib/trending-claims.ts`, `lib/claim-series.ts`.
