# Live Broadcast — automatic setup

This doc walks through turning on the automatic Live Broadcast pipeline.
After one-time setup, **adding a new live broadcast is just editing
`public/live-schedule.json` and pushing.** The GitHub Action handles the rest.

## How it works

```
                 ┌────────────────────────────┐
                 │ public/live-schedule.json  │
                 │   (you edit this)          │
                 └─────────────┬──────────────┘
                               │
                               ▼
       ┌───────────────────────────────────────────────┐
       │ GET /api/live-schedule  (on voteunbiased.org) │
       │   Reads the JSON, computes active/next event  │
       └─────────┬──────────────────────────┬──────────┘
                 │                          │
                 ▼                          ▼
       ┌─────────────────┐         ┌──────────────────────┐
       │ /live page      │         │ GitHub Action        │
       │   shows         │         │ live-broadcast.yml   │
       │   countdown     │         │   (cron: every 5min) │
       │   to next event │         └──────────┬───────────┘
       └─────────────────┘                    │
                                              │ if active:
                                              ▼
                              ┌────────────────────────────┐
                              │ scripts/go-live.mjs        │
                              │   yt-dlp → ffmpeg →        │
                              │   Deepgram → /api/admin/   │
                              │   ingest → Claude verify   │
                              │   → /api/live-feed → users │
                              └────────────────────────────┘
```

The whole loop:
1. You add an event to `public/live-schedule.json`, commit, push.
2. Within 5 minutes (next cron tick), the GitHub Action sees it.
3. **10 minutes before `scheduledStart`** the worker spins up.
4. Audio is pulled from the YouTube live stream, transcribed by Deepgram,
   chunked into 15-second slices, fact-checked by Claude, cross-checked
   against your BEA/BLS data via `lib/live-verify`, and pushed to viewers.
5. **At `scheduledEnd`** (plus a 60-second grace), the worker auto-stops.

## One-time setup

### 1. Set GitHub repo secrets

`Settings → Secrets and variables → Actions → New repository secret`

Add three secrets:

| Name | Value | Where to get it |
|---|---|---|
| `DEEPGRAM_API_KEY` | the Deepgram key | https://console.deepgram.com (free tier covers ~750hr/yr) |
| `ADMIN_KEY` | a secret string YOU choose | Pick any random string. Add the SAME value to your Vercel env (it auths `/api/admin/*`). |
| `API_URL` | `https://voteunbiased.org` | Optional — defaults to this. Override if testing against a preview deployment. |

### 2. Confirm Vercel env vars

In Vercel `Settings → Environment Variables`, confirm these three are set
(without them the live pipeline fails silently or partially):

| Name | Why |
|---|---|
| `ANTHROPIC_API_KEY` | The Claude fact-check call needs it. Without it, `/api/admin/ingest` returns `{ error: "ANTHROPIC_API_KEY not configured" }`. |
| `ADMIN_KEY` | Same value as the GitHub secret. Without it, `/api/admin/ingest` returns 401. |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Persists the live state across serverless cold starts. Without them, your live broadcast vanishes the instant the function gets a cold-start hit (Upstash free tier is plenty). |

After adding env vars in Vercel, **redeploy** so the running functions
pick them up.

### 3. Verify the schedule endpoint works

```bash
curl https://voteunbiased.org/api/live-schedule | jq
```

Should return:
```json
{ "ok": true, "active": null, "next": {...}, "upcoming": [...] }
```

If `ok: false`, the JSON is malformed — fix `public/live-schedule.json`.

## Adding a broadcast

Edit `public/live-schedule.json`:

```json
{
  "events": [
    {
      "id": "potus-presser-2026-05-30",
      "title": "POTUS Press Conference",
      "speaker": "President",
      "source": "White House YouTube",
      "youtubeUrl": "https://www.youtube.com/watch?v=ABCDEF12345",
      "scheduledStart": "2026-05-30T19:00:00Z",
      "scheduledEnd":   "2026-05-30T20:30:00Z"
    }
  ]
}
```

**Field notes:**
- `id` — any stable slug. Used for dedup; if you rename it after the event has
  started, the worker will think it's a different event.
- `youtubeUrl` — must be a live or upcoming-live YouTube URL. The worker uses
  `yt-dlp` to pull audio. CSPAN-embed URLs and other non-YouTube sources are
  not yet supported.
- `scheduledStart` / `scheduledEnd` — **ISO 8601 with `Z` (UTC)** for clarity.
  Mistakes in timezone are the #1 source of "the worker didn't start" bugs.
- Bracket the broadcast generously — the worker pre-rolls 10 minutes before
  `scheduledStart` and post-rolls 30 minutes past `scheduledEnd`.

Commit + push to `main`. The Action picks up the new event on its next cron
tick (within 5 minutes).

## Watching it run

- **GitHub Actions tab** — when the cron fires you'll see a "Live Broadcast"
  workflow run. Click it to see the live logs (Deepgram transcripts, every
  claim Claude extracts, the verifier's rewrites, the ingest responses).
- **/live page** — the schedule card shows the event with a live countdown.
  Once the worker starts pushing claims (~15-30s after broadcast begins),
  they appear in real time.
- **Admin dashboard** — `https://voteunbiased.org/api/live-feed` is the raw
  state-of-the-broadcast endpoint, useful when debugging.

## Manual fallback

The auto-worker is opt-in per-event by virtue of being in the schedule. If
something goes wrong — schedule misconfigured, GitHub Actions outage, you
want to broadcast something not in the schedule — the same script works
from your local machine:

```bash
DEEPGRAM_API_KEY=xxx ADMIN_KEY=yyy \
  node scripts/go-live.mjs "https://youtube.com/watch?v=..." "Title" --duration 5400
```

`--duration` is optional; without it the script runs until ffmpeg exits
(when the broadcast ends) or you hit Ctrl+C.

## Caveats & known limits

- **Cron timing**: GitHub Actions free-tier cron can be delayed up to 15
  minutes under heavy load. The 10-minute pre-roll buffer in `lib/schedule.ts`
  is calibrated for this, but worst-case you may miss the first few minutes of
  a broadcast.
- **One event at a time**: the workflow uses a concurrency group, so two
  overlapping events would just run one. If you need to cover overlapping
  events, you'll want a real worker host (Fly.io / Railway) instead.
- **YouTube only**: CSPAN, raw RTMP, Twitter live, etc. are not supported.
  Most major political broadcasts (White House, congressional channels) do
  publish a YouTube live, so this is rarely a blocker.
- **6-hour ceiling**: GitHub Actions caps a single workflow run at 6 hours.
  The worker's `--duration` is capped at 5 hours (300 min default) so the
  job exits cleanly. Multi-day hearings would need additional logic.
- **Cost**: STT (Deepgram) ~$0.36/hr; Claude Haiku claim extraction ~$2-5/hr
  during heavy claim density. Storage in Upstash is free at this scale.

## Adding more anchored metrics

The data-layer integration verifies claims against the 6 metrics in
`lib/metrics-data.ts` (GDP, unemployment, inflation, S&P 500, debt-to-GDP,
median income). Adding a 7th — say, federal deficit — is mechanical:

1. Open `lib/metrics-data.ts`. Copy the time series for `deficit` from the
   dashboard's `M` object (`app/dashboard/page.tsx`).
2. Add it to `METRICS_DATA`, the `MetricKey` union, and `METRIC_LABELS` in
   `app/live/page.tsx`.
3. Done. The Claude prompt rebuilds its anchor block from `METRICS_DATA`
   automatically, the verifier picks up the new key, the fact card deep-link
   shows for matching claims.
