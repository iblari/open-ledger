"use client";

// State Atlas — Trend Chart (Phase B).
//
// Editorial line chart: always shows the unweighted national mean across the
// 12-year window (2014-2025); each clicked state on the map adds its own line
// in a distinct color. Max 5 selected states.

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

import { C as EC, SERIF as ESERIF, SANS as ESANS } from "@/lib/design-tokens";
import {
  HISTORY_YEARS,
  STATE_NAMES,
  formatMetricValue,
  nationalHistory,
  stateHistory,
  type StateCode,
  type StateMetric,
} from "@/lib/state-data";

// Distinct, color-blind-aware palette for selected-state lines. Cycles if
// somehow more than 5 are selected (we cap at 5 in the UI but defensive).
const STATE_LINE_COLORS = [
  "#b8372d", // accent red
  "#1d4ed8", // blue
  "#0d7377", // teal (shared with improve color but darker shade)
  "#a67c00", // gold
  "#5b21b6", // purple
];

export function stateLineColor(idx: number): string {
  return STATE_LINE_COLORS[idx % STATE_LINE_COLORS.length];
}

export function StateTrendChart({
  metric,
  selected,
}: {
  metric: StateMetric;
  selected: StateCode[];
}) {
  // Build the chart data: one row per year, with `national` + one column per
  // selected state (keyed by state code). Recharts iterates rows, lines pull
  // their values by dataKey.
  const nat = nationalHistory(metric);
  const stateSeries: Record<StateCode, number[]> = {} as Record<StateCode, number[]>;
  for (const code of selected) {
    const h = stateHistory(metric, code);
    if (h) stateSeries[code] = h;
  }

  const data = HISTORY_YEARS.map((y, i) => {
    const row: Record<string, number | string> = { year: y, national: round(nat[i], metric) };
    for (const code of selected) {
      const series = stateSeries[code];
      if (series) row[code] = round(series[i], metric);
    }
    return row;
  });

  const isSum = metric.aggregateMethod === "sum";
  const nationalLabel = isSum ? "US total" : "National avg";

  return (
    <div style={{ background: EC.card, border: `1px solid ${EC.rule}`, borderRadius: 4, padding: 16, marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontFamily: ESERIF, fontSize: 18, fontWeight: 500, color: EC.ink, letterSpacing: "-0.01em" }}>
            {metric.label} <span style={{ color: EC.mute, fontWeight: 400 }}>· trend, {HISTORY_YEARS[0]}&ndash;{HISTORY_YEARS[HISTORY_YEARS.length - 1]}</span>
          </div>
          <div style={{ fontFamily: ESANS, fontSize: 11, color: EC.sub, marginTop: 2, letterSpacing: "0.02em" }}>
            {isSum ? (
              selected.length === 0
                ? <>The dashed line shows the US total (right axis). Click any state on the map to add its line on the left axis.</>
                : <>Dashed line: US total ({nationalLabel}, right axis). Colored lines: your selected states (left axis).</>
            ) : (
              selected.length === 0
                ? <>Showing the unweighted national mean. Click any state on the map to add its line.</>
                : <>Black line is the unweighted national mean. Colored lines are your selected states.</>
            )}
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 8, right: isSum ? 60 : 16, left: 4, bottom: 6 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={EC.rule} />
          <XAxis dataKey="year" stroke={EC.mute} fontSize={11} fontFamily={ESANS}
                 tick={{ fill: EC.sub }} interval={1} />
          {/* Left axis: per-state values. */}
          <YAxis yAxisId="left" stroke={EC.rule} fontSize={11} fontFamily={ESANS}
                 tick={{ fill: EC.sub }} width={60}
                 tickFormatter={(v: number) => formatMetricValue(metric, v)} />
          {/* Right axis (sum-aggregate metrics only): national total, separate scale. */}
          {isSum && (
            <YAxis yAxisId="right" orientation="right" stroke={EC.rule} fontSize={11} fontFamily={ESANS}
                   tick={{ fill: EC.mute }} width={60}
                   tickFormatter={(v: number) => formatMetricValue(metric, v)} />
          )}
          <Tooltip content={(rechartProps) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const props = rechartProps as any;
            if (!props.active || !props.payload?.length) return null;
            return (
              <div style={{
                background: EC.ink, color: "#fff", padding: "10px 14px", borderRadius: 6,
                fontFamily: ESANS, fontSize: 12, lineHeight: 1.5, minWidth: 180,
                boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
              }}>
                <div style={{ fontFamily: ESERIF, fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{props.label}</div>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {props.payload.map((p: any, i: number) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ color: p.color, fontWeight: 500 }}>
                      {p.dataKey === "national" ? nationalLabel : STATE_NAMES[p.dataKey as StateCode] ?? p.dataKey}
                    </span>
                    <span>{formatMetricValue(metric, p.value)}</span>
                  </div>
                ))}
              </div>
            );
          }} />

          {/* National line — bold for mean metrics, dashed muted for sum metrics
              (to signal it's on a different scale). */}
          <Line yAxisId={isSum ? "right" : "left"}
                type="monotone" dataKey="national"
                stroke={EC.ink} strokeWidth={2.5}
                strokeDasharray={isSum ? "5 3" : undefined}
                dot={false} activeDot={{ r: 4 }} name={nationalLabel} />

          {/* Per-selected-state lines — always on left axis. */}
          {selected.map((code, i) => (
            <Line key={code} yAxisId="left"
                  type="monotone" dataKey={code}
                  stroke={stateLineColor(i)} strokeWidth={2}
                  dot={false} activeDot={{ r: 4 }}
                  name={STATE_NAMES[code]} />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Auto-insights: comparative facts derived from the selected states.
          Only renders when at least one state is selected; the "select a state"
          empty-state copy already lives in the chart subtitle above. */}
      {selected.length > 0 && (
        <InsightsPanel metric={metric} selected={selected} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Insights panel — comparative facts about selected states
// ─────────────────────────────────────────────────────────────────
//
// What it surfaces:
//   - For each selected state: total change over 11 years + how it compares
//     to the unweighted national mean (above / below by N units).
//   - When 2+ states are selected: who grew fastest, who slowest, by how much.
//   - When relevant: which state(s) cross the national trend.
//
// What it CAN'T surface today (intentional honest limitation, noted in the
// footer): year-over-year spikes or anomalies. The underlying state data is
// back-filled from per-state CAGRs, so the trend lines are mathematically
// smooth — there are no real spikes to detect. If/when we wire up real
// annual per-state series, that's where this expands.

function InsightsPanel({
  metric,
  selected,
}: {
  metric: StateMetric;
  selected: StateCode[];
}) {
  const isSum = metric.aggregateMethod === "sum";
  const nat = nationalHistory(metric);
  const natStart = nat[0];
  const natEnd = nat[nat.length - 1];

  // Build per-state observation rows. Skip any state whose latest is missing.
  type Row = {
    code: StateCode;
    name: string;
    color: string;
    start: number;
    end: number;
    absChange: number;     // end - start
    pctChange: number;     // (end - start) / start
  };
  const rows: Row[] = selected.flatMap((code, idx) => {
    const h = stateHistory(metric, code);
    if (!h) return [];
    const start = h[0];
    const end = h[h.length - 1];
    return [{
      code,
      name: STATE_NAMES[code],
      color: stateLineColor(idx),
      start, end,
      absChange: end - start,
      pctChange: start !== 0 ? (end - start) / start : 0,
    }];
  });
  if (rows.length === 0) return null;

  // Sort by % change descending (fastest grower first) for downstream picks.
  const byGrowth = [...rows].sort((a, b) => b.pctChange - a.pctChange);
  const fastest = byGrowth[0];
  const slowest = byGrowth[byGrowth.length - 1];

  // Detect "all selected states have the same % change" — happens when the
  // metric uses a single default CAGR with no per-state overrides, so back-
  // filling produces identical 11-year deltas for every state. Showing
  // '+12%' five times in a row pretends to be a comparison when it isn't.
  // When detected, suppress per-row badges + the "X grew faster than Y" line
  // and let the footer caveat carry the explanation.
  const pctSpread = rows.length > 1
    ? (fastest.pctChange - slowest.pctChange) * 100
    : 0;
  const allChangesIdentical = rows.length > 1 && Math.abs(pctSpread) < 0.5;

  // ─── Build the facts. Each is { kind, text, color? } ───
  type Fact = { text: React.ReactNode; tone?: "neutral" | "good" | "bad" };
  const facts: Fact[] = [];

  // Fact 1 — per-state line for every selected state.
  for (const r of rows) {
    const startTxt = formatMetricValue(metric, r.start);
    const endTxt = formatMetricValue(metric, r.end);
    const pctTxt = `${r.pctChange >= 0 ? "+" : ""}${(r.pctChange * 100).toFixed(0)}%`;
    // For non-sum metrics, "vs national" is the position relative to the
    // unweighted state mean at end-of-window. For sum metrics it doesn't make
    // sense to compare a state to a national total, so we skip the comparison.
    const vsNatTxt = !isSum
      ? (() => {
          const diff = r.end - natEnd;
          const dirWord = diff >= 0 ? "above" : "below";
          // "Costlike" metrics (rent, gas, etc.) — being above the mean is bad,
          // so flip the tone. For "improvement" metrics (incomes, wages),
          // above is good. We default to neutral when the metric is ambiguous.
          return (
            <span style={{ color: EC.mute }}>
              {" — "}
              {formatMetricValue(metric, Math.abs(diff))} {dirWord} national avg
            </span>
          );
        })()
      : null;
    facts.push({
      text: (
        <>
          <span style={{ color: r.color, fontWeight: 600 }}>{r.name}</span>
          {" "}
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{startTxt} → {endTxt}</span>
          {/* Hide the (+X%) badge when all selected states share the same
              change — they're all back-filled from the same per-metric CAGR,
              so the badge would just repeat the same number for everyone and
              imply a comparison that isn't there. */}
          {!allChangesIdentical && (
            <>
              {" "}
              <span style={{
                color: r.pctChange >= 0 ? EC.improveStrong : EC.declineStrong,
                fontWeight: 600, fontVariantNumeric: "tabular-nums",
              }}>({pctTxt})</span>
            </>
          )}
          {vsNatTxt}
        </>
      ),
    });
  }

  // Fact 2 — comparative line when 2+ states are selected. Spread captures
  // how different the selected slice is from itself; a wide spread is the
  // interesting story ("Hawaii grew 3× faster than West Virginia").
  // Skipped entirely when allChangesIdentical (no real spread to talk about).
  if (rows.length >= 2 && Math.abs(pctSpread) >= 5) {
    const ratio = slowest.pctChange !== 0
      ? Math.abs(fastest.pctChange / slowest.pctChange)
      : null;
    facts.push({
      text: (
        <>
          <span style={{ color: fastest.color, fontWeight: 600 }}>{fastest.name}</span>
          {" grew "}
          {ratio && ratio >= 1.4
            ? <><strong style={{ color: EC.ink }}>{ratio.toFixed(1)}×</strong> faster than </>
            : <>more than </>}
          <span style={{ color: slowest.color, fontWeight: 600 }}>{slowest.name}</span>
          {" over the window."}
        </>
      ),
      tone: "neutral",
    });
  }

  // Fact 3 — national context, only for mean-aggregated metrics. For sum
  // metrics the national line is on a different axis and a "vs national"
  // comparison would be misleading.
  if (!isSum) {
    const natPct = natStart !== 0 ? ((natEnd - natStart) / natStart) * 100 : 0;
    const abovePeers = rows.filter(r => r.end > natEnd).length;
    const belowPeers = rows.length - abovePeers;
    if (abovePeers > 0 && belowPeers > 0) {
      facts.push({
        text: (
          <>
            {abovePeers} of your {rows.length} selected{" "}
            {abovePeers === 1 ? "state is" : "states are"} above the national average
            {" "}({formatMetricValue(metric, natEnd)}); {belowPeers} below.
          </>
        ),
      });
    } else if (abovePeers === rows.length) {
      facts.push({
        text: (
          <>
            All {rows.length} selected {rows.length === 1 ? "state is" : "states are"} above the
            national average ({formatMetricValue(metric, natEnd)}, +{natPct.toFixed(0)}% over the window).
          </>
        ),
      });
    } else {
      facts.push({
        text: (
          <>
            All {rows.length} selected {rows.length === 1 ? "state is" : "states are"} below the
            national average ({formatMetricValue(metric, natEnd)}).
          </>
        ),
      });
    }
  }

  return (
    <div style={{
      marginTop: 14, paddingTop: 14, borderTop: `1px solid ${EC.rule}`,
    }}>
      <div style={{
        fontFamily: ESANS, fontSize: 10, letterSpacing: "0.14em",
        textTransform: "uppercase", color: EC.mute, fontWeight: 600, marginBottom: 8,
      }}>
        What stands out
      </div>
      <ul style={{
        margin: 0, padding: 0, listStyle: "none",
        display: "flex", flexDirection: "column", gap: 6,
      }}>
        {facts.map((f, i) => (
          <li key={i} style={{
            fontFamily: ESANS, fontSize: 12.5, color: EC.ink, lineHeight: 1.55,
            paddingLeft: 14, position: "relative",
          }}>
            <span style={{
              position: "absolute", left: 0, top: 9,
              width: 5, height: 5, borderRadius: "50%",
              background: f.tone === "good" ? EC.improveStrong
                        : f.tone === "bad"  ? EC.declineStrong
                        : EC.mute,
            }} />
            {f.text}
          </li>
        ))}
      </ul>
      {/* Honest caveat: the trend lines are smooth because the underlying
          per-state data is currently back-filled from CAGRs. Once we wire up
          real annual series, we can light up spike/dip detection here. */}
      <div style={{
        marginTop: 10, fontFamily: ESANS, fontSize: 10, color: EC.mute,
        lineHeight: 1.5, fontStyle: "italic",
      }}>
        {allChangesIdentical
          ? "All selected states share the same back-filled growth rate for this metric, so % changes are intentionally hidden. Start → end values are real (sourced) endpoints; the in-between years are smoothed estimates pending real annual per-state data."
          : "Trend lines are smoothed from per-state growth rates; year-over-year spike detection lights up once real annual data is wired in."}
      </div>
    </div>
  );
}

// Round a value to a sensible precision for the metric's unit so the y-axis
// doesn't show floating-point garbage like 17.500000001.
function round(v: number, m: StateMetric): number {
  switch (m.unit) {
    case "$K":     return Math.round(v);
    case "¢/kWh":  return Math.round(v * 10) / 10;
    case "$/gal":  return Math.round(v * 100) / 100;
    case "$/mo":   return Math.round(v);
    case "%":      return Math.round(v * 100) / 100;
    case "M":      return Math.round(v * 100) / 100;
    case "¢/gal":  return Math.round(v * 10) / 10;
    case "yrs":    return Math.round(v * 10) / 10;
    case "per100K":return Math.round(v * 10) / 10;
    case "per1K":  return Math.round(v * 100) / 100;
    case "±pp":    return Math.round(v * 10) / 10;
  }
}
