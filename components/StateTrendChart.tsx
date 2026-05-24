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
  }
}
