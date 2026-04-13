// @ts-nocheck
"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

/* ─────────────────────────────────────────────
   DESIGN TOKENS — matches Open Ledger editorial
───────────────────────────────────────────── */
const C = {
  bg:      "#F8F7F3",
  card:    "#ffffff",
  ink:     "#1E1E1C",
  sub:     "#5c5856",
  mute:    "#888780",
  rule:    "#e2ded6",
  accent:  "#E24B4A",
  green:   "#1D9E75",
  paper:   "#f3ede5",
  highlight: "#fef9e7",
};

/* ─────────────────────────────────────────────
   METRIC METADATA — labels, benchmarks, formulas, context, facts
   Matches the main Open Ledger dashboard exactly
───────────────────────────────────────────── */
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
    bench: { good: "3.5–4.5%", target: "Below 4% = tight labor market (good for workers)", warn: "Above 6% = significant slack. Above 8% = crisis-level", why: "'Full employment' is ~3.5-4.5%. Below 3.5% risks inflation as employers compete for scarce workers. The 'natural rate' shifts over time." },
    ctx: "Obama inherited 9%+. Trump's 2020 spike = COVID lockdowns.",
    facts: [{ t: "U-3 misses discouraged workers", x: "U-6 adds underemployed + discouraged — typically 3-5 points higher." }],
  },
  lfpr: {
    label: "Labor Force Participation", sub: "Rate %",
    def: "(Employed + Unemployed seeking work) / Civilian population age 16+ × 100. Measures what share of working-age adults are in the labor force.",
    bench: { good: "62–67%", target: "Higher = more people working or seeking work", warn: "Below 62% signals structural disengagement from workforce", why: "Peaked at 67.3% in 2000. Structural decline from aging boomers is ~0.2%/yr — this trend is demographic, not policy failure." },
    ctx: "Long-term decline from aging boomers retiring. Peaked at 67.3% in 2000.",
    facts: [{ t: "Catches what unemployment misses", x: "If someone stops looking, they leave the labor force entirely — LFPR captures this." }],
  },
  jobs: {
    label: "Nonfarm Payrolls", sub: "Monthly Change (thousands)",
    def: "Nonfarm payrolls change month-over-month from BLS Current Employment Statistics. Net new jobs created (or lost) each month. Counts jobs, not people.",
    bench: { good: "+150K to +250K/month", target: "Consistent monthly gains of 150K-250K = healthy expansion", warn: "Negative = net job losses, signaling recession", why: "The economy needs ~100-150K new jobs/month just to keep up with population growth. Anything above 200K is strong." },
    ctx: "Reopenings ≠ creation. Policy lags 12-18 months.",
    facts: [{ t: "Biden's 2021 surge", x: "Largely positions COVID eliminated being refilled, not new structural jobs." }],
  },
  mfg: {
    label: "Manufacturing Jobs", sub: "Millions",
    def: "Total employees in manufacturing sector from BLS Current Employment Statistics survey. Counts all manufacturing payroll jobs nationwide.",
    bench: { good: "Stabilization at 12-13M", target: "Halting decline is realistic; returning to 17M+ is not", warn: "Sharp drops signal recession or trade disruption", why: "Manufacturing output keeps rising while jobs decline — automation replaces workers. This trend is global and irreversible." },
    ctx: "Peaked at 19.6M in 1979. ~85% of losses from automation, not offshoring.",
    facts: [{ t: "Output still rising", x: "U.S. manufactures more by value than ever — with fewer workers." }],
  },
  inflation: {
    label: "Inflation (CPI YoY)", sub: "Year-over-Year %",
    def: "(CPI this month − CPI same month last year) / CPI last year × 100. Tracks price changes across ~80,000 goods and services (CPI-U).",
    bench: { good: "1.5–2.5%", target: "The Fed targets exactly 2% — the 'Goldilocks' rate", warn: "Above 4% = eroding paychecks. Below 0% = deflation spiral risk", why: "2% encourages spending without destroying savings. At 8% (2022), a $50K salary loses $4,000 in purchasing power in one year." },
    ctx: "Fed targets 2%. 2022's 8% = post-COVID supply + stimulus.",
    facts: [{ t: "The Fed controls inflation", x: "Interest rates are the primary tool. Presidents contribute via spending but can't set prices." }],
  },
  gas: {
    label: "Gas Prices", sub: "$/gallon",
    def: "National average retail price for regular unleaded gasoline, all formulations. EIA weekly survey of ~900 retail outlets.",
    bench: { good: "$2.50–$3.50", target: "Stable prices matter more than low prices", warn: "Above $4 = consumer pain. Below $2 often = demand collapse (bad sign)", why: "Americans spend ~3-5% of income on gas. At $4/gal, a 30-gallon-per-week family pays $6,240/yr vs $3,900 at $2.50." },
    ctx: "~60% = global crude. OPEC > White House.",
    facts: [{ t: "COVID made gas cheap", x: "2020's $2.17 was demand collapse, not a policy win." }],
  },
  wages: {
    label: "Real Wages", sub: "Year-over-Year %",
    def: "Median real weekly earnings year-over-year % change. If your raise was 4% but inflation was 5%, real wages fell 1%. Measures actual purchasing power change.",
    bench: { good: "+0.5 to +2.0%", target: "Positive real wage growth = workers gaining purchasing power", warn: "Negative = paychecks shrinking in real terms despite nominal raises", why: "If real wages are negative, your raise didn't keep up with prices. Americans experienced 25 consecutive months of negative real wages from mid-2021 to mid-2023." },
    ctx: "Nominal raise minus inflation. 2020 spike = composition effect.",
    facts: [{ t: "Nominal vs Real", x: "A 4% raise with 5% inflation = -1% real decline." }],
  },
  purchasing: {
    label: "Purchasing Power", sub: "Value of $1 (1969 base)",
    def: "CPI at base year / CPI current. Shows how much a dollar buys relative to baseline. Lower = your money buys less. Every president's line shows how much value the dollar lost on their watch.",
    bench: { good: "Losing under 2¢/yr", target: "Some decline is normal with 2% inflation target", warn: "Losing over 4¢/yr = rapid erosion of savings", why: "This is the cumulative cost of inflation that people feel but rarely see quantified. Steady erosion is expected, but sharp drops hurt." },
    ctx: "Steady erosion is expected with 2% inflation target. The 2021-2023 spike was the sharpest decline in decades.",
    facts: [{ t: "Inflation is a hidden tax", x: "You don't see it deducted from your paycheck, but $100 of groceries in 2020 costs $122 in 2024." }, { t: "Savers are punished", x: "If your savings account pays 1% but inflation is 3%, you lose 2% of purchasing power every year." }],
  },
  fed_rate: {
    label: "Interest Rate", sub: "Federal Funds %",
    def: "Federal Funds Rate — the overnight rate banks charge each other, set by the FOMC. Every other rate in the economy (mortgages, car loans, credit cards) keys off this.",
    bench: { good: "2–3% (neutral)", target: "Low enough to encourage borrowing, high enough to prevent bubbles", warn: "Near 0% = emergency mode. Above 5% = restrictive, slows economy", why: "The Fed is independent — presidents appoint the chair but can't set rates. The appointment power is enormous indirect influence." },
    ctx: "Near-zero for 9 of the last 16 years. Biden's era saw the fastest hike cycle in 40 years.",
    facts: [{ t: "Presidents appoint, Fed decides", x: "Once seated, the chair acts independently." }, { t: "Rate affects everything", x: "A 1% rate increase on a $400K mortgage = ~$240/month more." }],
  },
  debt_gdp: {
    label: "Debt-to-GDP", sub: "Ratio %",
    def: "(Total federal public debt outstanding / Annual GDP) × 100. Measures debt burden relative to the economy's ability to service it. More meaningful than raw dollar debt.",
    bench: { good: "Below 60%", target: "60% was the pre-2008 norm. 90%+ is elevated", warn: "Above 120% = uncharted territory for the U.S.", why: "The real risk isn't a magic threshold — it's when interest payments crowd out other spending. The U.S. now spends more on interest ($882B in 2024) than on defense." },
    ctx: "The proper debt measure. Japan is ~260%, UK ~100%.",
    facts: [{ t: "Crossed 100% in 2013", x: "Economists debate whether this threshold matters. Several healthy economies exceed it." }],
  },
  trade: {
    label: "Trade Balance", sub: "$Billions",
    def: "Exports − Imports (goods and services). Negative = trade deficit (U.S. buys more than it sells). This is the TRADE deficit — completely separate from the budget deficit.",
    bench: { good: "Shrinking deficit trend", target: "A small deficit is normal for a wealthy consumer economy", warn: "Rapid growth in deficit may signal competitiveness problems", why: "The U.S. has run a trade deficit since 1975. It often reflects strong consumer demand — Americans buying goods. Tariffs have historically NOT reduced it." },
    ctx: "U.S. has run a trade deficit since 1975. Tariffs raised under Trump but deficit grew anyway.",
    facts: [{ t: "Tariffs did not shrink the deficit", x: "Trade deficit grew from $552B to $679B during Trump I despite tariff increases." }, { t: "Not the same as budget deficit", x: "Trade deficit = buying more imports than we export. Budget deficit = government spending more than it collects." }],
  },
  consumer_conf: {
    label: "Consumer Confidence", sub: "Index (1985=100)",
    def: "Survey of 5,000 households rating current business conditions and 6-month expectations. Indexed to 1985 baseline = 100. Above 100 = more optimistic than 1985.",
    bench: { good: "Above 100", target: "100 = baseline optimism. 120+ = strong confidence", warn: "Below 60 = recession-level pessimism", why: "High confidence drives spending (70% of GDP). But since 2016, partisan identity has become the biggest predictor — not actual conditions." },
    ctx: "How people FEEL — not how the economy performs. Partisan since 2016.",
    facts: [{ t: "Vibes ≠ reality", x: "Confidence dropped in 2022 despite strong jobs. People feel inflation more than employment." }],
  },
};

