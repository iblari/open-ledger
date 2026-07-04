"use client";

// Live Benchmark — restyled to match the rest of the site's editorial language.
//
// Previously lived as a standalone page at /live-benchmark with its own design
// tokens, header, and 900-weight typography. Folded into the dashboard as a
// 5th tab (alongside Data / State Atlas / Scenarios / Global) and reskinned
// to use the shared EC / SERIF / SANS tokens. The substance of the feature is
// unchanged: pick a metric, see Trump II's value at month N of his term
// against every prior president at the same point in their tenure.

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import CompactPicker from "@/components/CompactPicker";
import { C as EC, SERIF as ESERIF, SANS as ESANS } from "@/lib/design-tokens";

// ── Types (shape from /api/benchmark-data) ────────────────────────
interface DataPoint { month: number; value: number }
interface AdminSeries { id: string; name: string; party: string; current: boolean; data: DataPoint[] }
interface MetricData { label: string; short: string; unit: string; lowerBetter: boolean; cat: string; series: AdminSeries[] }
interface APIResponse {
  lastUpdated: string;
  currentMonth: number;
  admins: { id: string; name: string; party: string; current: boolean }[];
  categories: Record<string, string>;
  metrics: Record<string, MetricData>;
  error?: string;
}

// ── Per-metric editorial copy (function, benchmark, why-it-matters, facts) ─
// Same content as the original page, just lives here now.
const META: Record<string, {
  label: string; sub: string; def: string; ctx: string;
  bench: { good: string; target: string; warn: string; why: string };
  facts: { t: string; x: string }[];
}> = {
  gdp_growth: {
    label: "GDP Growth", sub: "Quarterly Annualized %",
    def: "(GDP this quarter − GDP last quarter) / GDP last quarter × 100, annualized. Measures how fast the economy expanded or contracted.",
    bench: { good: "2–3%", target: "Sustained 2-3% is healthy for a mature economy", warn: "Below 0% = contraction. Above 5% often = rebound, not trend", why: "The U.S. economy averaged 3.2% from 1947-2000 and 2.1% from 2000-2024. Lower trend reflects a larger, more mature economy." },
    ctx: "Post-recession years show rebound effects, not necessarily good policy.",
    facts: [{ t: "Presidents influence ~10-30%", x: "Fed rates, global conditions, and business cycles often matter more." }],
  },
  real_gdp: {
    label: "Real GDP", sub: "$T (2017 dollars)",
    def: "Nominal GDP / GDP Deflator × 100. Strips out price changes to measure actual output growth in constant 2017 dollars.",
    bench: { good: "Steady upward trend", target: "~2-3% annual growth in real terms", warn: "Flat or declining = recession", why: "Real GDP should always grow over time in a healthy economy. The question is how fast — and whether growth is broadly shared." },
    ctx: "Total output adjusted for inflation. Shows absolute size, not speed.",
    facts: [{ t: "Why 'real'?", x: "Adjusted for inflation — comparing actual output, not price increases." }, { t: "Bigger base = slower rate", x: "$20T at 2% adds $400B. $5T at 8% adds $400B. Same absolute gain." }],
  },
  unemployment: {
    label: "Unemployment", sub: "Rate %",
    def: "(People actively looking for work / Total labor force) × 100. Does NOT count people who stopped looking or are underemployed (that's U-6).",
    bench: { good: "3.5–4.5%", target: "Below 4% = tight labor market (good for workers)", warn: "Above 6% = significant slack. Above 8% = crisis-level", why: "'Full employment' is ~3.5-4.5%. Below 3.5% risks inflation as employers compete for scarce workers." },
    ctx: "Obama inherited 9%+. Trump's 2020 spike = COVID lockdowns.",
    facts: [{ t: "U-3 misses discouraged workers", x: "U-6 adds underemployed + discouraged — typically 3-5 points higher." }],
  },
  lfpr: {
    label: "Labor Participation", sub: "Rate %",
    def: "(Employed + Unemployed seeking work) / Civilian population age 16+ × 100. Measures what share of working-age adults are in the labor force.",
    bench: { good: "62–67%", target: "Higher = more people working or seeking work", warn: "Below 62% signals structural disengagement", why: "Peaked at 67.3% in 2000. Structural decline from aging boomers is ~0.2%/yr — this trend is demographic, not policy failure." },
    ctx: "Long-term decline from aging boomers retiring.",
    facts: [{ t: "Catches what unemployment misses", x: "If someone stops looking, they leave the labor force entirely — LFPR captures this." }],
  },
  payrolls: {
    label: "Nonfarm Payrolls", sub: "Millions",
    def: "Total employees on nonfarm payrolls — the most-watched jobs number. Covers ~80% of all US workers (excludes farm, household, and military).",
    bench: { good: "Steady upward trend", target: "150K-250K/month new jobs = healthy expansion", warn: "Net job losses signal recession", why: "Population needs ~100K new jobs/month just to keep up. Above 200K is strong." },
    ctx: "Reopenings ≠ creation. Policy lags 12-18 months.",
    facts: [{ t: "Biden's 2021 +6.7M", x: "Largely positions COVID eliminated being refilled, not new structural jobs." }],
  },
  manufacturing: {
    label: "Manufacturing Jobs", sub: "Millions",
    def: "Total employees in manufacturing sector from BLS Current Employment Statistics. Counts all manufacturing payroll jobs nationwide.",
    bench: { good: "Stabilization at 12-13M", target: "Halting decline is realistic; returning to 17M+ is not", warn: "Sharp drops signal recession or trade disruption", why: "Manufacturing output keeps rising while jobs decline — automation replaces workers. This trend is global and irreversible." },
    ctx: "Peaked at 19.6M in 1979. ~85% of losses from automation, not offshoring.",
    facts: [{ t: "Output still rising", x: "U.S. manufactures more by value than ever — with fewer workers." }],
  },
  cpi: {
    label: "CPI Inflation", sub: "Year-over-year %",
    def: "(CPI this month − CPI 12 months ago) / CPI 12 months ago × 100. Measures price growth across a basket of consumer goods.",
    bench: { good: "Near 2% Fed target", target: "Fed targets 2% PCE; CPI usually 0.3-0.5pp higher", warn: "Above 4% = persistent inflation problem", why: "2% is the Fed's stated target. Above that erodes savings; below 0% (deflation) discourages spending." },
    ctx: "Inflation is sticky downward. Once embedded, takes years to unwind.",
    facts: [{ t: "Core vs headline", x: "Core excludes food + energy (volatile). The Fed watches core PCE most closely." }],
  },
  fed_funds: {
    label: "Fed Funds Rate", sub: "%",
    def: "The interest rate banks charge each other for overnight loans. Set by the Federal Reserve to manage inflation and employment.",
    bench: { good: "2-4%", target: "Neutral rate ~2.5%. Higher slows growth; lower stimulates", warn: "Above 6% = aggressive tightening", why: "Fed funds drives mortgage rates, credit cards, bond yields — the cost of money across the economy." },
    ctx: "Set by FOMC, not the president. Fed independence is by design.",
    facts: [{ t: "President doesn't set rates", x: "The Fed is independent. Presidents nominate the chair (4-year term) and 6 governors (14-year terms)." }],
  },
  ten_year: {
    label: "10-Year Treasury", sub: "Yield %",
    def: "The yield (annual return) on a 10-year US Treasury bond. Set by bond market, not the Fed. The benchmark for long-term borrowing costs.",
    bench: { good: "2-4%", target: "Reflects long-term inflation + growth expectations", warn: "Below 1% = recession fears. Above 5% = inflation fears", why: "Drives 30-year mortgage rates, corporate bond yields, and the discount rate for stock valuations." },
    ctx: "Market-determined. Rising yields = bonds losing value.",
    facts: [{ t: "Yield vs price", x: "When bond prices fall, yields rise. They move inversely." }],
  },
  unemployment_claims: {
    label: "Initial Jobless Claims", sub: "Weekly K",
    def: "Number of people filing first-time unemployment claims this week. The most-watched leading indicator of the labor market.",
    bench: { good: "200-250K/week", target: "Steady ~220K = healthy churn", warn: "Above 400K = labor market deteriorating", why: "Real-time signal. Spikes here precede broader unemployment increases by 2-4 weeks." },
    ctx: "Reported every Thursday. Backward-looking but most current data we have.",
    facts: [{ t: "COVID peak", x: "Hit 6.1M in a single week (April 2020). Pre-COVID record was 695K." }],
  },
  gas_price: {
    label: "Gas Prices", sub: "$/gallon",
    def: "National average retail price for regular unleaded gasoline. Tracked weekly by EIA from a sample of stations.",
    bench: { good: "$2.50-$3.50", target: "Stable ~$3 is the long-run norm", warn: "Above $4 stresses household budgets significantly", why: "Highly visible to voters. Drives consumer sentiment more than other prices because it's posted on giant signs." },
    ctx: "Driven by oil prices (~60%), refining (~15%), distribution (~15%), taxes (~10%).",
    facts: [{ t: "President's influence is small", x: "Oil is a global commodity. US drilling decisions take years to affect prices." }],
  },
  wage_growth: {
    label: "Wage Growth", sub: "Year-over-year %",
    def: "(Average hourly earnings this month − 12 months ago) / 12 months ago × 100. Tracks nominal pay growth before inflation.",
    bench: { good: "3-4%", target: "Real wage growth (above inflation) is what matters", warn: "Below inflation = workers losing ground", why: "Wage growth above inflation = rising living standards. Below inflation = real pay cut." },
    ctx: "Doesn't include benefits or bonuses. Doesn't adjust for composition (more low-wage hires drag average down)." ,
    facts: [{ t: "Nominal vs real", x: "5% wage growth with 3% inflation = 2% real raise. 3% with 8% inflation = 5% real pay cut." }],
  },
  debt_gdp: {
    label: "Debt-to-GDP", sub: "% of GDP",
    def: "Total federal debt / GDP × 100. Measures debt relative to the economy's ability to service it.",
    bench: { good: "Below 60%", target: "Stable or declining", warn: "Above 100% = debt exceeds annual GDP", why: "High debt limits fiscal flexibility in crisis. But the threshold for 'too much' isn't well-defined." },
    ctx: "US can borrow cheaply because the dollar is the world reserve currency.",
    facts: [{ t: "Includes intragovernmental", x: "About 25% is owed to Social Security / Medicare trust funds." }],
  },
  consumer_conf: {
    label: "Consumer Confidence", sub: "Index (1985=100)",
    def: "Survey of 5,000 households rating current business conditions and 6-month expectations. Indexed to 1985 baseline = 100. Above 100 = more optimistic than 1985.",
    bench: { good: "Above 100", target: "100 = baseline optimism. 120+ = strong confidence", warn: "Below 60 = recession-level pessimism", why: "High confidence drives spending (70% of GDP). But since 2016, partisan identity has become the biggest predictor — not actual conditions." },
    ctx: "How people FEEL — not how the economy performs. Partisan since 2016.",
    facts: [{ t: "Vibes ≠ reality", x: "Confidence dropped in 2022 despite strong jobs. People feel inflation more than employment." }],
  },
};

