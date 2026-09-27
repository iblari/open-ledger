// Re-time a finished broadcast's claims against its own recording.
//
// Live, a claim can only be stamped when the transcript chunk containing it
// finishes — tens of seconds after the words — and in STREAM time, which is not
// the same clock as the recording YouTube keeps afterwards (pre-roll slates get
// trimmed, joins happen late, the chain restarts). Replay then papered over
// that with a fixed 30-second lead and a guessed stream→video shift, and every
// "jump to this claim" landed somewhere in a minute-wide window.
//
// Once the broadcast is over there is nothing left to guess. The recording is
// transcribed with word-level timestamps and each quote is located in it
// directly, so a claim's time is the moment its first word is spoken in the
// very video the player is showing.

export interface Word { w: string; s: number }

export interface AlignInput {
  quote: string;
  /** The live stamp, stream time. Only used to break ties between repeats. */
  videoTime?: number;
}

export interface AlignResult {
  /** normalizeQuote(quote) → start second in the recording. */
  times: Record<string, number>;
  /** Median (live stamp − recording time) across confident matches. Applied
   *  to any claim that could not be located, so it is at least as close as
   *  the live stamp was. */
  offset: number;
  matched: number;
  total: number;
}

/** Lower-case, strip punctuation, drop thousands separators so "25,000,000"
 *  and "25000000" compare equal. */
export function normTok(t: string): string {
  return t.toLowerCase().replace(/(\d),(?=\d)/g, "$1").replace(/[^a-z0-9%$.]/g, "").replace(/\.$/, "");
}

export function tokens(s: string): string[] {
  return s.split(/\s+/).map(normTok).filter(Boolean);
}

/** Stable key for a claim across the replay store and the ledger, whose claim
 *  ids differ but whose quotes are identical. */
export function normalizeQuote(q: string): string {
  return tokens(q).join(" ");
}

/**
 * Best in-order match of `q` starting at word index i: greedy walk through a
 * window a little longer than the quote, allowing for words the live and the
 * recorded transcription heard differently. Returns matched fraction and the
 * index of the first matched word.
 */
function scoreAt(words: Word[], q: string[], i: number): { score: number; first: number } {
  const span = Math.min(words.length, i + Math.ceil(q.length * 1.4) + 3);
  let k = 0, first = -1, hits = 0;
  for (let j = i; j < span && k < q.length; j++) {
    // Look a couple of tokens ahead in the quote so one dropped word does not
    // derail the rest of the match.
    for (let look = 0; look < 3 && k + look < q.length; look++) {
      if (words[j].w === q[k + look]) {
        if (first < 0) first = j;
        hits++;
        k += look + 1;
        break;
      }
    }
  }
  return { score: hits / q.length, first };
}

interface Cand { t: number; score: number }

function candidates(words: Word[], q: string[]): Cand[] {
  if (!q.length) return [];
  const out: Cand[] = [];
  // Only start where one of the quote's first five tokens occurs — cheap to
  // check. Five, not three: when the opening words are misheard or dropped,
  // three left some quotes with no starting point at all.
  const heads = new Set(q.slice(0, 5));
  for (let i = 0; i < words.length; i++) {
    if (!heads.has(words[i].w)) continue;
    const { score, first } = scoreAt(words, q, i);
    if (score >= 0.6 && first >= 0) out.push({ t: words[first].s, score });
  }
  // Collapse overlapping starts of the same occurrence to its best score.
  out.sort((a, b) => a.t - b.t);
  const merged: Cand[] = [];
  for (const c of out) {
    const last = merged[merged.length - 1];
    if (last && c.t - last.t < 4) { if (c.score > last.score) merged[merged.length - 1] = c; }
    else merged.push(c);
  }
  return merged;
}

export function alignClaims(claims: AlignInput[], words: Word[]): AlignResult {
  const prepared = claims.map(c => ({ key: normalizeQuote(c.quote), q: tokens(c.quote), live: c.videoTime ?? 0 }));
  const cands = prepared.map(p => candidates(words, p.q));

  // Pass 1 — unambiguous, strong matches fix the offset between the live
  // stamps and the recording's clock.
  const offsets: number[] = [];
  prepared.forEach((p, i) => {
    const cs = cands[i];
    const best = cs.reduce<Cand | null>((a, c) => (!a || c.score > a.score ? c : a), null);
    if (!best || best.score < 0.85) return;
    const rivals = cs.filter(c => c !== best && c.score >= best.score - 0.05);
    if (rivals.length === 0 && p.live > 0) offsets.push(p.live - best.t);
  });
  offsets.sort((a, b) => a - b);
  const offset = offsets.length ? offsets[Math.floor(offsets.length / 2)] : 0;

  // Pass 2 — every claim takes its strongest candidate; where a line was said
  // more than once, the occurrence nearest the offset-corrected live stamp.
  const times: Record<string, number> = {};
  let matched = 0;
  prepared.forEach((p, i) => {
    const cs = cands[i];
    if (!cs.length) return;
    // A wide pool, then nearest-to-expected. A line said twice is transcribed
    // slightly differently each time, and with a narrow margin the cleaner
    // copy crowded out the real one: in testing, a planted repeat outscored
    // the true occurrence and moved three claims by two hours.
    const top = Math.max(...cs.map(c => c.score));
    const pool = cs.filter(c => c.score >= Math.min(top, Math.max(0.7, top - 0.25)));
    const expect = p.live > 0 ? p.live - offset : null;
    const pick = expect == null
      ? pool[0]
      : pool.reduce((a, c) => (Math.abs(c.t - expect) < Math.abs(a.t - expect) ? c : a));
    times[p.key] = Math.round(pick.t * 10) / 10;
    matched++;
  });

  return { times, offset: Math.round(offset), matched, total: claims.length };
}

/** Recording-timed transcript in the "[m:ss] text" form replay already reads. */
export function transcriptFromUtterances(utts: { start: number; text: string }[]): string {
  return utts
    .filter(u => u.text && u.text.trim())
    .map(u => {
      const s = Math.max(0, Math.floor(u.start));
      return `[${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}] ${u.text.trim()}`;
    })
    .join("\n");
}
