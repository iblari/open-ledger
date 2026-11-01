import { fmtU, moneyIn, moneyMult, moneyParts } from "./chart-format";

export interface BarFigure { num: string; word: string }
export interface ClaimBars { said: number; data: number; saidFig: BarFigure; dataFig: BarFigure; metric: string; source: string; money: boolean; unit: string }

const close = (a: number, b: number) => Math.abs(a - b) <= 0.01 * Math.abs(b);

const ONES: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALE_WORD: Record<string, number> = { trillion: 1e12, billion: 1e9, million: 1e6 };

/** Amounts a quote writes without a "$" or scale word: "25,000,000,000,000", "25 000 000 000", and
 *  spelled-out ones ("twenty-five trillion"). In dollars; only used to confirm a stored figure. */
export function bareAmountsIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(?<![\d.,])\d{1,3}(?:[,.\u00a0\u202f ]\d{3}){2,}(?![\d])/g)) out.push(parseInt(m[0].replace(/[^\d]/g, ""), 10));
  const t = text.toLowerCase().replace(/-/g, " ");
  for (const m of t.matchAll(/\b(?:(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?: (one|two|three|four|five|six|seven|eight|nine))?|(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)) (trillion|billion|million)\b/g)) {
    const n = m[3] ? ONES[m[3]] : TENS[m[1]] + (m[2] ? ONES[m[2]] : 0);
    out.push(n * SCALE_WORD[m[4]]);
  }
  return out;
}

/** Dollar figure the quote (or span) actually writes for a value the model/mapping
 *  gave in the wrong scale (25,000 where the text says "$25 trillion"). */
export function writtenDollars(v: number, text: string, mult: number): number {
  const d = v * mult, found = [...moneyIn(text), ...bareAmountsIn(text)];
  for (const q of found) for (const k of [0, 1, -1, 2, -2, 3, -3, 4, -4]) if (close(d * Math.pow(1000, k), q)) return q;
  return d;
}

export function figure(v: number, text: string | null, money: boolean): BarFigure {
  if (money) return moneyParts(v);
  const t = text ?? fmtU(v, "");
  const sp = t.indexOf(" ");
  return sp > 0 ? { num: t.slice(0, sp), word: t.slice(sp + 1) } : { num: t, word: "" };
}

/** Read a figure back to its number ("$25"+"trillion" → 25e12, "1.2B" → 1.2e9, "45%" → 45). */
export function parseFigure(f: BarFigure): number | null {
  const m = /^(-?)\$?([\d,]*\.?\d+)\s?([TBMK%]?)(\/\S*)?$/.exec(f.num.trim());
  if (!m) return null;
  const n = parseFloat(m[2].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const word = /^(trillion|billion|million)$/i.test(f.word.trim()) ? SCALE_WORD[f.word.trim().toLowerCase()] : 1;
  const suffix = ({ T: 1e12, B: 1e9, M: 1e6, K: 1e3, "%": 1, "": 1 } as Record<string, number>)[m[3]];
  return (m[1] ? -1 : 1) * n * word * suffix;
}

const sig = (f: BarFigure) => f.num.replace(/^-/, "").replace(/[\d,.]+[TBMK]?/, "#");

/** Why a Said/Data pair can't be drawn as two true-to-size bars (null when it can). */
export function barsProblem(b: ClaimBars): string | null {
  const vals = [b.said, b.data];
  if (vals.some(v => !Number.isFinite(v) || v === 0)) return "unparsed value";
  if (Math.sign(b.said) !== Math.sign(b.data)) return "sign mismatch";
  for (const [v, f] of [[b.said, b.saidFig], [b.data, b.dataFig]] as const) {
    const back = parseFigure(f);
    if (back == null) return `unparsed label "${f.num} ${f.word}"`;
    if (Math.abs(back - v) > Math.max(0.05 * Math.abs(v), 0.06)) return `label "${f.num} ${f.word}" does not match value ${v}`;
  }
  if (b.money) {
    if (!b.saidFig.num.startsWith("$") && !b.saidFig.num.startsWith("-$")) return "said label has no $";
    if (!b.dataFig.num.startsWith("$") && !b.dataFig.num.startsWith("-$")) return "data label has no $";
  } else {
    if (b.saidFig.word !== b.dataFig.word || sig(b.saidFig) !== sig(b.dataFig)) return `unit mismatch "${b.saidFig.num} ${b.saidFig.word}" vs "${b.dataFig.num} ${b.dataFig.word}"`;
  }
  const ratio = Math.abs(b.said / b.data);
  if (ratio > 1000 || ratio < 1 / 1000) return `scale mismatch (${ratio.toExponential(1)}x)`;
  return null;
}

export const validBars = (b: ClaimBars | null): ClaimBars | null => (b && !barsProblem(b) ? b : null);

/** Bar height in px: true to size, with a floor so the smaller bar stays visible. */
export const barHeight = (v: number, max: number, area: number) => Math.max(Math.round(0.04 * area), Math.round((Math.abs(v) / max) * area));

export interface BarsLayout { numSize: number; numWidth: [number, number]; wordWidth: [number, number]; column: number; heights: [number, number]; area: number }

/** The geometry SaidDataBars draws with, estimated so a test can check labels fit their column. */
export function barsLayout(b: ClaimBars, tall: boolean, innerWidth = 1080 - 128): BarsLayout {
  const area = tall ? 500 : 300, gap = 56, column = (innerWidth - gap) / 2;
  const mx = Math.max(Math.abs(b.said), Math.abs(b.data), 1e-9);
  const h = (v: number) => barHeight(v, mx, area);
  const base = tall ? 78 : 60;
  const size = (f: BarFigure) => base * (f.num.length > 8 ? 8 / f.num.length : 1);
  const wsize = tall ? 30 : 24;
  return {
    numSize: Math.min(size(b.saidFig), size(b.dataFig)),
    numWidth: [b.saidFig.num.length * size(b.saidFig) * 0.6, b.dataFig.num.length * size(b.dataFig) * 0.6],
    wordWidth: [b.saidFig.word.length * wsize * 0.6 + b.saidFig.word.length, b.dataFig.word.length * wsize * 0.6 + b.dataFig.word.length],
    column, heights: [h(b.said), h(b.data)], area,
  };
}

/** Problems with how a pair would be laid out: labels wider than their column, or a bar too small to read. */
export function layoutProblem(b: ClaimBars, tall: boolean): string | null {
  const l = barsLayout(b, tall);
  if (Math.max(...l.numWidth, ...l.wordWidth) > l.column) return "label wider than its column";
  if (Math.min(Math.abs(b.said), Math.abs(b.data)) / Math.max(Math.abs(b.said), Math.abs(b.data)) < 0.005) return "sliver bar";
  return null;
}

export function moneyBars(said: number, data: number, metric: string, source: string): ClaimBars {
  return { said, data, saidFig: figure(said, null, true), dataFig: figure(data, null, true), metric, source, money: true, unit: "$" };
}

export function plainBars(said: number, data: number, saidText: string, dataText: string, unit: string, metric: string, source: string): ClaimBars {
  return { said, data, saidFig: figure(said, saidText, false), dataFig: figure(data, dataText, false), metric, source, money: false, unit };
}

export { moneyMult };
