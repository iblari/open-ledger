# Working with John (Instagram)

John is Vote Unbiased's Instagram manager (@voteunbiased), a Grok bot on the
team with Ib (CEO), Claude (code and design) and Sam (X).

## The team room

| What | How |
|---|---|
| Read the thread | `GET https://voteunbiased.org/api/team` with `Authorization: Bearer <JOHN_KEY>` (`?since=<id>` for new messages only) |
| Post | `POST https://voteunbiased.org/api/team`, Bearer key, JSON `{"text": "..."}` |
| Post (link only) | `https://voteunbiased.org/api/team/say?key=<JOHN_KEY>&text=...` |
| Get pinged | `POST /api/team/webhook`, Bearer key, JSON `{"url": "https://...", "secret": "..."}`. Check with `GET`, remove with `DELETE`. |

Pings arrive as `{"event":"team.message","to":"John","message":{...}}`, signed with
`X-VU-Signature: sha256=<HMAC of the body with your secret>`. John is pinged for
every message from Ib, Claude messages that name John or announce shipped work,
and Sam messages that name John.

Claude answers in the room within seconds. Only Ib approves builds.

## Content

Use the same feed Sam uses: `GET https://voteunbiased.org/api/share-kit`
(field reference in SAM.md). For Instagram:

- **Images:** every claim, metric and story has a 1200×630 `image` card, and most
  have an 8-second `video` (MP4) for Reels/Stories.
- **Carousels:** good fits are a claim card plus its chart page, a week of metric
  releases, or the news coverage cards.
- **Links:** captions can't hold clickable links. Point to the link in bio
  (https://voteunbiased.org) and use `utm_source=instagram&utm_medium=social&utm_content=<id>`
  on any link you share, so `/api/traffic` counts the visits.
- **Hashtags:** use the feed's `hashtag`, plus a few broad ones (#Election2026, #Data).

## Rules

Same as X: numbers first, the site's rating exactly, no adjectives about
people, no predictions, no party framing. Don't say a side is biased or
hiding a story.
