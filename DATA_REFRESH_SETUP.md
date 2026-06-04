# Auto data refresh — setup

The 6 landing/dashboard headline metrics (GDP growth, unemployment, inflation,
S&P 500, debt-to-GDP, median income) automatically refresh from FRED once a
week, with no human action required. Here's the contract.

## How it works

```
                ┌─────────────────────────────────────┐
                │ .github/workflows/refresh-data.yml  │
                │ cron: every Monday 13:00 UTC        │
                └────────────────┬────────────────────┘
                                 │
                                 ▼
                  ┌────────────────────────────┐
                  │ scripts/refresh-data.mjs   │
                  │   pulls FRED for 6 metrics │
                  │   aggregates to annual     │
                  │   writes JSON              │
                  └────────────┬───────────────┘
                               │
                               ▼
                  ┌───────────────────────────────┐
                  │ data/fred-snapshot.json       │
                  │   { gdp: [...], etc. }        │
                  └────────────┬──────────────────┘
                               │
                               ▼
                  ┌───────────────────────────────┐
                  │ peter-evans/create-pull-request │
                  │   if snapshot changed → PR    │
                  │   if nothing changed → no-op  │
                  └───────────────────────────────┘
                               │
                               ▼
                       [you review + merge]
                               │
                               ▼
                  ┌───────────────────────────────┐
                  │ Vercel rebuilds               │
                  │ lib/metrics-data.ts imports   │
                  │ the new JSON at build time    │
                  │ site shows updated values     │
                  └───────────────────────────────┘
```

## One-time setup

### 1. Add the `FRED_API_KEY` GitHub repo secret

Settings → Secrets and variables → Actions → New repository secret.

Name: `FRED_API_KEY`
Value: the same key already in your Vercel env vars for Live Benchmark.

Don't have one yet? Free, 60 seconds to register:
https://fred.stlouisfed.org/docs/api/api_key.html

### 2. Confirm the workflow has commit permission

Settings → Actions → General → Workflow permissions → "Read and write
permissions" + "Allow GitHub Actions to create and approve pull requests."

This is required for the cron to commit the regenerated snapshot + open the PR.

### 3. Done

The cron fires Mondays. You can also manually trigger via Actions → "Refresh
data" → Run workflow whenever you want a fresh pull (e.g. the morning after a
big BLS release).

## What you'll see weekly

Monday morning, a PR titled "📊 Weekly data refresh" appears in your repo.
Diff is just `data/fred-snapshot.json` — typically a few lines updated as
FRED revises prior values + adds the latest print.

Review, merge, Vercel rebuilds, site updates. Total human time: ~30 seconds.

When nothing has changed (FRED hasn't published anything new since last
Monday), no PR — the workflow exits silently.

## What's covered

| Metric | FRED series | Aggregation |
|---|---|---|
| GDP Growth | `A191RL1Q225SBEA` | Mean of 4 quarterly % annualized |
| Unemployment | `UNRATE` | Annual mean of 12 monthly readings |
| Inflation (CPI YoY) | `CPIAUCSL` | YoY % from Dec(y) vs Dec(y-1) |
| S&P 500 | `SP500` | Year's last trading day close |
| Debt-to-GDP | `GFDEGDQ188S` | Year's Q4 reading |
| Median Income (real) | `MEHOINUSA672N` | Annual print, converted to $K |

## What's NOT covered (yet)

- **State Atlas data** — 25 metrics × 51 states, sourced from Census ACS,
  Zillow, EIA, FBI UCR, CDC. Each has its own API; building the ingestion
  is a separate ~2-day project. Until then, state data remains hand-typed
  per `lib/state-data.ts` (with a comment flagging which fields will be
  auto-refreshed when that lands).
- **Dashboard's 19 metrics** (`app/dashboard/page.tsx` `M` object) — many
  overlap with the 6 landing metrics but several (real wages, federal
  deficit, etc.) need their own FRED IDs. Will fold these into the same
  snapshot in a follow-up PR — touches the dashboard's much larger `M`
  object, wanted to ship the simpler 6-metric version first.
- **Live Benchmark** — already pulls live from FRED on every request via
  `/api/benchmark-data`. No change needed.