/* ─────────────────────────────────────────────
   TYPES
───────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
function useIsMobile() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => { const h = () => setW(window.innerWidth); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, []);
  return w < 768;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function fmtVal(v: number, unit: string): string {
  if (unit === 'T') return `$${v.toFixed(1)}T`;
  if (unit === 'B') return `$${v.toFixed(0)}B`;
  if (unit === 'M') return `${v.toFixed(2)}M`;
  if (unit === 'K') return `${v > 0 ? '+' : ''}${v.toFixed(0)}K`;
  if (unit === '$') return `$${v.toFixed(2)}`;
  if (unit === '%') return `${v.toFixed(1)}%`;
  return v.toFixed(1) + unit;
}

/* ─────────────────────────────────────────────
   CUSTOM TOOLTIP
───────────────────────────────────────────── */
function BenchTooltip({ active, payload, label, metric, adminMap }: any) {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].filter(p => p.value != null).sort((a, b) => {
    const aCur = adminMap[a.dataKey]?.current;
    const bCur = adminMap[b.dataKey]?.current;
    if (aCur && !bCur) return -1;
    if (!aCur && bCur) return 1;
    return (adminMap[a.dataKey]?.name || "").localeCompare(adminMap[b.dataKey]?.name || "");
  });
  return (
    <div style={{
      background: "rgba(255,255,255,0.97)", backdropFilter: "blur(8px)",
      border: `1px solid ${C.rule}`, borderRadius: 8, padding: "12px 14px",
      fontSize: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.10)", maxWidth: 280,
    }}>
      <div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 11, color: C.mute, marginBottom: 8, letterSpacing: 0.5 }}>
        MONTH {label} IN OFFICE
      </div>
      {sorted.map((p: any, i: number) => {
        const adm = adminMap[p.dataKey];
        const isCurrent = adm?.current;
        return (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: i > 0 ? 3 : 0 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 8, height: 2, borderRadius: 1, background: isCurrent ? C.accent : C.mute, flexShrink: 0 }} />
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: isCurrent ? C.ink : C.sub, fontWeight: isCurrent ? 700 : 400 }}>
                {adm?.name || p.dataKey}
              </span>
            </span>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700, color: isCurrent ? C.accent : C.ink, fontVariantNumeric: "tabular-nums" }}>
              {typeof p.value === "number" ? fmtVal(p.value, metric?.unit || "") : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────
   SHARE CARD — Canvas-based PNG generation
───────────────────────────────────────────── */
function generateShareCard(
  metricLabel: string, currentValue: number, unit: string,
  rank: number, totalAdmins: number, lowerBetter: boolean,
  historicalAvg: number, currentMonth: number, sparkData: number[],
): HTMLCanvasElement {
  const W = 1200, H = 630;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background
  ctx.fillStyle = "#F8F7F3";
  ctx.fillRect(0, 0, W, H);

  // Top bar
  ctx.fillStyle = "#1E1E1C";
  ctx.fillRect(0, 0, W, 56);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px 'DM Sans', sans-serif";
  ctx.letterSpacing = "4px";
  ctx.fillText("OPEN LEDGER", 40, 36);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = "#888780";
  ctx.font = "500 14px 'DM Sans', sans-serif";
  ctx.fillText("LIVE BENCHMARK", W - 200, 36);

  // Metric label + month
  ctx.fillStyle = "#888780";
  ctx.font = "bold 13px 'DM Sans', sans-serif";
  ctx.letterSpacing = "2px";
  ctx.fillText(metricLabel.toUpperCase(), 60, 112);
  ctx.letterSpacing = "0px";
  ctx.font = "400 16px 'DM Sans', sans-serif";
  ctx.fillText(`Month ${currentMonth} in office`, 60, 140);

  // Hero number
  ctx.fillStyle = "#1E1E1C";
  ctx.font = "900 96px 'Source Serif 4', Georgia, serif";
  ctx.fillText(fmtVal(currentValue, unit), 60, 240);

  // Verdict color
  const betterThanAvg = lowerBetter ? currentValue < historicalAvg : currentValue > historicalAvg;
  const verdictColor = betterThanAvg ? "#1D9E75" : "#E24B4A";

  // Stat pills
  const pills = [
    { label: "Current", value: fmtVal(currentValue, unit), color: "#E24B4A" },
    { label: "Historical Avg", value: fmtVal(historicalAvg, unit), color: "#888780" },
    { label: "Rank", value: `${ordinal(rank)} of ${totalAdmins}`, color: verdictColor },
  ];
  const pillY = 290, pillW = 200, pillH = 64, pillGap = 24;
  pills.forEach((p, i) => {
    const px = 60 + i * (pillW + pillGap);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.roundRect(px, pillY, pillW, pillH, 6); ctx.fill();
    ctx.strokeStyle = "#e2ded6"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "#888780"; ctx.font = "bold 10px 'DM Sans', sans-serif";
    ctx.letterSpacing = "1px"; ctx.fillText(p.label.toUpperCase(), px + 14, pillY + 24); ctx.letterSpacing = "0px";
    ctx.fillStyle = p.color; ctx.font = "bold 20px 'DM Sans', sans-serif";
    ctx.fillText(p.value, px + 14, pillY + 50);
  });

  // Spark line
  if (sparkData.length > 1) {
    const sX = 60, sY = 400, sW = W - 120, sH = 120;
    const min = Math.min(...sparkData), max = Math.max(...sparkData), range = max - min || 1;
    ctx.beginPath(); ctx.strokeStyle = "#E24B4A"; ctx.lineWidth = 2.5; ctx.lineJoin = "round";
    sparkData.forEach((v, i) => {
      const x = sX + (i / (sparkData.length - 1)) * sW;
      const y = sY + sH - ((v - min) / range) * sH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    const lastX = sX + sW, lastY = sY + sH - ((sparkData[sparkData.length - 1] - min) / range) * sH;
    ctx.beginPath(); ctx.arc(lastX, lastY, 5, 0, Math.PI * 2); ctx.fillStyle = "#E24B4A"; ctx.fill();
  }

  // Footer
  ctx.fillStyle = "#e2ded6"; ctx.fillRect(0, H - 50, W, 1);
  ctx.fillStyle = "#888780"; ctx.font = "400 13px 'DM Sans', sans-serif";
  ctx.fillText("voteunbiased.org · source: FRED (Federal Reserve Economic Data)", 60, H - 18);
  ctx.fillStyle = "#E24B4A"; ctx.fillRect(0, H - 4, W, 4);

  return canvas;
}

/* ─────────────────────────────────────────────
   FACTS PANEL — expandable "How to interpret"
───────────────────────────────────────────── */
function FactsPanel({ facts, label }: { facts: { t: string; x: string }[]; label: string }) {
  const [open, setOpen] = useState(false);
  if (!facts?.length) return null;
  return (
    <div style={{ borderLeft: `2px solid ${C.accent}`, paddingLeft: 16 }}>
      <button onClick={() => setOpen(!open)} style={{
        border: "none", background: "transparent", fontFamily: "'DM Sans',sans-serif",
        fontSize: 12, fontWeight: 700, color: C.accent, padding: 0,
        display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
      }}>
        {open ? "Hide" : "Read"}: How to interpret this data
        <span style={{ transform: open ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.2s" }}>→</span>
      </button>
      {open && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          {facts.map((f, i) => (
            <div key={i}>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 2 }}>{f.t}</div>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, lineHeight: 1.6, color: C.sub }}>{f.x}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN PAGE COMPONENT
───────────────────────────────────────────── */
export default function LiveBenchmark() {
  const mob = useIsMobile();
  const [metric, setMetric] = useState<string>("unemployment");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [data, setData] = useState<APIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());

  // Distinct colors for highlighted presidents
  const ADMIN_COLORS: Record<string, string> = {
    nixon: "#6366f1",    // indigo
    carter: "#0ea5e9",   // sky blue
    reagan: "#f59e0b",   // amber
    bush41: "#14b8a6",   // teal
    clinton: "#8b5cf6",  // violet
    bush43: "#f97316",   // orange
    obama: "#3b82f6",    // blue
    trump1: "#ef4444",   // red
    biden: "#22c55e",    // green
    trump2: "#E24B4A",   // brand accent
  };

  // Fetch data
  useEffect(() => {
    fetch("/api/benchmark-data")
      .then(r => r.json())
      .then((d: APIResponse) => { if (!d.error) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Admin lookup
  const adminMap = useMemo(() => {
    if (!data) return {};
    const m: Record<string, { name: string; party: string; current: boolean }> = {};
    data.admins.forEach(a => { m[a.id] = a; });
    return m;
  }, [data]);

  // Available metric keys, filtered by category
  const metricKeys = useMemo(() => {
    if (!data) return [];
    return Object.keys(data.metrics).filter(k =>
      catFilter === "all" || data.metrics[k].cat === catFilter
    );
  }, [data, catFilter]);

  // Current metric data
  const md = data?.metrics[metric];
  const currentMonth = data?.currentMonth ?? 0;

  // Build recharts data
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

  // Stats for current admin at current month
  const stats = useMemo(() => {
    if (!md || currentMonth === undefined) return null;
    const currentAdmin = md.series.find(s => s.current);
    if (!currentAdmin) return null;

    const currentPt = [...currentAdmin.data].filter(p => p.month <= currentMonth).sort((a, b) => b.month - a.month)[0];
    if (!currentPt) return null;
    const atMonth = currentPt.month;
    const currentValue = currentPt.value;

    // Historical average at that month across other admins
    const othersAtMonth: number[] = [];
    for (const s of md.series) {
      if (s.current) continue;
      const closest = [...s.data].filter(p => p.month <= atMonth + 1 && p.month >= atMonth - 1)
        .sort((a, b) => Math.abs(a.month - atMonth) - Math.abs(b.month - atMonth))[0];
      if (closest) othersAtMonth.push(closest.value);
    }
    const historicalAvg = othersAtMonth.length > 0
      ? othersAtMonth.reduce((s, v) => s + v, 0) / othersAtMonth.length : currentValue;

    // Rank
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
    const link = document.createElement("a"); link.download = `open-ledger-${metric}-month-${currentMonth}.png`;
    link.href = canvas.toDataURL("image/png"); link.click();
    setShareStatus("Downloaded!"); setTimeout(() => setShareStatus(null), 2000);
  }, [stats, md, metric, currentMonth]);

  const handleCopyImage = useCallback(async () => {
    if (!stats || !md) return;
    const canvas = generateShareCard(md.label, stats.currentValue, md.unit, stats.rank, stats.total, md.lowerBetter, stats.historicalAvg, currentMonth, stats.sparkData);
    try {
      const blob = await new Promise<Blob>((res) => canvas.toBlob(b => res(b!), "image/png"));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setShareStatus("Copied to clipboard!");
    } catch { setShareStatus("Copy failed — try download"); }
    setTimeout(() => setShareStatus(null), 2000);
  }, [stats, md, metric, currentMonth]);

  const tweetText = stats && md
    ? `${md.label} at month ${currentMonth} of Trump's 2nd term: ${fmtVal(stats.currentValue, md.unit)} — ranked ${ordinal(stats.rank)} of ${stats.total} administrations at the same point in office.\n\nvoteunbiased.org/live-benchmark #OpenLedger`
    : "";

  // Styles
  const sty = {
    page: { minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: "'Source Serif 4','Georgia',serif" },
    card: { background: C.card, border: `1px solid ${C.rule}`, borderRadius: 4 },
  };

  return (
    <div style={sty.page}>
      <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,300;8..60,400;8..60,600;8..60,700;8..60,900&family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; -webkit-font-smoothing: antialiased; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100%{box-shadow:0 0 0 0 rgba(226,75,74,0.2)} 50%{box-shadow:0 0 0 8px rgba(226,75,74,0)} }
        .bench-fade { animation: fadeUp 0.5s ease forwards; }
        button { cursor: pointer; transition: all 0.15s ease; }
        button:active { transform: scale(0.98); }
        @media (max-width: 768px) {
          .bench-stat-grid { grid-template-columns: 1fr !important; }
          .bench-pills { gap: 4px !important; }
          .bench-pills button { padding: 4px 8px !important; font-size: 10px !important; }
        }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ borderBottom: `1px solid ${C.rule}`, padding: mob ? "20px 16px 16px" : "28px 24px 22px", background: `linear-gradient(180deg,#fff 0%,${C.bg} 100%)` }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", gap: 3 }}>
                <div style={{ width: 4, height: 20, background: C.accent, borderRadius: 1 }} />
                <div style={{ width: 4, height: 20, background: C.accent, borderRadius: 1, opacity: 0.6 }} />
                <div style={{ width: 4, height: 20, background: C.accent, borderRadius: 1, opacity: 0.3 }} />
              </div>
              <a href="/" style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 800, letterSpacing: 4, textTransform: "uppercase" as const, color: C.mute, textDecoration: "none" }}>Open Ledger</a>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, animation: "pulse 2s infinite" }} />
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" as const, color: C.accent }}>Live</span>
            </div>
          </div>
          <h1 style={{ fontSize: mob ? 28 : 42, fontWeight: 900, margin: 0, lineHeight: 1.05, letterSpacing: -1.5, maxWidth: 700, color: C.ink }}>
            Live Benchmark
          </h1>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: C.sub, margin: "10px 0 0", maxWidth: 560, lineHeight: 1.6 }}>
            Where does the current administration rank vs. every prior president — at the <strong style={{ color: C.ink }}>same month in office?</strong> 14 metrics, 10 administrations, aligned to inauguration day.
          </p>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: mob ? "20px 16px 64px" : "28px 24px 64px" }}>

        {loading && (
          <div style={{ textAlign: "center", padding: "80px 0", fontFamily: "'DM Sans',sans-serif", color: C.mute }}>
            Loading live data from FRED...
          </div>
        )}

        {!loading && !data && (
          <div style={{ ...sty.card, padding: 24, textAlign: "center", fontFamily: "'DM Sans',sans-serif", color: C.sub }}>
            Unable to load benchmark data. Make sure FRED_API_KEY is configured.
          </div>
        )}

        {!loading && data && (
          <div className="bench-fade">

            {/* ── Category Tabs ── */}
            <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.rule}`, marginBottom: 12, overflowX: "auto" }}>
              <button onClick={() => setCatFilter("all")} style={{
                padding: "10px 16px", border: "none", background: "transparent",
                fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
                color: catFilter === "all" ? C.ink : C.mute,
                borderBottom: catFilter === "all" ? `2px solid ${C.accent}` : "2px solid transparent",
              }}>All ({Object.keys(data.metrics).length})</button>
              {Object.entries(data.categories).map(([k, label]) => {
                const count = Object.values(data.metrics).filter(m => m.cat === k).length;
                if (count === 0) return null;
                return (
                  <button key={k} onClick={() => setCatFilter(k)} style={{
                    padding: "10px 16px", border: "none", background: "transparent",
                    fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
                    color: catFilter === k ? C.ink : C.mute,
                    borderBottom: catFilter === k ? `2px solid ${C.accent}` : "2px solid transparent",
                  }}>{label}</button>
                );
              })}
            </div>

            {/* ── Metric Pills ── */}
            <div className="bench-pills" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 24 }}>
              {metricKeys.map(k => {
                const m = data.metrics[k];
                return (
                  <button key={k} onClick={() => setMetric(k)} style={{
                    padding: "5px 12px", borderRadius: 3,
                    border: `1px solid ${metric === k ? C.accent + "55" : C.rule}`,
                    background: metric === k ? C.accent + "0A" : "transparent",
                    color: metric === k ? C.accent : C.sub,
                    fontSize: 12, fontWeight: metric === k ? 700 : 500,
                    fontFamily: "'DM Sans',sans-serif",
                  }}>{m.short || m.label}</button>
                );
              })}
            </div>

            {/* ── Stat Cards ── */}
            {stats && md && (
              <div className="bench-stat-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
                <div style={{ ...sty.card, padding: "18px 20px", borderTop: `4px solid ${C.accent}` }}>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" as const, color: C.mute, marginBottom: 6 }}>
                    Trump II · Month {currentMonth}
                  </div>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 32, fontWeight: 900, color: C.ink, fontVariantNumeric: "tabular-nums" }}>
                    {fmtVal(stats.currentValue, md.unit)}
                  </div>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: C.mute, marginTop: 4 }}>{md.label}</div>
                </div>

                <div style={{ ...sty.card, padding: "18px 20px", borderTop: `4px solid ${C.mute}` }}>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" as const, color: C.mute, marginBottom: 6 }}>
                    Historical Avg · Month {stats.atMonth}
                  </div>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 32, fontWeight: 900, color: C.sub, fontVariantNumeric: "tabular-nums" }}>
                    {fmtVal(stats.historicalAvg, md.unit)}
                  </div>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: C.mute, marginTop: 4 }}>
                    Mean of {stats.total - 1} prior administrations
                  </div>
                </div>

                <div style={{ ...sty.card, padding: "18px 20px", borderTop: `4px solid ${betterThanAvg ? C.green : C.accent}` }}>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" as const, color: C.mute, marginBottom: 6 }}>
                    Rank at Month {stats.atMonth}
                  </div>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 32, fontWeight: 900, color: betterThanAvg ? C.green : C.accent, fontVariantNumeric: "tabular-nums" }}>
                    {ordinal(stats.rank)} <span style={{ fontSize: 16, fontWeight: 500, color: C.mute }}>of {stats.total}</span>
                  </div>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: C.mute, marginTop: 4 }}>
                    {md.lowerBetter ? "Lower is better" : "Higher is better"}
                  </div>
                </div>
              </div>
            )}

            {/* ── Title ── */}
            {md && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <div>
                  <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{md.label}</h2>
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: C.mute }}>
                    {md.series.length} administrations with data · {md.lowerBetter ? "Lower is better" : "Higher is better"}
                  </span>
                </div>
              </div>
            )}

            {/* ── Metric Detail: Formula, Benchmarks, Context, Facts ── */}
            {md && META[metric] && (() => {
              const mm = META[metric];
              return (
                <div style={{ marginBottom: 20 }}>
                  {/* Formula */}
                  <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 4, padding: "10px 14px", marginBottom: 14, display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, color: C.accent, flexShrink: 0 }}>f(x)</span>
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, lineHeight: 1.6, color: C.sub }}>{mm.def}</span>
                  </div>

                  {/* Good / Target / Warning */}
                  <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                    <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 4, padding: "10px 14px" }}>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 1, color: "#16a34a", marginBottom: 3 }}>Good</div>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, color: "#15803d" }}>{mm.bench.good}</div>
                    </div>
                    <div style={{ background: C.highlight, border: "1px solid #f5deb3", borderRadius: 4, padding: "10px 14px" }}>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 1, color: "#a67c00", marginBottom: 3 }}>Target</div>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, color: "#92400e", lineHeight: 1.4 }}>{mm.bench.target}</div>
                    </div>
                    <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 4, padding: "10px 14px" }}>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 1, color: "#dc2626", marginBottom: 3 }}>Warning</div>
                      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, color: "#991b1b", lineHeight: 1.4 }}>{mm.bench.warn}</div>
                    </div>
                  </div>

                  {/* Why this matters */}
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: C.sub, lineHeight: 1.7, marginBottom: 14, padding: "0 2px" }}>
                    <strong style={{ color: C.ink }}>Why this matters: </strong>{mm.bench.why}
                  </div>

                </div>
              );
            })()}

            {/* ── Spaghetti Chart ── */}
            {md && (
              <div style={{ ...sty.card, padding: mob ? "16px 8px 10px" : "24px 20px 14px", marginBottom: 20 }}>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" as const, color: C.mute, marginBottom: 16, paddingLeft: mob ? 8 : 0 }}>
                  {md.label} — Months in Office
                </div>
                <ResponsiveContainer width="100%" height={mob ? 300 : 420}>
                  <LineChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.rule} strokeOpacity={0.6} />
                    <XAxis
                      dataKey="month" type="number" domain={[0, 'dataMax']}
                      stroke={C.mute} fontSize={11} fontFamily="'DM Sans',sans-serif"
                      tick={{ fill: C.sub }} axisLine={{ stroke: C.rule }}
                      label={{ value: "Months in office", position: "insideBottom", offset: -4, fontSize: 10, fill: C.mute, fontFamily: "'DM Sans',sans-serif" }}
                    />
                    <YAxis
                      stroke={C.rule} fontSize={10} fontFamily="'DM Sans',sans-serif"
                      tick={{ fill: C.sub }} axisLine={{ stroke: C.rule }}
                      tickFormatter={(v: number) => fmtVal(v, md.unit)}
                    />
                    <Tooltip content={<BenchTooltip metric={md} adminMap={adminMap} />} />
                    <ReferenceLine x={currentMonth} stroke={C.accent} strokeDasharray="4 4" strokeWidth={1.5} />

                    {/* All admin lines — Trump II always bold, others highlight on click */}
                    {md.series.map(s => {
                      const isCurrent = s.current;
                      const isHL = highlighted.has(s.id);
                      const anyHL = highlighted.size > 0;
                      // Trump II always keeps its bold accent style
                      if (isCurrent) {
                        return (
                          <Line key={s.id} type="monotone" dataKey={s.id}
                            stroke={C.accent} strokeWidth={3} dot={false} connectNulls name={s.name}
                            activeDot={{ r: 5, fill: C.accent, stroke: "#fff", strokeWidth: 2 }}
                          />
                        );
                      }
                      const color = isHL ? (ADMIN_COLORS[s.id] || C.sub) : C.mute;
                      const width = isHL ? 3 : 1.2;
                      const opacity = anyHL && !isHL ? 0.12 : 0.45;
                      const dash = isHL ? undefined : "4 3";
                      return (
                        <Line key={s.id} type="monotone" dataKey={s.id}
                          stroke={color} strokeWidth={width} strokeDasharray={dash}
                          dot={false} connectNulls name={s.name} strokeOpacity={opacity}
                          activeDot={isHL ? { r: 5, fill: color, stroke: "#fff", strokeWidth: 2 } : false}
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>

                {/* Legend — click to highlight (multi-select), Trump II always on */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: mob ? 6 : 10, padding: mob ? "10px 8px 0" : "12px 0 0", borderTop: `1px solid ${C.rule}`, marginTop: 8 }}>
                  {md.series.map(s => {
                    const isCurrent = s.current;
                    const isHL = highlighted.has(s.id);
                    const anyHL = highlighted.size > 0;
                    const color = isCurrent ? C.accent : isHL ? (ADMIN_COLORS[s.id] || C.sub) : C.mute;
                    const dimmed = anyHL && !isHL && !isCurrent;
                    return (
                      <button key={s.id} onClick={() => {
                        if (isCurrent) return; // Trump II not toggleable
                        setHighlighted(prev => {
                          const next = new Set(prev);
                          if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
                          return next;
                        });
                      }} style={{
                        display: "flex", alignItems: "center", gap: 5,
                        fontFamily: "'DM Sans',sans-serif", fontSize: 11,
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
                        <span style={{ color: isCurrent ? C.accent : isHL ? color : C.sub, fontWeight: isCurrent || isHL ? 700 : 400 }}>{s.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── How to interpret — below chart ── */}
            {md && META[metric] && META[metric].facts.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <FactsPanel facts={META[metric].facts} label={META[metric].label} />
              </div>
            )}

            {/* ── Share Card Export ── */}
            {stats && md && (
              <div style={{ ...sty.card, padding: "18px 20px", marginBottom: 20 }}>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" as const, color: C.mute, marginBottom: 12 }}>
                  Share This Benchmark
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  <button onClick={handleDownload} style={{
                    padding: "8px 16px", borderRadius: 4, border: `1px solid ${C.rule}`,
                    background: C.card, color: C.ink, fontFamily: "'DM Sans',sans-serif",
                    fontSize: 12, fontWeight: 600,
                  }}>↓ Download PNG</button>
                  <button onClick={handleCopyImage} style={{
                    padding: "8px 16px", borderRadius: 4, border: `1px solid ${C.rule}`,
                    background: C.card, color: C.ink, fontFamily: "'DM Sans',sans-serif",
                    fontSize: 12, fontWeight: 600,
                  }}>⎘ Copy to Clipboard</button>
                  <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`}
                    target="_blank" rel="noopener noreferrer" style={{
                      padding: "8px 16px", borderRadius: 4, border: `1px solid ${C.accent}33`,
                      background: `${C.accent}08`, color: C.accent, fontFamily: "'DM Sans',sans-serif",
                      fontSize: 12, fontWeight: 600, textDecoration: "none",
                    }}>𝕏 Post</a>
                </div>
                {shareStatus && (
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: C.green, fontWeight: 600 }}>{shareStatus}</div>
                )}
                <div style={{ background: C.paper, borderRadius: 4, padding: "10px 14px", marginTop: 8 }}>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: C.sub, lineHeight: 1.6, whiteSpace: "pre-line" }}>{tweetText}</div>
                </div>
              </div>
            )}

            {/* ── Methodology ── */}
            <div style={{ background: C.highlight, border: "1px solid #f5deb3", borderRadius: 4, padding: "14px 18px", marginBottom: 20 }}>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, lineHeight: 1.7, color: "#78716c" }}>
                <strong style={{ color: C.ink }}>↳ How this works: </strong>
                Every administration is aligned to month 0 (inauguration day). So you're comparing Trump month {currentMonth} to Obama month {currentMonth} to Reagan month {currentMonth} — not calendar years. This isolates the trajectory of each presidency from the conditions they inherited. Data is pulled live from FRED. GDP and debt-to-GDP are quarterly (interpolated to monthly). CPI inflation and wage growth are year-over-year % changes. Some metrics (gas, trade, wages) don't go back to Nixon — those charts show fewer administrations.
              </div>
            </div>

            {/* ── Not Included ── */}
            <div style={{ ...sty.card, padding: "14px 18px", marginBottom: 20, borderLeft: `3px solid ${C.mute}` }}>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700, color: C.mute, marginBottom: 4, letterSpacing: 0.5, textTransform: "uppercase" as const }}>Not included in benchmark</div>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: C.sub, lineHeight: 1.6 }}>
                5 metrics from the main dashboard aren't available for month-aligned comparison: <strong>Median Income</strong> and <strong>Budget Deficit</strong> (annual data only), <strong>S&P 500</strong> (FRED data too recent), <strong>Poverty Rate</strong> and <strong>Inequality</strong> (not on FRED monthly). See the <a href="/" style={{ color: C.accent, fontWeight: 600 }}>main dashboard</a> for those.
              </div>
            </div>

            {/* ── Footer ── */}
            <div style={{ borderTop: `2px solid ${C.rule}`, paddingTop: 24, marginTop: 40, fontFamily: "'DM Sans',sans-serif" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "flex", gap: 2 }}>
                    <div style={{ width: 3, height: 14, background: C.accent, borderRadius: 1 }} />
                    <div style={{ width: 3, height: 14, background: C.accent, borderRadius: 1, opacity: 0.5 }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" as const, color: C.sub }}>Open Ledger</span>
                </div>
                <span style={{ fontSize: 10, color: C.mute }}>
                  Source: FRED · Updated {data.lastUpdated ? new Date(data.lastUpdated).toLocaleDateString() : "—"}
                </span>
              </div>
              <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.7, marginTop: 10, maxWidth: 600 }}>
                Built for transparency, not persuasion. Every data point sourced from the Federal Reserve Economic Data (FRED) API and can be independently verified.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
