"use client";

// State Atlas — tilegrid renderer (Phase F).
//
// Editorial cartogram: each state is an equal-sized rounded square laid out
// in a US-shaped grid. Same color logic, tooltip, and click-to-select as
// the geographic StateAtlas component, just a different renderer.
//
// Why tilegrid: small states (Rhode Island, Delaware, DC) aren't pixels here;
// every state gets equal visual weight. Better for "which state is darkest"
// readings; worse for "are southern states clustering" spatial reads.
//
// Layout: 11 cols × 8 rows. Hand-placed to match conventional US tilegrids
// (NPR, FiveThirtyEight style) — geographically suggestive but not literal.

import { useState } from "react";

import { C as EC, SERIF as ESERIF, SANS as ESANS } from "@/lib/design-tokens";
import {
  STATE_NAMES,
  type StateCode,
  type StateMetric,
} from "@/lib/state-data";
import { stateLineColor } from "./StateTrendChart";

// (col, row) for each state in an 11×8 grid. 0,0 is top-left. Hand-curated
// to give a geographically suggestive shape (Northeast clustered upper-right,
// West Coast left, South + Texas bottom).
const GRID: Record<StateCode, [number, number]> = {
  ME: [10, 0],
  VT: [8, 1], NH: [9, 1],
  WI: [5, 2], MI: [6, 2], NY: [7, 2], MA: [8, 2], CT: [9, 2], RI: [10, 2],
  WA: [1, 3], ID: [2, 3], MT: [3, 3], ND: [4, 3], MN: [5, 3], IL: [6, 3], IN: [7, 3], OH: [8, 3], PA: [9, 3], NJ: [10, 3],
  AK: [0, 4], OR: [1, 4], NV: [2, 4], WY: [3, 4], SD: [4, 4], IA: [5, 4], MO: [6, 4], KY: [7, 4], WV: [8, 4], VA: [9, 4], MD: [10, 4],
  HI: [0, 5], CA: [1, 5], UT: [2, 5], CO: [3, 5], NE: [4, 5], AR: [5, 5], TN: [6, 5], NC: [7, 5], SC: [8, 5], DC: [9, 5], DE: [10, 5],
  AZ: [2, 6], NM: [3, 6], KS: [4, 6], OK: [5, 6], LA: [6, 6], MS: [7, 6], AL: [8, 6], GA: [9, 6], FL: [10, 6],
  TX: [4, 7],
};

const N_COLS = 11;
const N_ROWS = 8;

type TooltipState = { code: StateCode; x: number; y: number } | null;

export function StateTileGrid({
  metric,
  colorFor,
  formatValue,
  selected,
  onToggleSelect,
}: {
  metric: StateMetric;
  // Caller provides a unified color function so geo + tile renderers stay in sync.
  colorFor: (m: StateMetric, v: number | undefined) => string;
  formatValue: (v: number | undefined) => string;
  selected: StateCode[];
  onToggleSelect: (code: StateCode) => void;
}) {
  const [tooltip, setTooltip] = useState<TooltipState>(null);

  return (
    <div style={{ position: "relative", padding: 16, background: EC.card }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${N_COLS}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${N_ROWS}, 1fr)`,
        gap: 4,
        aspectRatio: `${N_COLS} / ${N_ROWS}`,
        maxWidth: 720,
        margin: "0 auto",
      }}>
        {(Object.entries(GRID) as [StateCode, [number, number]][]).map(([code, [c, r]]) => {
          const v = metric.latest[code];
          const bg = colorFor(metric, v);
          const isSelected = selected.includes(code);
          const stroke = isSelected ? stateLineColor(selected.indexOf(code)) : "transparent";
          return (
            <button
              key={code}
              onClick={() => onToggleSelect(code)}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const wrap = e.currentTarget.closest("[data-tilegrid-wrap]") as HTMLElement | null;
                const wrapRect = wrap?.getBoundingClientRect();
                if (!wrapRect) return;
                setTooltip({
                  code,
                  x: rect.left - wrapRect.left + rect.width / 2,
                  y: rect.top - wrapRect.top - 8,
                });
              }}
              onMouseLeave={() => setTooltip(null)}
              aria-label={`${STATE_NAMES[code]}: ${formatValue(v)}`}
              style={{
                gridColumn: c + 1,
                gridRow: r + 1,
                background: bg,
                border: `2px solid ${stroke}`,
                borderRadius: 4,
                padding: 0,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: ESANS,
                fontSize: 11,
                fontWeight: 600,
                color: getTextColor(bg),
                letterSpacing: "0.04em",
                transition: "transform 0.12s ease, box-shadow 0.12s ease",
                outline: "none",
              }}
              onFocus={(e) => { e.currentTarget.style.boxShadow = `0 0 0 2px ${EC.accent}`; }}
              onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }}
            >
              {code}
            </button>
          );
        })}
      </div>

      {/* Tooltip overlay */}
      <div data-tilegrid-wrap style={{ position: "absolute", inset: 16, pointerEvents: "none" }}>
        {tooltip && (
          <div style={{
            position: "absolute",
            left: tooltip.x, top: tooltip.y,
            transform: "translate(-50%, -100%)",
            background: EC.ink, color: "#fff",
            padding: "8px 12px", borderRadius: 4,
            fontSize: 12, fontFamily: ESANS, lineHeight: 1.4,
            pointerEvents: "none",
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
            minWidth: 160, textAlign: "center",
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}>
            <div style={{ fontFamily: ESERIF, fontWeight: 600, fontSize: 13 }}>{STATE_NAMES[tooltip.code]}</div>
            <div style={{
              fontFamily: ESERIF, fontWeight: 500, marginTop: 2,
              color: metric.costLike ? "#fed7aa" : "#8ee3e6",
            }}>{formatValue(metric.latest[tooltip.code])}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// Pick text color (dark or light) based on the cell background's alpha so the
// state code stays legible. Our cell bg is rgba(R,G,B,alpha); alpha above 0.5
// means dark/saturated background → light text.
function getTextColor(rgba: string): string {
  const match = rgba.match(/rgba?\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)/);
  if (!match) return EC.ink;
  const alpha = parseFloat(match[1]);
  return alpha > 0.5 ? "#fff" : EC.ink;
}
