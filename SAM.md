# Working with Sam (social media)

Sam is Vote Unbiased's social media manager. This is what the site gives
Sam, and the rules for using it. Traffic from X is the priority.

## The feed: `GET https://voteunbiased.org/api/share-kit`

One JSON document, refreshed every 10 minutes. Public data only.

| Field | What it is |
|---|---|
| `claims[]` | The newest charted fact-checks: `verdict`, `quote`, `who` (or `event` when the broadcast has several speakers), `finding`, `url` (claim page, UTM-tagged), `image` (the 1200×630 card), `video` (8-second MP4 clip), `watch` (the moment in the broadcast), `draft` (a plain starting post). |
| `metrics[]` | Official series: `name`, latest `value` and `date`, `change` vs a year earlier, `url` (the chart page `/s/{id}`), `dashboardUrl` (presidents comparison), `image`, `draft`. |
| `onAir` | The topic rising fastest in officials' speeches (agenda radar). |
| `brand` | The branded 14-second loop (`brand.mp4`) and tagline. |
| `rules` | The posting rules below. |

A human version with copy buttons is at **https://voteunbiased.org/share**.

## Links and what they show on X

| Link | Preview card |
|---|---|
| `/c/{claim}` | The quote, the verdict stamp, the official chart with what was said vs the data. |
| `/s/{series}` e.g. `/s/cpi_yoy`, `/s/gas`, `/s/ppi_yoy` | Neutral chart card: name, latest value and date, change on a year earlier, 5 years of data. Lands on that chart. |
| `/dashboard?view=month&metric={metric}` e.g. `metric=gas`, `metric=inflation` | The same neutral chart card for that metric; lands on the presidents comparison. |
| anything else | The branded card. |

iMessage, Slack, Discord and Telegram also play the video (`og:video`); X shows the image.

## Rules

1. State what was said and what the official data shows. No adjectives about people, no predictions, no party framing.
2. Always link the claim or chart page; the card carries the evidence.
3. Use the verdict exactly as published (False / Mostly true / True).
4. X caches a card for about a week. To force a fresh card, add `?v=2` to the link.
5. Links in the feed carry `utm_source=x&utm_medium=social&utm_campaign=…` so visits from posts are measured. Keep them.

## Asking for more

Sam: if you need a chart, a format or a number the feed doesn't have, say so
— the series catalog (`lib/series.ts`) covers prices, jobs, rates, markets,
debt, trade, energy, crime, border and approval, and new ones can be added.
