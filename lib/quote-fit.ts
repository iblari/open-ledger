/**
 * Fitting quotes and findings into a fixed space without cutting a sentence
 * in half: prefer the whole text, then the sentence that carries the number,
 * then any complete sentence, then a clean clause. Only as a last resort a
 * clause with "…".
 */
const sentences = (s: string) => s.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+(?=["“A-Z0-9$])/).map(x => x.trim()).filter(Boolean);
const hasNum = (s: string) => /\d/.test(s);

/** Best complete excerpt of `text` within `max` characters. `complete` is false only for the "…" fallback. */
export function excerpt(text: string, max: number): { text: string; complete: boolean } {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return { text: t, complete: true };
  const ss = sentences(t);
  // Two adjacent sentences, the first with a number, if they fit together.
  for (let i = 0; i < ss.length - 1; i++) {
    const two = `${ss[i]} ${ss[i + 1]}`;
    if (hasNum(ss[i]) && two.length <= max) return { text: two, complete: true };
  }
  const withNum = ss.filter(s => hasNum(s) && s.length <= max);
  if (withNum.length) return { text: withNum.sort((a, b) => b.length - a.length)[0], complete: true };
  const any = ss.filter(s => s.length <= max && s.length >= 20);
  if (any.length) return { text: any[0], complete: true };
  // A clause: cut at the last ; , — before max (keeping it reasonably long).
  const cut = t.slice(0, max - 1);
  const at = Math.max(cut.lastIndexOf("; "), cut.lastIndexOf(", "), cut.lastIndexOf(" — "));
  const base = at > max * 0.5 ? cut.slice(0, at) : cut.replace(/\s+\S*$/, "");
  return { text: base.replace(/[,;:\s]+$/, "") + "…", complete: false };
}

/** The first number in a text, with its unit, as written ("301%", "$102.3B", "13.6 million"). */
export function firstNumber(s: string): string | null {
  const m = s.match(/[$]?\d[\d,]*(?:\.\d+)?\s?(?:%|percent|(?:k|m|b|t)\b|thousand|million|billion|trillion|per 100,?000|points?|pts)?/i);
  if (!m) return null;
  return m[0].trim().replace(/\s?percent$/i, "%").replace(/,$/, "");
}
