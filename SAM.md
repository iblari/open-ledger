# Working with Sam (social media)

Sam is Vote Unbiased's social media manager. This is what the site gives
Sam and the rules for using it. Traffic from X is the priority.

## Sam's routine (agreed)

- **Hourly:** read the feed with `?updated_since=<last run>`. Post each new claim right away, up to 3 per run. Claims rated True, Mostly true and False are all posted.
- **About 8 AM ET:** schedule 3–4 posts across the day.
- **Release days:** when a metric in Sam's list has `releasedLast24h: true`, post its card the same day. Sam's list is CPI, core CPI, gas, jobs, unemployment, debt and PPI.

## The feed: `GET https://voteunbiased.org/api/share-kit`

Public JSON, with up to 2 minutes of edge caching.

`?updated_since=2026-10-24T12:00:00Z` returns only:

- claims first published after that time, and
- metrics whose data changed after that time.

Every item has a stable `id`. Use it to skip anything already posted.

### `claims[]` (newest first, up to 60)

| Field | |
|---|---|
| `id` | Stable, `claim:{key}` |
| `claimText` | The quote |
| `speaker` | Null when the broadcast has several speakers; use `event` then |
| `rating`, `ratingLabel` | `TRUE` / `MOSTLY TRUE` / `FALSE`, shown as "True" etc. The site has no "Mostly false" rating. |
| `dataLine` | What the data shows, one sentence, numbers first |
| `source` | Agency or publisher of the data |
| `topic`, `hashtag` | For example "Inflation & prices", `#Inflation` |
| `link` | The claim page, with UTM tags |
| `image` | The 1200×630 card (PNG) |
| `video` | 8-second 16:9 MP4, or `null` until rendered. Only claims charted against an official series get one; use `image` otherwise. |
| `watch` | The moment in the broadcast |
| `caption` | Draft in Sam's format, fitted to 280 characters: `Claim: "…" <data> (<source>). <link> #Topic` |
| `firstSeenAt` | When the site first published it |

### `metrics[]`

| Field | |
|---|---|
| `id` | `metric:{series}:{observationDate}`. It changes when new data lands, so each release is a new item. |
| `metric`, `name` | Series id and plain name |
| `value`, `observationDate`, `observationLabel`, `change` | The latest reading, and how it compares with a year earlier |
| `dataLine`, `source`, `hashtag`, `caption` | Draft pieces |
| `link` | The chart page `/s/{series}` |
| `dashboardLink` | The presidents comparison page |
| `image` | The card. It includes `?d=` so X fetches a fresh card after each release. |
| `video` | 8-second MP4 of the chart animating in. It is `null` until the clip for the current number has rendered (within about an hour of a release). It never points to a clip with an old number. |
| `dataUpdatedAt` | When this reading first appeared on the site |
| `releasedLast24h` | The release-day trigger |

Sam's metric ids:

| Metric | Id |
|---|---|
| CPI | `cpi_yoy`, `cpi_mom` |
| Core CPI | `core_cpi_yoy` |
| Gas | `gas` |
| Jobs | `payrolls_chg` |
| Unemployment | `unemployment` |
| Debt | `debt` |
| PPI | `ppi_yoy`, `ppi_mom` |

### Other fields

- `onAir`: the topic rising fastest in officials' speeches.
- `brand`: the 14-second brand loop.
- `rules`: the posting rules, below.

A human version with copy buttons is at **https://voteunbiased.org/share**.

## Links and what they show on X

| Link | Preview card |
|---|---|
| `/c/{claim}` | The quote, the rating stamp, and the official chart with what was said vs the data |
| `/s/{series}` | Neutral chart card: name, latest value and date, change on a year earlier, 5 years of data |
| `/dashboard?view=month&metric={metric}` | The same neutral card; lands on the presidents comparison |
| anything else | The brand card |

## Video specs

- Format: MP4 (H.264, yuv420p, faststart), 1200×628 (16:9), 8 seconds for claims and metrics.
- Size: typically under 1 MB.
- Rendering: hourly, by `.github/workflows/og-videos.yml`.
- Hosting: stored on the `og-media` branch and served from `/og/v/`.

## Rules

1. Numbers first. State what was said and what the official data shows. No adjectives about people, no predictions, no party framing.
2. Use the site's rating exactly. Never upgrade or soften it.
3. Always link the exact claim or chart page.
4. X caches a card for about a week. To force a fresh card, add `&v=2` to the link.
5. Keep the UTM tags (`utm_source=x&utm_medium=social`) so visits from posts are measured.

## Asking for more

Sam: if you need a chart, format or number the feed doesn't have, say so.
The series catalog (`lib/series.ts`) covers prices, jobs, rates, markets,
debt, trade, energy, crime, border and approval, and new series can be added.
