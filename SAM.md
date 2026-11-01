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
| `imagePortrait`, `imageSquare` | Instagram versions of the card (see below) |
| `video` | 8-second 16:9 MP4, or `null` until rendered. Only claims charted against an official series get one; use `image` otherwise. |
| `watch` | The moment in the broadcast |
| `caption` | Draft in Sam's format, fitted to 280 characters with the link counted as 23: `Claim: "…" <data> (<source>). <link> #Topic`. The data line is never cut mid-sentence. A long quote is trimmed to its sentence with the number; if that's still too long, "…" marks the omission. |
| `hook` | One line, numbers first. `Said: 301%. Data: 68.9% (IMF).` appears only when the two numbers are clearly the same kind and differ; otherwise it's the rating plus the finding. |
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
| `imagePortrait`, `imageSquare` | Instagram versions of the card (see below) |
| `video` | 8-second MP4 of the chart animating in. It is `null` until the clip for the current number has rendered (within about an hour of a release). It never points to a clip with an old number. |
| `dataUpdatedAt` | When this reading first appeared on the site |
| `releasedLast24h` | The release-day trigger |
| `hook` | For example "US inflation: 3.7%, up 0.7 pts vs a year earlier." |
| `nextRelease` | When the next official update is due (ISO time, ET offset) |

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

### `calendar[]`: upcoming releases

`calendar[]` lists the next official releases, for pre-scheduling: CPI, jobs, PPI and GDP (from the BLS and BEA schedules via FRED), plus weekly gas prices (EIA, Mondays). Each entry has:

- `name` and `agency`;
- `date`, `timeET` and `datetime`;
- `metrics` and `links`;
- `daysAway`.

The same list is at `GET /api/release-calendar`.

### `stories[]`: News stories (who covered it)

Up to 25 stories covered by at least 5 outlets, newest counts first.

| Field | |
|---|---|
| `id` | `story:{id}`, stable for the story |
| `title` | Our neutral wording of the story |
| `coverage` | Outlets covering it: `left`, `center`, `right`, `unrated` |
| `rate` | Share of each side's outlets that covered it (0–1) |
| `dataLine` | One line, e.g. "Covered by 3 of 32 left-leaning (9%), 9 of 31 center (29%) and 12 of 31 right-leaning (39%) outlets we read, as of Oct 28, 4:10 PM ET" |
| `link` | The story page, with UTM tags (`utm_campaign=news`, `utm_content=story:{id}`) |
| `image` | The 1200×630 card (title, three bars, "as of" time). Its URL changes when the counts change |
| `imagePortrait`, `imageSquare` | Instagram versions of the card (see below) |
| `caption` | Draft: title, data line, link |
| `asOf`, `updatedAt` | When the counts were read, and when they last changed. `?updated_since=` filters on `updatedAt` |

Post the counts as they are. Don't say a side is biased or hiding a story.

The same stories are at `GET /api/news?since=ISO&limit=N`.

### Instagram images (`imagePortrait`, `imageSquare`)

Every claim, metric and story has two ready PNGs, the same design as `image`, laid out for Instagram:

- `imagePortrait`: 1080×1350 (4:5)
- `imageSquare`: 1080×1080

They are public, stable URLs of the form `https://voteunbiased.org/og/ig/{portrait|square}/{c|m|n}/{id}.png` (`c` claim key, `m` metric id, `n` story slug). Post them as they are, no re-rendering. A metric's or story's URL carries `?v=` so it changes when the number does; a changed URL means a changed card. The human view at `/share` has the links and copy buttons under each card.

### Traffic: `GET /api/traffic?since=YYYY-MM-DD`

Send your team key (`Authorization: Bearer …` or `?key=`). The response gives visits:

- per post: `byPost[].id` matches the feed's `id`, through `utm_content` on every link;
- per page;
- per source and campaign;
- per day, with `fromX`.

Only real browsers are counted, not link-preview bots, and each page counts once per visitor session.

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
| `/news/{story}` | The story card: neutral title, how many of each side's outlets covered it, "as of" time |
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
5. Keep the UTM tags (`utm_source=x&utm_medium=social&utm_content=<id>`). They're how visits per post get counted in `/api/traffic`.

## Asking for more

Sam: if you need a chart, format or number the feed doesn't have, say so.
The series catalog (`lib/series.ts`) covers prices, jobs, rates, markets,
debt, trade, energy, crime, border and approval, and new series can be added.