## Failure modes + what happens

| What | Behavior |
|---|---|
| FRED is down when the cron runs | Workflow fails. Snapshot is NOT overwritten. Next Monday tries again. No PR opened. |
| `FRED_API_KEY` secret missing | Script exits 1. Workflow fails visibly in the Actions tab — easy to spot. |
| FRED revises a number for an old year | PR diff shows the revision (e.g. 2023 unemployment 3.6 → 3.7). Merge to accept. |
| FRED returns fewer than 10 rows for any metric | Script refuses to write — refuses to publish a near-empty series. |
| You don't merge the PR for weeks | Site keeps showing the snapshot from the last merged PR. No data loss. |

## Manual testing

To verify locally before pushing changes to either the script or the
workflow:

```bash
FRED_API_KEY=xxx node scripts/refresh-data.mjs
```

You'll see per-metric pulls, the latest year/value, and the write path.
The file gets overwritten — diff against `git status` to see what would
have been in the PR.

## Cost

FRED is free, no daily quota. ~6 API calls per refresh = 24 per month.
GitHub Actions free tier covers the workflow runs easily (the job takes
~10 seconds end to end).

---

# State Atlas data refresh (parallel pipeline)

Same idea as the national FRED refresh above, but for the State Atlas's
per-state annual history. Runs Mondays 14:00 UTC, one hour after the
national refresh.

## How the State Atlas data flows

```
scripts/refresh-state-data.mjs
   ↓ (per-source ingestion blocks)
data/state-snapshot.json
   ↓ (imported by lib/state-data.ts at build time)
StateMetric.history is populated → stateHistory() prefers it over CAGR back-fill
   ↓
Trend chart shows REAL spikes/dips (2008 crash, 2020 COVID, 2022 home-price peak…)
```

Metrics without real data in the snapshot fall back to the existing CAGR
back-fill — both paths coexist, so wiring is incremental and safe.

## What's wired right now

| Metric | Source | Cadence | Setup |
|---|---|---|---|
| `median_home` | Zillow ZHVI state CSV | Monthly | None (open CSV) |

## What's planned (each is ~50-line addition to refresh-state-data.mjs)

| Metric(s) | Source | API key |
|---|---|---|
| `unemployment` | BLS LAUS | `BLS_API_KEY` (free) |
| `household_income`, `population`, `bachelors`, `uninsured` | Census ACS 1-year | `CENSUS_API_KEY` (free) |
| `gas`, `electricity` | EIA | `EIA_API_KEY` (free) |
| `violent_crime`, `murder_rate`, `property_crime` | FBI Crime Data Explorer | `FBI_API_KEY` (free) |
| `life_expectancy`, `infant_mortality`, `drug_deaths`, `maternal_mortality` | CDC NVSS / WONDER | None (CSV downloads) |
| `presidential_margin`, `voter_turnout` | MIT Election Lab | None (CSV downloads) |
| `gdp_capita` | BEA SAGDP | `BEA_API_KEY` (free) |

To add a new pipeline:

1. Write a `pullX()` function in `scripts/refresh-state-data.mjs` following
   the `pullZillowHomeValues()` pattern (parse upstream → produce
   `{ STATE_CODE: [12 values 2014..2025] }`).
2. Call it in `main()` and assign to `metrics[KEY] = { history: ... }`.
3. If the source needs an API key, add the env var to the GitHub Action
   step in `.github/workflows/refresh-state-data.yml`.
4. Add the API-key secret in GitHub Settings → Secrets and variables.

Done. Next Monday's refresh PR includes the new metric.

## Failure modes

| What | Behavior |
|---|---|
| Source API/CSV down | That pipeline fails, script exits 2, snapshot NOT overwritten |
| Source returns <40 states | Script refuses to write — refuses to publish a sparse series |
| Existing real history newer than upstream | Diff in PR shows the upstream's values (FRED-style revision); merge to accept |
| Metric not in snapshot | Falls back to CAGR back-fill (smooth line, no spikes) |

## Manual testing

```bash
node scripts/refresh-state-data.mjs
```

Watch for "51 states, 12 years" — that means a clean pull. The script
exits non-zero on any failure.