// ── Utility helpers (unchanged from original) ─────────────────────
function useIsMobile() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => { const h = () => setW(window.innerWidth); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, []);
  return w < 768;
}
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"]; const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
function fmtVal(v: number | null | undefined, unit: string): string {
  // Defensive: hover panel payload can include admins with no data at the
  // hovered month (e.g. Nixon at month 48 — his term ended decades before
  // most metrics' data even starts), in which case value is undefined.
  // Without this guard, .toFixed() crashes React and the whole page goes blank.
  if (v == null || !Number.isFinite(v)) return "—";
  if (unit === "T") return `$${v.toFixed(1)}T`;
  if (unit === "B") return `$${v.toFixed(0)}B`;
  if (unit === "M") return `${v.toFixed(2)}M`;
  if (unit === "K") return `${v > 0 ? "+" : ""}${v.toFixed(0)}K`;
  if (unit === "$") return `$${v.toFixed(2)}`;
  if (unit === "%") return `${v.toFixed(1)}%`;
  return v.toFixed(1) + unit;
}

// ── Tooltip — editorial restyle ───────────────────────────────────
// Same data, but black panel + serif label + smaller type — matches the
// dashboard's chart tooltips.
function BenchTooltip(props: {
  active?: boolean;
  payload?: { dataKey: string; value: number; color: string }[];
  label?: number;
  metric?: MetricData;
  adminMap: Record<string, { name: string; current: boolean }>;
  highlighted: Set<string>;
  adminColors: Record<string, string>;
}) {
  const { active, payload, label, metric, adminMap, highlighted, adminColors } = props;
  if (!active || !payload?.length || !metric) return null;
  const sorted = [...payload].sort((a, b) => {
    const aCur = adminMap[a.dataKey]?.current; const bCur = adminMap[b.dataKey]?.current;
    if (aCur && !bCur) return -1; if (!aCur && bCur) return 1;
    const aHL = highlighted.has(a.dataKey); const bHL = highlighted.has(b.dataKey);
    if (aHL && !bHL) return -1; if (!aHL && bHL) return 1;
    return (adminMap[a.dataKey]?.name || "").localeCompare(adminMap[b.dataKey]?.name || "");
  });
  return (
    <div style={{
      background: EC.ink, color: "#fff", padding: "8px 12px", borderRadius: 6,
      fontFamily: ESANS, fontSize: 11, lineHeight: 1.4, minWidth: 160, maxWidth: 220,
      boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
    }}>
      <div style={{ fontFamily: ESERIF, fontWeight: 600, fontSize: 12, marginBottom: 4 }}>
        Month {label}
      </div>
      {/* Show all admins now that the tooltip is pinned to a corner and
          isn't covering the chart line. Tighter line spacing + smaller
          font keeps the box compact even with 10 rows. */}
      {sorted.map((p, i) => {
        const isCur = adminMap[p.dataKey]?.current;
        const isHL = highlighted.has(p.dataKey);
        const anyHL = highlighted.size > 0;
        const dimmed = anyHL && !isHL && !isCur;
        const col = isCur ? EC.accent : isHL ? (adminColors[p.dataKey] || "#fff") : "#9a9490";
        return (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, opacity: dimmed ? 0.35 : 1, fontVariantNumeric: "tabular-nums", marginTop: i > 0 ? 1 : 0 }}>
            <span style={{ color: col, fontWeight: isCur || isHL ? 600 : 400 }}>{adminMap[p.dataKey]?.name || p.dataKey}</span>
            <span>{fmtVal(p.value, metric.unit)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Share-card canvas (PNG export) ────────────────────────────────
// Lightly restyled with the editorial palette so saved cards look on-brand.
function generateShareCard(
  metricLabel: string, value: number, unit: string, rank: number, total: number,
  lowerBetter: boolean, histAvg: number, month: number, sparkData: number[],
): HTMLCanvasElement {
  const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 630;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = EC.bg; ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = EC.ink; ctx.font = "900 36px 'Source Serif 4', Georgia, serif";
  ctx.fillText("Vote Unbiased — Live Benchmark", 60, 80);
  ctx.fillStyle = EC.sub; ctx.font = "500 22px 'DM Sans', sans-serif";
  ctx.fillText(`${metricLabel} · Month ${month} of Trump's 2nd term`, 60, 120);

  ctx.fillStyle = EC.ink; ctx.font = "900 96px 'Source Serif 4', Georgia, serif";
  ctx.fillText(fmtVal(value, unit), 60, 260);

  ctx.fillStyle = (lowerBetter ? value < histAvg : value > histAvg) ? EC.improveStrong : EC.accent;
  ctx.font = "700 36px 'DM Sans', sans-serif";
  ctx.fillText(`${ordinal(rank)} of ${total} administrations`, 60, 320);

  ctx.fillStyle = EC.sub; ctx.font = "400 20px 'DM Sans', sans-serif";
  ctx.fillText(`Historical avg at month ${month}: ${fmtVal(histAvg, unit)}`, 60, 360);

  // Sparkline
  if (sparkData.length > 1) {
    const min = Math.min(...sparkData); const max = Math.max(...sparkData);
    const range = max - min || 1; const w = 1000; const h = 120; const x0 = 100; const y0 = 460;
    ctx.strokeStyle = EC.accent; ctx.lineWidth = 4; ctx.beginPath();
    sparkData.forEach((v, i) => {
      const x = x0 + (i / (sparkData.length - 1)) * w;
      const y = y0 + h - ((v - min) / range) * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  ctx.fillStyle = EC.mute; ctx.font = "400 16px 'DM Sans', sans-serif";
  ctx.fillText("voteunbiased.org · Source: FRED", 60, 600);
  return canvas;
}

// ── Distinct colors for highlighted admins ────────────────────────
const ADMIN_COLORS: Record<string, string> = {
  nixon: "#6366f1", carter: "#0ea5e9", reagan: "#f59e0b", bush41: "#14b8a6",
  clinton: "#1d4ed8", bush43: "#7c2d12", obama: "#0d7377", trump1: "#b8372d",
  biden: "#1d4ed8", trump2: "#b8372d",
};

// ── Auto-generated "How to interpret" narrative ──────────────────
//
// Replaces the static META[metric].facts list. Reads the current admin's
// value + stats + the metric's benchmark thresholds and produces a 1-2
// sentence narrative that's specific to what the user is looking at right
// now ("Trump II at month 16, 4.3% unemployment, 3rd-tightest, inside the
// healthy band") instead of generic context ("U-3 misses discouraged
// workers").
//
// Output is editorial: real numbers, real admin names, no boilerplate.
function autoInsight(args: {
  md: MetricData;
  stats: { currentValue: number; historicalAvg: number; rank: number; total: number; atMonth: number };
  bench?: { good: string; target: string; warn: string; why: string };
  currentAdminName: string;
}): { headline: string; context: string } | null {
  const { md, stats, bench, currentAdminName } = args;
  const { currentValue, historicalAvg, rank, total, atMonth } = stats;

  // ── Find the closest historical parallel (admin with nearest value at
  //    same month-of-term). Powerful framing: "you're tracking like Bush 43." ──
  let closestAdmin: { name: string; value: number; id: string } | null = null;
  let smallestGap = Infinity;
  for (const s of md.series) {
    if (s.current) continue;
    const pt = [...s.data].filter(p => p.month <= atMonth + 1 && p.month >= atMonth - 1)
      .sort((a, b) => Math.abs(a.month - atMonth) - Math.abs(b.month - atMonth))[0];
    if (!pt) continue;
    const gap = Math.abs(pt.value - currentValue);
    if (gap < smallestGap) { smallestGap = gap; closestAdmin = { name: s.name, value: pt.value, id: s.id }; }
  }

  // ── Phrase the standing vs prior admins ──
  // Lower rank = better when lowerBetter (1st of 10 unemployment = best).
  const adverbBetter = md.lowerBetter ? "lower" : "higher";
  const performWord  = md.lowerBetter
    ? (rank <= total / 3 ? "tighter" : rank >= 2 * total / 3 ? "looser" : "in line with")
    : (rank <= total / 3 ? "stronger" : rank >= 2 * total / 3 ? "weaker" : "in line with");

  // Top/bottom quartile + middle wording.
  let rankPhrase: string;
  if (rank <= 3) {
    rankPhrase = `the ${ordinal(rank)}-${performWord === "in line with" ? "ranked" : performWord} of ${total} modern administrations at month ${atMonth}`;
  } else if (rank >= total - 2) {
    const fromBottom = total - rank + 1;
    rankPhrase = `${ordinal(fromBottom)}-${md.lowerBetter ? "weakest" : "weakest"} of ${total} at month ${atMonth}`;
  } else {
    rankPhrase = `roughly mid-pack: ${ordinal(rank)} of ${total} at month ${atMonth}`;
  }

  // ── Phrase the threshold position if we have benchmarks ──
  // Best-effort numeric parsing of bench.good (e.g. "3.5–4.5%", "Below 60%")
  // since the bench strings are human-edited copy. Falls back to no threshold
  // commentary if parsing fails.
  let thresholdPhrase = "";
  if (bench) {
    const goodRange = bench.good.match(/(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)/);
    if (goodRange) {
      const lo = parseFloat(goodRange[1]); const hi = parseFloat(goodRange[2]);
      if (currentValue >= lo && currentValue <= hi) {
        thresholdPhrase = `, inside the healthy ${bench.good} band`;
      } else if (md.lowerBetter ? currentValue > hi : currentValue < lo) {
        thresholdPhrase = `, outside the healthy ${bench.good} band`;
      }
    }
  }

  // ── Within-term trajectory: how has this admin moved during their term? ──
  // The ranking-vs-peers framing misses dramatic improvements/declines that
  // happen WITHIN a term. Trade Balance is the textbook example: Trump II
  // ranks 2nd-weakest by absolute level, but went from ~-\$135B at month 2
  // to ~-\$60B at month 14 — a massive within-term improvement the ranking
  // doesn't capture. We surface it here when the change is meaningful.
  const currentSeries = md.series.find(s => s.current);
  let trajectoryPhrase = "";
  if (currentSeries && currentSeries.data.length >= 4) {
    const sorted = [...currentSeries.data].sort((a, b) => a.month - b.month);
    const first = sorted[0]; // start of term
    const last = sorted[sorted.length - 1];
    const change = last.value - first.value;
    const denom = Math.abs(first.value) || 1;
    const relChange = Math.abs(change) / denom;
    // Significance gate: 1pp for rate metrics (%), 10% relative for everything
    // else. Avoids surfacing noise as "trajectory."
    const significant = md.unit === "%"
      ? Math.abs(change) >= 1.0
      : relChange >= 0.10;
    if (significant) {
      const improving = md.lowerBetter ? change < 0 : change > 0;
      const magnitudeTxt = md.unit === "%"
        ? `${Math.abs(change).toFixed(1)}pp`
        : fmtVal(Math.abs(change), md.unit);
      const verb = improving ? "improved" : "deteriorated";
      const dirWord = (change > 0 ? "up" : "down");
      trajectoryPhrase = ` Within term: ${dirWord} ${magnitudeTxt} from ${fmtVal(first.value, md.unit)} at month ${first.month} (${verb}).`;
    }
  }

  // ── Compose ──
  const valTxt = fmtVal(currentValue, md.unit);
  const histTxt = fmtVal(historicalAvg, md.unit);
  const headline = `${currentAdminName} at ${valTxt} — ${rankPhrase}${thresholdPhrase}.`;

  // Context: vs historical avg + trajectory + closest historical parallel.
  // Order matters: historical-mean comparison sets the static context, then
  // trajectory shows the within-term motion, then the parallel grounds it.
  const histDiff = currentValue - historicalAvg;
  const histDir = histDiff >= 0 ? "above" : "below";
  const histColor = (md.lowerBetter ? histDiff < 0 : histDiff > 0) ? "better than" : "worse than";
  let context = `${Math.abs(histDiff).toFixed(1)}${md.unit === "%" ? "pp" : md.unit} ${histDir} the historical mean of ${histTxt} (${histColor} typical).`;
  context += trajectoryPhrase;
  if (closestAdmin && smallestGap < Math.max(0.5, Math.abs(currentValue) * 0.05)) {
    context += ` Closest historical parallel: ${closestAdmin.name} at month ${atMonth} (${fmtVal(closestAdmin.value, md.unit)}).`;
  }
  // Suppress the unused adverb warning — kept for future template variations.
  void adverbBetter;
  return { headline, context };
}

// ═══ Main component ════════════════════════════════════════════════
export default function LiveBenchmark() {
  const mob = useIsMobile();
  const searchParams = useSearchParams();
  const [metric, setMetric] = useState<string>("unemployment");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [data, setData] = useState<APIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  // Hover state captured via LineChart.onMouseMove. Lives OUTSIDE the SVG
  // so the panel can render above the chart instead of as an in-chart overlay.
  // Removes the "tooltip covers Trump II's data" problem completely — chart
  // stays clean, hover panel sits in its own row above.
  const [hover, setHover] = useState<{ month: number; payload: { dataKey: string; value: number; color: string }[] } | null>(null);

  // Fetch live FRED-backed data
  useEffect(() => {
    fetch("/api/benchmark-data")
      .then(r => r.json())
      .then((d: APIResponse) => { if (!d.error) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Read ?metric=<key> URL param so deep-links from the insights strip land
  // on the right metric. We wait until `data` arrives so we can validate the
  // param against the actual list of metrics (FRED ids vs dashboard ids
  // could drift in theory). If invalid, fall back to the default.
  useEffect(() => {
    if (!data) return;
    const m = searchParams.get("metric");
    if (m && data.metrics[m]) {
      setMetric(m);
      setHighlighted(new Set()); // clear any prior highlight state from URL
    }
  }, [searchParams, data]);

  const adminMap = useMemo(() => {
    if (!data) return {};
    const m: Record<string, { name: string; party: string; current: boolean }> = {};
    data.admins.forEach(a => { m[a.id] = a; });
    return m;
  }, [data]);

  const metricKeys = useMemo(() => {
    if (!data) return [];
    return Object.keys(data.metrics).filter(k =>
      catFilter === "all" || data.metrics[k].cat === catFilter
    );
  }, [data, catFilter]);

  const pickerOptions = useMemo(() => {
    if (!data) return [];
    const cats = data.categories || {};
    return Object.keys(data.metrics).map(k => ({
      value: k,
      label: data.metrics[k].label,
      category: cats[data.metrics[k].cat] || undefined,
    }));
  }, [data]);

  const md = data?.metrics[metric];
  const currentMonth = data?.currentMonth ?? 0;

  // Reshape series into recharts row-per-month format
  const chartData = useMemo(() => {
    if (!md) return [];
    const byMonth: Record<number, Record<string, number>> = {};
    for (const s of md.series) {
      for (const p of s.data) {
        if (!byMonth[p.month]) byMonth[p.month] = { month: p.month };
        byMonth[p.month][s.id] = p.value;
      }
    }
    return Object.values(byMonth).sort((a, b) => a.month - b.month);
  }, [md]);

  // Headline stats: current value, historical avg, rank
  const stats = useMemo(() => {
    if (!md || currentMonth === undefined) return null;
    const currentAdmin = md.series.find(s => s.current);
    if (!currentAdmin) return null;
    const currentPt = [...currentAdmin.data].filter(p => p.month <= currentMonth).sort((a, b) => b.month - a.month)[0];
    if (!currentPt) return null;
    const atMonth = currentPt.month; const currentValue = currentPt.value;

    const othersAtMonth: number[] = [];
    for (const s of md.series) {
      if (s.current) continue;
      const closest = [...s.data].filter(p => p.month <= atMonth + 1 && p.month >= atMonth - 1)
        .sort((a, b) => Math.abs(a.month - atMonth) - Math.abs(b.month - atMonth))[0];
      if (closest) othersAtMonth.push(closest.value);
    }
    const historicalAvg = othersAtMonth.length > 0
      ? othersAtMonth.reduce((s, v) => s + v, 0) / othersAtMonth.length : currentValue;

    const allAtMonth: { id: string; value: number; current: boolean }[] = [];
    for (const s of md.series) {
      const closest = [...s.data].filter(p => p.month <= atMonth + 1 && p.month >= atMonth - 1)
        .sort((a, b) => Math.abs(a.month - atMonth) - Math.abs(b.month - atMonth))[0];
      if (closest) allAtMonth.push({ id: s.id, value: closest.value, current: s.current });
    }
    allAtMonth.sort((a, b) => md.lowerBetter ? a.value - b.value : b.value - a.value);
    const rank = allAtMonth.findIndex(a => a.current) + 1;
    const sparkData = currentAdmin.data.filter(p => p.month <= currentMonth).sort((a, b) => a.month - b.month).map(p => p.value);
    return { currentValue, historicalAvg, rank, total: allAtMonth.length, atMonth, sparkData };
  }, [md, currentMonth]);

  const betterThanAvg = stats && md
    ? (md.lowerBetter ? stats.currentValue < stats.historicalAvg : stats.currentValue > stats.historicalAvg)
    : false;

  // Share handlers
  const handleDownload = useCallback(() => {
    if (!stats || !md) return;
    const canvas = generateShareCard(md.label, stats.currentValue, md.unit, stats.rank, stats.total, md.lowerBetter, stats.historicalAvg, currentMonth, stats.sparkData);
    const link = document.createElement("a");
    link.download = `vote-unbiased-${metric}-month-${currentMonth}.png`;
    link.href = canvas.toDataURL("image/png"); link.click();
    setShareStatus("Downloaded"); setTimeout(() => setShareStatus(null), 2000);
  }, [stats, md, metric, currentMonth]);

  const handleCopyImage = useCallback(async () => {
    if (!stats || !md) return;
    const canvas = generateShareCard(md.label, stats.currentValue, md.unit, stats.rank, stats.total, md.lowerBetter, stats.historicalAvg, currentMonth, stats.sparkData);
    try {
      const blob = await new Promise<Blob>((res) => canvas.toBlob(b => res(b!), "image/png"));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await navigator.clipboard.write([new (window as any).ClipboardItem({ "image/png": blob })]);
      setShareStatus("Copied to clipboard");
    } catch { setShareStatus("Copy failed — try Download"); }
    setTimeout(() => setShareStatus(null), 2000);
  }, [stats, md, currentMonth]);

  const tweetText = stats && md
    ? `${md.label} at month ${currentMonth} of Trump's 2nd term: ${fmtVal(stats.currentValue, md.unit)} — ranked ${ordinal(stats.rank)} of ${stats.total} administrations at the same point in office.\n\nvoteunbiased.org`
    : "";

  // ═══ Render ═══
  return (
    <div style={{ animation: "fadeUp 0.4s ease" }}>

      {/* ── Editorial headline (matches dashboard's tab heading pattern) ── */}
      <div style={{ marginBottom: mob ? 16 : 24 }}>
        <div style={{ fontFamily: ESANS, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: EC.sub, fontWeight: 500, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#dc2626" }} />
          Live · sourced from FRED
        </div>
        <h2 style={{ fontFamily: ESERIF, fontSize: mob ? 26 : 34, fontWeight: 400, letterSpacing: "-0.02em", lineHeight: 1.1, margin: "0 0 6px", color: EC.ink }}>
          Where they rank, <em style={{ fontStyle: "italic", color: EC.accent }}>at the same point.</em>
        </h2>
      </div>

      {/* ── Loading / error ── */}
      {loading && (
        <div style={{ textAlign: "center", padding: "80px 0", fontFamily: ESANS, color: EC.mute }}>
          Loading live data from FRED…
        </div>
      )}
      {!loading && !data && (
        <div style={{ background: EC.card, border: `1px solid ${EC.rule}`, borderRadius: 4, padding: 24, textAlign: "center", fontFamily: ESANS, color: EC.sub }}>
          Unable to load benchmark data. Make sure FRED_API_KEY is configured.
        </div>
      )}

      {!loading && data && (<>
        {/* ── Metric picker — mobile sheet ── */}
        {mob && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <button onClick={() => setSheetOpen(true)} style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 12px", borderRadius: 4, border: `1px solid ${EC.rule}`, background: EC.card,
              fontFamily: ESANS, fontSize: 13, fontWeight: 600, color: EC.ink, cursor: "pointer",
              minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{md?.label || "Select metric"}</span>
              <span style={{ fontSize: 10, color: EC.mute, marginLeft: 6, flexShrink: 0 }}>▾</span>
            </button>
          </div>
        )}

        {/* ── Category tabs + metric pills (desktop) ── */}
        {!mob && (<>
          <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${EC.rule}`, marginBottom: 12, overflowX: "auto" }}>
            <button onClick={() => setCatFilter("all")} style={catTabStyle(catFilter === "all")}>
              All ({Object.keys(data.metrics).length})
            </button>
            {Object.entries(data.categories).map(([k, label]) => {
              const count = Object.values(data.metrics).filter(m => m.cat === k).length;
              if (count === 0) return null;
              return (
                <button key={k} onClick={() => setCatFilter(k)} style={catTabStyle(catFilter === k)}>
                  {label}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 20 }}>
            {/* Metric pills. setMetric() deliberately does NOT clear the
                `highlighted` Set — users were losing comparison admins every
                time they switched metrics, which is the opposite of what you
                want when browsing related metrics ("how does Trump II compare
                on inflation? on unemployment? on jobs?"). Admin ids that
                don't exist for the new metric are silently skipped by the
                chip iteration below the chart. */}
            {metricKeys.map(k => {
              const m = data.metrics[k]; const on = metric === k;
              return (
                <button key={k} onClick={() => { setMetric(k); }} style={{
                  padding: "5px 12px", borderRadius: 3,
                  border: `1px solid ${on ? EC.accent + "55" : EC.rule}`,
                  background: on ? EC.accent + "0A" : "transparent",
                  color: on ? EC.accent : EC.sub,
                  fontSize: 12, fontWeight: on ? 600 : 500,
                  fontFamily: ESANS, cursor: "pointer",
                }}>{m.label}</button>
              );
            })}
          </div>
        </>)}

        {/* ── Stat strip (3 editorial cards) ── */}
        {stats && md && (
          <div style={{
            display: "grid",
            gridTemplateColumns: mob ? "1fr 1fr" : "1fr 1fr 1fr",
            gap: mob ? 8 : 12, marginBottom: mob ? 14 : 20,
          }}>
            {/* Label with atMonth — the month of the LATEST AVAILABLE data
                point — not calendar months in office. Quarterly series
                (GDP, debt-to-GDP, wages) publish ~3 months behind; showing
                'Month 18' over a month-14 figure implied fresher data than
                the agencies have released. The lag hint makes it explicit. */}
            <StatCard
              label={`Trump II · Month ${stats.atMonth}`}
              value={fmtVal(stats.currentValue, md.unit)}
              valueColor={EC.ink}
              sub={!mob
                ? (stats.atMonth < currentMonth
                    ? `${md.label} · latest print (publication lags ~${currentMonth - stats.atMonth} mo)`
                    : md.label)
                : undefined}
              mob={mob}
            />
            <StatCard
              label={`Historical Avg · Month ${stats.atMonth}`}
              value={fmtVal(stats.historicalAvg, md.unit)}
              valueColor={EC.sub}
              sub={!mob ? `Mean of ${stats.total - 1} prior administrations` : undefined}
              mob={mob}
            />
            <StatCard
              label={`Rank at Month ${stats.atMonth}`}
              value={<>{ordinal(stats.rank)} <span style={{ fontSize: mob ? 13 : 14, color: EC.mute, fontWeight: 400 }}>of {stats.total}</span></>}
              valueColor={betterThanAvg ? EC.improveStrong : EC.declineStrong}
              sub={md.lowerBetter ? "Lower is better" : "Higher is better"}
              mob={mob}
              fullWidthOnMobile
            />
          </div>
        )}

        {/* ── Benchmark + formula (editorial inline text, not 3-card grid) ── */}
        {md && META[metric] && (
          <div style={{
            background: EC.card, border: `1px solid ${EC.rule}`, borderRadius: 4,
            padding: mob ? "14px 16px" : "16px 20px", marginBottom: 20,
          }}>
            <div style={{
              display: "flex", flexWrap: "wrap", gap: mob ? 10 : 18,
              fontFamily: ESANS, fontSize: 12, color: EC.sub, lineHeight: 1.55,
            }}>
              <span><strong style={{ color: EC.improveStrong, fontWeight: 700 }}>Healthy:</strong> {META[metric].bench.good}</span>
              <span><strong style={{ color: EC.declineStrong, fontWeight: 700 }}>Warning:</strong> {META[metric].bench.warn}</span>
            </div>
            <div style={{
              fontFamily: ESANS, fontSize: 12, color: EC.sub, lineHeight: 1.6,
              marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${EC.rule}`,
            }}>
              <strong style={{ color: EC.ink, fontWeight: 600 }}>Why this matters: </strong>
              {META[metric].bench.why}
            </div>
            <div style={{
              fontFamily: ESANS, fontSize: 11, color: EC.mute, lineHeight: 1.5,
              marginTop: 8, fontStyle: "italic",
            }}>
              {META[metric].def}
            </div>
          </div>
        )}

        {/* ── Spaghetti chart ── */}
        {md && (
          <div style={{
            background: EC.card, border: `1px solid ${EC.rule}`, borderRadius: 4,
            padding: mob ? "14px 8px 10px" : "20px 20px 14px", marginBottom: 20,
          }}>
            <div style={{
              fontFamily: ESERIF, fontSize: mob ? 16 : 18, fontWeight: 500,
              color: EC.ink, letterSpacing: "-0.01em", marginBottom: 12,
              paddingLeft: mob ? 8 : 0, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap",
            }}>
              <span>{md.label}</span>
              <span style={{ fontFamily: ESANS, fontSize: 11, color: EC.mute, fontWeight: 400 }}>
                · {md.series.length} administrations · months in office
              </span>
            </div>
            {/* Hover panel — renders ABOVE the chart so it never overlays the
                data. Visible only while hovering; collapses to a hint when not.
                On mobile the chart is too narrow for an in-chart tooltip not
                to cover Trump II's recent months; pulling it out fixes that. */}
            {hover ? (
              <div style={{
                background: EC.ink, color: "#fff",
                padding: mob ? "8px 12px" : "10px 14px",
                borderRadius: 6, marginBottom: 10,
                fontFamily: ESANS, fontSize: mob ? 11 : 12, lineHeight: 1.4,
              }}>
                <div style={{ fontFamily: ESERIF, fontWeight: 600, fontSize: mob ? 12 : 13, marginBottom: 6 }}>
                  Month {hover.month}
                </div>
                {/* Render the same sorted admin rows as before, in a
                    horizontal wrap so all 10 fit without scroll. */}
                <div style={{
                  display: "flex", flexWrap: "wrap",
                  gap: mob ? "4px 12px" : "4px 16px",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {[...hover.payload]
                    // Drop admins with no data at this month — Recharts still
                    // includes them in the payload with value === undefined/null,
                    // which would render as "Nixon —" noise (and previously
                    // crashed fmtVal). Filtering here keeps the panel honest.
                    .filter(p => p && p.value != null && Number.isFinite(p.value))
                    .sort((a, b) => {
                      const aCur = adminMap[a.dataKey]?.current; const bCur = adminMap[b.dataKey]?.current;
                      if (aCur && !bCur) return -1; if (!aCur && bCur) return 1;
                      const aHL = highlighted.has(a.dataKey); const bHL = highlighted.has(b.dataKey);
                      if (aHL && !bHL) return -1; if (!aHL && bHL) return 1;
                      return (adminMap[a.dataKey]?.name || "").localeCompare(adminMap[b.dataKey]?.name || "");
                    })
                    .map((p, i) => {
                      const isCur = adminMap[p.dataKey]?.current;
                      const isHL = highlighted.has(p.dataKey);
                      const anyHL = highlighted.size > 0;
                      const dimmed = anyHL && !isHL && !isCur;
                      const col = isCur ? EC.accent : isHL ? (ADMIN_COLORS[p.dataKey] || "#fff") : "#9a9490";
                      return (
                        <span key={i} style={{ display: "inline-flex", gap: 4, opacity: dimmed ? 0.4 : 1, whiteSpace: "nowrap" }}>
                          <span style={{ color: col, fontWeight: isCur || isHL ? 600 : 400 }}>{adminMap[p.dataKey]?.name || p.dataKey}</span>
                          <span>{fmtVal(p.value, md.unit)}</span>
                        </span>
                      );
                    })}
                </div>
              </div>
            ) : (
              <div style={{
                fontFamily: ESANS, fontSize: 11, color: EC.mute, marginBottom: 10,
                paddingLeft: mob ? 8 : 0, fontStyle: "italic",
              }}>
                Hover the chart to compare all administrations at any month.
              </div>
            )}
            <ResponsiveContainer width="100%" height={mob ? 300 : 420}>
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 16, left: 0, bottom: 10 }}
                /* eslint-disable @typescript-eslint/no-explicit-any */
                onMouseMove={(state: any) => {
                  if (state?.activeLabel != null && Array.isArray(state.activePayload)) {
                    setHover({ month: state.activeLabel as number, payload: state.activePayload });
                  }
                }}
                onMouseLeave={() => setHover(null)}
                /* eslint-enable @typescript-eslint/no-explicit-any */
              >
                <CartesianGrid strokeDasharray="3 3" stroke={EC.rule} strokeOpacity={0.6} />
                <XAxis dataKey="month" type="number" domain={[0, "dataMax"] as [number, string]}
                  stroke={EC.mute} fontSize={11} fontFamily={ESANS} tick={{ fill: EC.sub }} axisLine={{ stroke: EC.rule }} />
                <YAxis stroke={EC.rule} fontSize={10} fontFamily={ESANS} tick={{ fill: EC.sub }} axisLine={{ stroke: EC.rule }}
                  tickFormatter={(v: number) => fmtVal(v, md.unit)} />
                {/* Keep a Tooltip purely for the dashed vertical cursor
                    line — content is rendered as empty () so Recharts shows
                    the cursor but no popup. The actual hover panel renders
                    ABOVE the chart via the `hover` state captured by
                    onMouseMove on the LineChart above. */}
                <Tooltip cursor={{ stroke: EC.mute, strokeWidth: 1, strokeDasharray: "3 3" }} content={() => null} />
                <ReferenceLine x={currentMonth} stroke={EC.accent} strokeDasharray="4 4" strokeWidth={1.5} />
                {md.series.map(s => {
                  const isCurrent = s.current; const isHL = highlighted.has(s.id);
                  const anyHL = highlighted.size > 0;
                  if (isCurrent) {
                    return (
                      <Line key={s.id} type="monotone" dataKey={s.id}
                        stroke={EC.accent} strokeWidth={2.5} dot={false} connectNulls name={s.name}
                        activeDot={{ r: 5, fill: EC.accent, stroke: "#fff", strokeWidth: 2 }} />
                    );
                  }
                  const color = isHL ? (ADMIN_COLORS[s.id] || EC.sub) : EC.mute;
                  const width = isHL ? 2 : 1.2;
                  const opacity = anyHL && !isHL ? 0.12 : 0.45;
                  const dash = isHL ? undefined : "4 3";
                  return (
                    <Line key={s.id} type="monotone" dataKey={s.id}
                      stroke={color} strokeWidth={width} strokeDasharray={dash}
                      dot={false} connectNulls name={s.name} strokeOpacity={opacity}
                      activeDot={isHL ? { r: 5, fill: color, stroke: "#fff", strokeWidth: 2 } : false} />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>

            {/* Legend — click to highlight (multi-select), Trump II always on */}
            <div style={{
              display: "flex", flexWrap: "wrap", gap: mob ? 6 : 8,
              padding: mob ? "10px 8px 0" : "12px 0 0", borderTop: `1px solid ${EC.rule}`, marginTop: 8,
            }}>
              {md.series.map(s => {
                const isCurrent = s.current; const isHL = highlighted.has(s.id);
                const anyHL = highlighted.size > 0;
                const color = isCurrent ? EC.accent : isHL ? (ADMIN_COLORS[s.id] || EC.sub) : EC.mute;
                const dimmed = anyHL && !isHL && !isCurrent;
                return (
                  <button key={s.id} onClick={() => {
                    if (isCurrent) return;
                    setHighlighted(prev => {
                      const next = new Set(prev);
                      if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
                      return next;
                    });
                  }} style={{
                    display: "flex", alignItems: "center", gap: 5,
                    fontFamily: ESANS, fontSize: 11,
                    padding: "4px 10px", borderRadius: 4, border: "none",
                    background: isHL ? color + "14" : "transparent",
                    opacity: dimmed ? 0.4 : 1,
                    cursor: isCurrent ? "default" : "pointer",
                    transition: "all 0.2s ease",
                  }}>
                    <span style={{
                      width: 16, height: isCurrent || isHL ? 3 : 0, borderRadius: 1,
                      background: isCurrent || isHL ? color : "transparent",
                      borderTop: isCurrent || isHL ? "none" : `2px dashed ${color}`,
                    }} />
                    <span style={{
                      color: isCurrent ? EC.accent : isHL ? color : EC.sub,
                      fontWeight: isCurrent || isHL ? 600 : 400,
                    }}>{s.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── How to interpret — AUTO-GENERATED from the metric, current
            value, ranking, threshold band, and closest historical parallel.
            Replaces a static facts list with text specific to whatever the
            user is currently looking at (e.g. "Trump II at 4.3% — the
            3rd-tightest of 10 modern admins at month 16, inside the healthy
            3.5-4.5% band. Closest parallel: Bush 43 at month 16 (4.5%).") */}
        {md && stats && (() => {
          const insight = autoInsight({
            md, stats, bench: META[metric]?.bench,
            currentAdminName: md.series.find(s => s.current)?.name ?? "Current administration",
          });
          if (!insight) return null;
          return (
            <div style={{ borderLeft: `2px solid ${EC.accent}`, paddingLeft: 16, marginBottom: 24 }}>
              <div style={{
                fontFamily: ESANS, fontSize: 10, fontWeight: 700,
                letterSpacing: 1.5, textTransform: "uppercase", color: EC.mute, marginBottom: 6,
              }}>
                How to interpret · {md.label}
              </div>
              <div style={{
                fontFamily: ESERIF, fontSize: 15, fontWeight: 500, color: EC.ink,
                lineHeight: 1.3, letterSpacing: "-0.005em", marginBottom: 4,
              }}>
                {insight.headline}
              </div>
              <div style={{ fontFamily: ESANS, fontSize: 12, lineHeight: 1.6, color: EC.sub }}>
                {insight.context}
              </div>
            </div>
          );
        })()}

        {/* ── Share card ── */}
        {stats && md && (
          <div style={{
            background: EC.card, border: `1px solid ${EC.rule}`, borderRadius: 4,
            padding: "16px 20px", marginBottom: 20,
          }}>
            <div style={{
              fontFamily: ESANS, fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
              textTransform: "uppercase", color: EC.mute, marginBottom: 12,
            }}>
              Share this benchmark
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              <button onClick={handleDownload} style={shareBtnStyle(false)}>↓ Download PNG</button>
              <button onClick={handleCopyImage} style={shareBtnStyle(false)}>⎘ Copy image</button>
              <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`}
                 target="_blank" rel="noopener noreferrer" style={shareBtnStyle(true)}>
                𝕏 Post
              </a>
            </div>
            {shareStatus && (
              <div style={{ fontFamily: ESANS, fontSize: 12, color: EC.improveStrong, fontWeight: 600, marginBottom: 8 }}>
                {shareStatus}
              </div>
            )}
            <div style={{ background: EC.paper, borderRadius: 4, padding: "10px 14px" }}>
              <div style={{ fontFamily: ESANS, fontSize: 11, color: EC.sub, lineHeight: 1.6, whiteSpace: "pre-line" }}>
                {tweetText}
              </div>
            </div>
          </div>
        )}

        {/* ── Methodology callout ── */}
        <div style={{
          background: EC.paper, border: `1px solid ${EC.rule}`, borderLeft: `3px solid ${EC.accent}`,
          borderRadius: 4, padding: "14px 18px", marginBottom: 16,
        }}>
          <div style={{ fontFamily: ESERIF, fontSize: 13, fontWeight: 600, color: EC.ink, marginBottom: 4 }}>
            How this works
          </div>
          <div style={{ fontFamily: ESANS, fontSize: 12, lineHeight: 1.7, color: EC.sub }}>
            Every administration is aligned to month 0 (inauguration day). So you&apos;re comparing Trump month {currentMonth} to Obama month {currentMonth} to Reagan month {currentMonth} — not calendar years. This isolates the trajectory of each presidency from the conditions they inherited. Data is pulled live from FRED. GDP and debt-to-GDP are quarterly (interpolated to monthly). CPI inflation and wage growth are year-over-year % changes. Some metrics (gas, trade, wages) don&apos;t go back to Nixon — those charts show fewer administrations.
          </div>
        </div>

        {/* ── Not included ── */}
        <div style={{
          background: EC.card, border: `1px solid ${EC.rule}`, borderLeft: `3px solid ${EC.mute}`,
          borderRadius: 4, padding: "12px 16px", marginBottom: 20,
        }}>
          <div style={{
            fontFamily: ESANS, fontSize: 11, fontWeight: 700, color: EC.mute,
            marginBottom: 4, letterSpacing: 1, textTransform: "uppercase",
          }}>
            Not included in benchmark
          </div>
          <div style={{ fontFamily: ESANS, fontSize: 12, color: EC.sub, lineHeight: 1.6 }}>
            5 metrics from the main dashboard aren&apos;t available for month-aligned comparison:{" "}
            <strong>Median Income</strong> and <strong>Budget Deficit</strong> (annual data only),{" "}
            <strong>S&amp;P 500</strong> (FRED data too recent), <strong>Poverty Rate</strong> and{" "}
            <strong>Inequality</strong> (not on FRED monthly). See the Data tab for those.
          </div>
        </div>

        {/* ── Source footer ── */}
        <div style={{
          fontFamily: ESANS, fontSize: 11, color: EC.mute, lineHeight: 1.7,
          paddingTop: 12, borderTop: `1px solid ${EC.rule}`,
        }}>
          Source: FRED · Updated {data.lastUpdated ? new Date(data.lastUpdated).toLocaleDateString() : "—"}
        </div>
      </>)}

      {/* Mobile picker portal */}
      {mob && data && (
        <CompactPicker
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="Select metric"
          options={pickerOptions}
          value={metric}
          // Same as the desktop pills above — keep highlighted admins across
          // metric changes so users don't lose their comparison context.
          onSelect={(v) => { setMetric(v); }}
        />
      )}
    </div>
  );
}

// ── Small subcomponents (kept inline since they're only used here) ─

function StatCard({
  label, value, valueColor, sub, mob, fullWidthOnMobile,
}: {
  label: string; value: React.ReactNode; valueColor: string; sub?: string;
  mob: boolean; fullWidthOnMobile?: boolean;
}) {
  return (
    <div style={{
      background: EC.card, border: `1px solid ${EC.rule}`, borderRadius: 4,
      padding: mob ? "12px 14px" : "16px 18px",
      gridColumn: fullWidthOnMobile && mob ? "1 / -1" : undefined,
    }}>
      <div style={{
        fontFamily: ESANS, fontSize: mob ? 9 : 10, fontWeight: 600,
        letterSpacing: 1.4, textTransform: "uppercase", color: EC.mute,
        marginBottom: mob ? 4 : 6,
      }}>{label}</div>
      <div style={{
        fontFamily: ESERIF, fontSize: mob ? 22 : 30, fontWeight: 500,
        color: valueColor, fontVariantNumeric: "tabular-nums", lineHeight: 1.05,
        letterSpacing: "-0.015em",
      }}>{value}</div>
      {sub && (
        <div style={{ fontFamily: ESANS, fontSize: 11, color: EC.mute, marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function catTabStyle(active: boolean): React.CSSProperties {
  return {
    padding: "10px 16px", border: "none", background: "transparent",
    fontFamily: ESANS, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
    color: active ? EC.ink : EC.mute,
    borderBottom: active ? `2px solid ${EC.accent}` : "2px solid transparent",
    cursor: "pointer",
  };
}

function shareBtnStyle(primary: boolean): React.CSSProperties {
  return {
    padding: "8px 16px", borderRadius: 4,
    border: `1px solid ${primary ? EC.accent + "55" : EC.rule}`,
    background: primary ? EC.accent + "0A" : EC.card,
    color: primary ? EC.accent : EC.ink,
    fontFamily: ESANS, fontSize: 12, fontWeight: 600,
    textDecoration: "none", cursor: "pointer",
  };
}
