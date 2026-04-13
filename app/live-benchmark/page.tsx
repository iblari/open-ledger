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
   TYPES
───────────────────────────────────────────── */
interface DataPoint { month: number; value: number }
interface AdminSeries { id: string; name: string; party: string; current: boolean; data: DataPoint[] }
interface MetricData { label: string; unit: string; lowerBetter: boolean; series: AdminSeries[] }
interface APIResponse {
  lastUpdated: string;
  currentMonth: number;
  admins: { id: string; name: string; party: string; current: boolean }[];
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
  return `${v.toFixed(1)}${unit}`;
}

/* ─────────────────────────────────────────────
   CUSTOM TOOLTIP
───────────────────────────────────────────── */
function BenchTooltip({ active, payload, label, metric, adminMap }: any) {
  if (!active || !payload?.length) return null;
  // Sort payload: current admin first, then alphabetical
  const sorted = [...payload].sort((a, b) => {
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
      fontSize: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.10)", maxWidth: 260,
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
              {typeof p.value === "number" ? fmtVal(p.value, metric?.unit || "%") : "—"}
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
  metricLabel: string,
  currentValue: number,
  unit: string,
  rank: number,
  totalAdmins: number,
  lowerBetter: boolean,
  historicalAvg: number,
  currentMonth: number,
  sparkData: number[],
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

  // Wordmark in top bar
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px 'DM Sans', sans-serif";
  ctx.letterSpacing = "4px";
  ctx.fillText("OPEN LEDGER", 40, 36);
  ctx.letterSpacing = "0px";

  // Live Benchmark label
  ctx.fillStyle = "#888780";
  ctx.font = "500 14px 'DM Sans', sans-serif";
  ctx.fillText("LIVE BENCHMARK", W - 200, 36);

  // Metric label
  ctx.fillStyle = "#888780";
  ctx.font = "bold 13px 'DM Sans', sans-serif";
  ctx.letterSpacing = "2px";
  ctx.fillText(metricLabel.toUpperCase(), 60, 112);
  ctx.letterSpacing = "0px";

  // Sub text
  ctx.fillStyle = "#888780";
  ctx.font = "400 16px 'DM Sans', sans-serif";
  ctx.fillText(`Month ${currentMonth} in office`, 60, 140);

  // Hero number
  ctx.fillStyle = "#1E1E1C";
  ctx.font = "900 96px 'Source Serif 4', Georgia, serif";
  ctx.fillText(`${currentValue.toFixed(1)}${unit}`, 60, 240);

  // Verdict color
  const betterThanAvg = lowerBetter ? currentValue < historicalAvg : currentValue > historicalAvg;
  const verdictColor = betterThanAvg ? "#1D9E75" : "#E24B4A";

  // Three stat pills
  const pills = [
    { label: "Current", value: `${currentValue.toFixed(1)}${unit}`, color: C.accent },
    { label: "Historical Avg", value: `${historicalAvg.toFixed(1)}${unit}`, color: "#888780" },
    { label: "Rank", value: `${ordinal(rank)} of ${totalAdmins}`, color: verdictColor },
  ];

  const pillY = 290;
  const pillW = 200, pillH = 64, pillGap = 24;
  pills.forEach((p, i) => {
    const px = 60 + i * (pillW + pillGap);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(px, pillY, pillW, pillH, 6);
    ctx.fill();
    ctx.strokeStyle = "#e2ded6";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#888780";
    ctx.font = "bold 10px 'DM Sans', sans-serif";
    ctx.letterSpacing = "1px";
    ctx.fillText(p.label.toUpperCase(), px + 14, pillY + 24);
    ctx.letterSpacing = "0px";

    ctx.fillStyle = p.color;
    ctx.font = "bold 20px 'DM Sans', sans-serif";
    ctx.fillText(p.value, px + 14, pillY + 50);
  });

  // Spark line
  if (sparkData.length > 1) {
    const sparkX = 60, sparkY = 400, sparkW = W - 120, sparkH = 120;
    const min = Math.min(...sparkData);
    const max = Math.max(...sparkData);
    const range = max - min || 1;

    ctx.beginPath();
    ctx.strokeStyle = "#E24B4A";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    sparkData.forEach((v, i) => {
      const x = sparkX + (i / (sparkData.length - 1)) * sparkW;
      const y = sparkY + sparkH - ((v - min) / range) * sparkH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Dot at end
    const lastX = sparkX + sparkW;
    const lastY = sparkY + sparkH - ((sparkData[sparkData.length - 1] - min) / range) * sparkH;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#E24B4A";
    ctx.fill();
  }

  // Footer
  ctx.fillStyle = "#e2ded6";
  ctx.fillRect(0, H - 50, W, 1);
  ctx.fillStyle = "#888780";
  ctx.font = "400 13px 'DM Sans', sans-serif";
  ctx.fillText("voteunbiased.org · source: FRED (Federal Reserve Economic Data)", 60, H - 18);

  // Red accent bar at bottom
  ctx.fillStyle = "#E24B4A";
  ctx.fillRect(0, H - 4, W, 4);

  return canvas;
}

/* ─────────────────────────────────────────────
   MAIN PAGE COMPONENT
───────────────────────────────────────────── */
export default function LiveBenchmark() {
  const mob = useIsMobile();
  const [metric, setMetric] = useState<"unemployment" | "inflation" | "gdp">("unemployment");
  const [data, setData] = useState<APIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  // Fetch data
  useEffect(() => {
    fetch("/api/benchmark-data")
      .then(r => r.json())
      .then((d: APIResponse) => { if (!d.error) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Build admin lookup map
  const adminMap = useMemo(() => {
    if (!data) return {};
    const m: Record<string, { name: string; party: string; current: boolean }> = {};
    data.admins.forEach(a => { m[a.id] = a; });
    return m;
  }, [data]);

  // Current metric data
  const md = data?.metrics[metric];
  const currentMonth = data?.currentMonth ?? 0;

  // Build recharts data: array of { month, adminId1: val, adminId2: val, ... }
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

  // Stats for the current administration at the current month
  const stats = useMemo(() => {
    if (!md || currentMonth === undefined) return null;

    const currentAdmin = md.series.find(s => s.current);
    if (!currentAdmin) return null;

    // Find closest data point to currentMonth for current admin
    const currentPt = [...currentAdmin.data]
      .filter(p => p.month <= currentMonth)
      .sort((a, b) => b.month - a.month)[0];

    if (!currentPt) return null;
    const atMonth = currentPt.month;
    const currentValue = currentPt.value;

    // Historical average at that month across other admins
    const othersAtMonth: number[] = [];
    for (const s of md.series) {
      if (s.current) continue;
      // Find closest point to atMonth
      const closest = [...s.data]
        .filter(p => p.month <= atMonth + 1 && p.month >= atMonth - 1)
        .sort((a, b) => Math.abs(a.month - atMonth) - Math.abs(b.month - atMonth))[0];
      if (closest) othersAtMonth.push(closest.value);
    }
    const historicalAvg = othersAtMonth.length > 0
      ? othersAtMonth.reduce((s, v) => s + v, 0) / othersAtMonth.length
      : currentValue;

    // Rank: all admins at this month
    const allAtMonth: { id: string; value: number; current: boolean }[] = [];
    for (const s of md.series) {
      const closest = [...s.data]
        .filter(p => p.month <= atMonth + 1 && p.month >= atMonth - 1)
        .sort((a, b) => Math.abs(a.month - atMonth) - Math.abs(b.month - atMonth))[0];
      if (closest) allAtMonth.push({ id: s.id, value: closest.value, current: s.current });
    }

    // Sort: for lowerBetter, ascending (lower=better=rank 1); for !lowerBetter, descending
    allAtMonth.sort((a, b) => md.lowerBetter ? a.value - b.value : b.value - a.value);
    const rank = allAtMonth.findIndex(a => a.current) + 1;

    // Spark data for current admin
    const sparkData = currentAdmin.data
      .filter(p => p.month <= currentMonth)
      .sort((a, b) => a.month - b.month)
      .map(p => p.value);

    return { currentValue, historicalAvg, rank, total: allAtMonth.length, atMonth, sparkData };
  }, [md, currentMonth]);

  const betterThanAvg = stats && md
    ? (md.lowerBetter ? stats.currentValue < stats.historicalAvg : stats.currentValue > stats.historicalAvg)
    : false;

  // ── Share card handlers ──
  const handleDownload = useCallback(() => {
    if (!stats || !md) return;
    const canvas = generateShareCard(
      md.label, stats.currentValue, md.unit, stats.rank, stats.total,
      md.lowerBetter, stats.historicalAvg, currentMonth, stats.sparkData
    );
    const link = document.createElement("a");
    link.download = `open-ledger-${metric}-month-${currentMonth}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    setShareStatus("Downloaded!");
    setTimeout(() => setShareStatus(null), 2000);
  }, [stats, md, metric, currentMonth]);

  const handleCopyImage = useCallback(async () => {
    if (!stats || !md) return;
    const canvas = generateShareCard(
      md.label, stats.currentValue, md.unit, stats.rank, stats.total,
      md.lowerBetter, stats.historicalAvg, currentMonth, stats.sparkData
    );
    try {
      const blob = await new Promise<Blob>((res) => canvas.toBlob(b => res(b!), "image/png"));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setShareStatus("Copied to clipboard!");
    } catch {
      setShareStatus("Copy failed — try download");
    }
    setTimeout(() => setShareStatus(null), 2000);
  }, [stats, md, metric, currentMonth]);

  const tweetText = stats && md
    ? `${md.label} at month ${currentMonth} of Trump's 2nd term: ${stats.currentValue.toFixed(1)}${md.unit} — ranked ${ordinal(stats.rank)} of ${stats.total} administrations at the same point in office.\n\nvoteunbiased.org/live-benchmark #OpenLedger`
    : "";

  // ── Styles ──
  const sty = {
    page: { minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: "'Source Serif 4','Georgia',serif" },
    card: { background: C.card, border: `1px solid ${C.rule}`, borderRadius: 4 },
  };

  const METRIC_TABS: { key: "unemployment" | "inflation" | "gdp"; label: string }[] = [
    { key: "unemployment", label: "Unemployment" },
    { key: "inflation", label: "Inflation" },
    { key: "gdp", label: "GDP Growth" },
  ];

  return (
    <div style={sty.page}>
      <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,300;8..60,400;8..60,600;8..60,700;8..60,900&family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; -webkit-font-smoothing: antialiased; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100%{box-shadow:0 0 0 0 rgba(226,75,74,0.2)} 50%{box-shadow:0 0 0 8px rgba(226,75,74,0)} }
        .bench-fade { animation: fadeUp 0.5s ease forwards; }
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
            Where does the current administration rank vs. every prior president — at the <strong style={{ color: C.ink }}>same month in office?</strong> Not calendar years. Month 15 vs. month 15.
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

            {/* ── Metric Toggle ── */}
            <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.rule}`, marginBottom: 24 }}>
              {METRIC_TABS.map(t => (
                <button key={t.key} onClick={() => setMetric(t.key)} style={{
                  padding: mob ? "10px 14px" : "12px 20px", border: "none", background: "transparent", cursor: "pointer",
                  fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600,
                  color: metric === t.key ? C.ink : C.mute,
                  borderBottom: metric === t.key ? `2px solid ${C.accent}` : "2px solid transparent",
                  transition: "all 0.2s",
                }}>{t.label}</button>
              ))}
            </div>

            {/* ── Stat Cards ── */}
            {stats && md && (
              <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
                {/* Current value */}
                <div style={{ ...sty.card, padding: "18px 20px", borderTop: `4px solid ${C.accent}` }}>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" as const, color: C.mute, marginBottom: 6 }}>
                    Trump II · Month {currentMonth}
                  </div>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 32, fontWeight: 900, color: C.ink, fontVariantNumeric: "tabular-nums" }}>
                    {fmtVal(stats.currentValue, md.unit)}
                  </div>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: C.mute, marginTop: 4 }}>{md.label}</div>
                </div>

                {/* Historical average */}
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

                {/* Rank */}
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

            {/* ── Spaghetti Chart ── */}
            {md && (
              <div ref={chartRef} style={{ ...sty.card, padding: mob ? "16px 8px 10px" : "24px 20px 14px", marginBottom: 20 }}>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" as const, color: C.mute, marginBottom: 16, paddingLeft: mob ? 8 : 0 }}>
                  {md.label} — Months in Office (0 to 48)
                </div>
                <ResponsiveContainer width="100%" height={mob ? 300 : 420}>
                  <LineChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.rule} strokeOpacity={0.6} />
                    <XAxis
                      dataKey="month" type="number" domain={[0, 48]}
                      stroke={C.mute} fontSize={11} fontFamily="'DM Sans',sans-serif"
                      tick={{ fill: C.sub }} axisLine={{ stroke: C.rule }}
                      tickFormatter={(v: number) => `${v}`}
                      label={{ value: "Months in office", position: "insideBottom", offset: -4, fontSize: 10, fill: C.mute, fontFamily: "'DM Sans',sans-serif" }}
                    />
                    <YAxis
                      stroke={C.rule} fontSize={10} fontFamily="'DM Sans',sans-serif"
                      tick={{ fill: C.sub }} axisLine={{ stroke: C.rule }}
                      tickFormatter={(v: number) => `${v}${md.unit}`}
                    />
                    <Tooltip content={<BenchTooltip metric={md} adminMap={adminMap} />} />

                    {/* Vertical marker at current month */}
                    <ReferenceLine x={currentMonth} stroke={C.accent} strokeDasharray="4 4" strokeWidth={1.5} />

                    {/* Prior admin lines — muted gray dashed */}
                    {md.series.filter(s => !s.current).map(s => (
                      <Line
                        key={s.id} type="monotone" dataKey={s.id}
                        stroke={C.mute} strokeWidth={1.2} strokeDasharray="4 3"
                        dot={false} connectNulls name={s.name}
                        strokeOpacity={0.5}
                      />
                    ))}

                    {/* Current admin line — highlighted */}
                    {md.series.filter(s => s.current).map(s => (
                      <Line
                        key={s.id} type="monotone" dataKey={s.id}
                        stroke={C.accent} strokeWidth={3}
                        dot={false} connectNulls name={s.name}
                        activeDot={{ r: 5, fill: C.accent, stroke: "#fff", strokeWidth: 2 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>

                {/* Legend */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: mob ? 8 : 14, padding: mob ? "10px 8px 0" : "12px 0 0", borderTop: `1px solid ${C.rule}`, marginTop: 8 }}>
                  {md.series.map(s => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "'DM Sans',sans-serif", fontSize: 11 }}>
                      <span style={{
                        width: 16, height: 2, borderRadius: 1,
                        background: s.current ? C.accent : C.mute,
                        borderTop: s.current ? "none" : "1px dashed " + C.mute,
                      }} />
                      <span style={{ color: s.current ? C.accent : C.sub, fontWeight: s.current ? 700 : 400 }}>
                        {s.name}
                      </span>
                    </div>
                  ))}
                </div>
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
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                    transition: "all 0.15s",
                  }}>
                    ↓ Download PNG
                  </button>
                  <button onClick={handleCopyImage} style={{
                    padding: "8px 16px", borderRadius: 4, border: `1px solid ${C.rule}`,
                    background: C.card, color: C.ink, fontFamily: "'DM Sans',sans-serif",
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                    transition: "all 0.15s",
                  }}>
                    ⎘ Copy to Clipboard
                  </button>
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{
                      padding: "8px 16px", borderRadius: 4, border: `1px solid ${C.accent}33`,
                      background: `${C.accent}08`, color: C.accent, fontFamily: "'DM Sans',sans-serif",
                      fontSize: 12, fontWeight: 600, textDecoration: "none",
                      transition: "all 0.15s",
                    }}
                  >
                    𝕏 Post
                  </a>
                </div>
                {shareStatus && (
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: C.green, fontWeight: 600 }}>
                    {shareStatus}
                  </div>
                )}
                {/* Pre-written tweet preview */}
                <div style={{ background: C.paper, borderRadius: 4, padding: "10px 14px", marginTop: 8 }}>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: C.sub, lineHeight: 1.6, whiteSpace: "pre-line" }}>
                    {tweetText}
                  </div>
                </div>
              </div>
            )}

            {/* ── Methodology ── */}
            <div style={{ background: C.highlight, border: "1px solid #f5deb3", borderRadius: 4, padding: "14px 18px", marginBottom: 20 }}>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, lineHeight: 1.7, color: "#78716c" }}>
                <strong style={{ color: C.ink }}>↳ How this works: </strong>
                Every administration is aligned to month 0 (inauguration day). So you're comparing Trump month {currentMonth} to Obama month {currentMonth} to Reagan month {currentMonth} — not calendar years. This isolates the trajectory of each presidency from the conditions they inherited. Data is pulled live from FRED (Federal Reserve Economic Data). GDP is quarterly, interpolated to monthly for alignment. CPI inflation is calculated as year-over-year % change from the raw index.
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
