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

## Carousel slides (upload)

Instagram needs a public image URL for each carousel slide. Upload yours:

`POST https://voteunbiased.org/api/ig-slides` with `Authorization: Bearer <JOHN_KEY>`
(header only). One PNG per request, exactly 1080×1350, up to 4.5 MB (the
platform's request limit). Send it as raw bytes (`Content-Type: image/png`),
a multipart `file` field, or JSON `{"image_base64": "..."}`.

Returns `{"url": "https://voteunbiased.org/ig/<id>.png", ...}`. Use that URL as
the slide's `image_url`.

Video: the same endpoint also takes one H.264/AAC MP4 clip (raw bytes with
`Content-Type: video/mp4`, or the multipart `file` field; the type is detected
from the file). It returns `https://voteunbiased.org/ig/<id>.mp4`, served as
`video/mp4`, public, no login. A single request is limited to 4.5 MB; for bigger clips use the chunked upload below. The id is random and unguessable; slides are not listed,
not in the sitemap, and served with `noindex`. They are kept for 90 days.
Errors: 401 bad key, 400 not a 1080×1350 PNG, 413 too large.

### Videos up to 50 MB (chunked upload)

Same endpoint, same header (`Authorization: Bearer <JOHN_KEY>`, no `?key=`).
Cut the MP4 (H.264/AAC) into chunks of at most **4 MB** (4,194,304 bytes) and
send one `multipart/form-data` POST per chunk, in order, with these fields:

| Field | Value |
|---|---|
| `upload_id` | 32 hex characters (or a UUID) that you generate once per video: 128 random bits. It becomes the id in the public URL, so don't use a guessable value. |
| `chunk_index` | 0, 1, 2, … in file order (max 99). Chunk 0 must start with the MP4 header. |
| `is_final` | `false` for every chunk but the last, `true` for the last one. |
| `file` | The chunk's bytes (up to 4 MB). |

Each non-final chunk returns `202 {"committed": false, ...}`. The request with
`is_final=true` carries the last chunk and commits the clip: its `chunk_index`
must be the highest one, and chunks `0..chunk_index` must all have been
uploaded. It returns `201`:

`{"url": "https://voteunbiased.org/ig/<upload_id>.mp4", "bytes": 31457280, "width": 1080, "height": 1920, "committed": true}`

Example (curl; `split -b 4194304` makes the chunks):

```
ID=$(openssl rand -hex 16); i=0
split -b 4194304 reel.mp4 part_
for f in part_*; do
  last=false; [ "$f" = "$(ls part_* | tail -1)" ] && last=true
  curl -s -H "Authorization: Bearer $JOHN_KEY" -F upload_id=$ID -F chunk_index=$i -F is_final=$last -F file=@$f https://voteunbiased.org/api/ig-slides
  i=$((i+1))
done
```

Rules: total size up to 50 MB (413 above that). Re-sending a chunk index
replaces it, so a failed chunk can simply be retried. If a chunk is missing at
commit you get `400 missing chunk_index N`; upload it and send the final
request again. Reusing a committed `upload_id` returns `409`. Other errors:
401 bad key, 413 chunk over 4 MB, 400 bad field or not an H.264 MP4.

The URL is served as `video/mp4` with `Content-Length` and `Accept-Ranges: bytes`;
`Range` requests get `206 Partial Content` (and `416` if out of range), so
Buffer/Instagram can stream or resume. Clips are kept for 90 days.

## Rules

Same as X: numbers first, the site's rating exactly, no adjectives about
people, no predictions, no party framing. Don't say a side is biased or
hiding a story.
