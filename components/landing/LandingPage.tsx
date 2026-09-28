"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import CheetahMark from "@/components/CheetahMark";
import {
  BarChart, Bar, Cell as RechartsCell, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import Link from "next/link";

// Design tokens + per-metric display helpers — shared with the dashboard.
import { C, SERIF, SANS } from "@/lib/design-tokens";
import {
  type Cell, type DisplayMode, type DollarMode,
  computeHeatmap, METRIC_DISPLAY_LANDING,
  getDisplayedChange, formatDisplayedChange, colorMagnitude,
  cellColor, cellColorFromMag,
} from "@/lib/display-modes";
import { PillToggle } from "@/components/PillToggle";
import { InsightsStrip } from "@/components/InsightsStrip";

// Below-the-fold, client-only teaser animation — keep out of the main bundle.
import LivePromo from "./LivePromo";
// WhatsChanging renders only on /trends now (homepage strip removed).

/* ─────────────────────────────────────────────
   ADMINS & METRIC DATA — subset for heatmap
───────────────────────────────────────────── */
const ADMINS: Record<string, { name: string; party: string; years: string; color: string; full: string }> = {
  clinton: { name: "Clinton", party: "D", years: "'93–'01", color: "#1e6b9e", full: "1993–2001" },
  bush:    { name: "Bush W.", party: "R", years: "'01–'09", color: "#8b4c70", full: "2001–2009" },
  obama:   { name: "Obama",   party: "D", years: "'09–'17", color: "#2d6a4f", full: "2009–2017" },
  trump1:  { name: "Trump",   party: "R", years: "'17–'21", color: "#c1272d", full: "2017–2021" },
  biden:   { name: "Biden",   party: "D", years: "'21–'25", color: "#4361a6", full: "2021–2025" },
};
const AID = ["clinton", "bush", "obama", "trump1", "biden"];

type DataPoint = { y: number; v: number; a: string };
type MetricDef = {
  l: string; u: string; inv: boolean; cat: string;
  d: DataPoint[];
};

const METRICS: Record<string, MetricDef> = {
  gdp: { l: "GDP Growth", u: "%", inv: false, cat: "Growth",
    d: [{ y: 1993, v: 2.7, a: "clinton" }, { y: 1994, v: 4.0, a: "clinton" }, { y: 1995, v: 2.7, a: "clinton" }, { y: 1996, v: 3.8, a: "clinton" }, { y: 1997, v: 4.5, a: "clinton" }, { y: 1998, v: 4.5, a: "clinton" }, { y: 1999, v: 4.7, a: "clinton" }, { y: 2000, v: 4.1, a: "clinton" }, { y: 2001, v: 1.0, a: "bush" }, { y: 2002, v: 1.7, a: "bush" }, { y: 2003, v: 2.8, a: "bush" }, { y: 2004, v: 3.8, a: "bush" }, { y: 2005, v: 3.5, a: "bush" }, { y: 2006, v: 2.8, a: "bush" }, { y: 2007, v: 2.0, a: "bush" }, { y: 2008, v: -0.1, a: "bush" }, { y: 2009, v: -2.6, a: "obama" }, { y: 2010, v: 2.7, a: "obama" }, { y: 2011, v: 1.5, a: "obama" }, { y: 2012, v: 2.3, a: "obama" }, { y: 2013, v: 1.8, a: "obama" }, { y: 2014, v: 2.3, a: "obama" }, { y: 2015, v: 2.7, a: "obama" }, { y: 2016, v: 1.7, a: "obama" }, { y: 2017, v: 2.2, a: "trump1" }, { y: 2018, v: 2.9, a: "trump1" }, { y: 2019, v: 2.3, a: "trump1" }, { y: 2020, v: -2.8, a: "trump1" }, { y: 2021, v: 5.9, a: "biden" }, { y: 2022, v: 1.9, a: "biden" }, { y: 2023, v: 2.5, a: "biden" }, { y: 2024, v: 2.8, a: "biden" }] },
  unemployment: { l: "Unemployment", u: "%", inv: true, cat: "Jobs",
    d: [{ y: 1993, v: 6.9, a: "clinton" }, { y: 1994, v: 6.1, a: "clinton" }, { y: 1995, v: 5.6, a: "clinton" }, { y: 1996, v: 5.4, a: "clinton" }, { y: 1997, v: 4.9, a: "clinton" }, { y: 1998, v: 4.5, a: "clinton" }, { y: 1999, v: 4.2, a: "clinton" }, { y: 2000, v: 4.0, a: "clinton" }, { y: 2001, v: 4.7, a: "bush" }, { y: 2002, v: 5.8, a: "bush" }, { y: 2003, v: 6.0, a: "bush" }, { y: 2004, v: 5.5, a: "bush" }, { y: 2005, v: 5.1, a: "bush" }, { y: 2006, v: 4.6, a: "bush" }, { y: 2007, v: 4.6, a: "bush" }, { y: 2008, v: 5.8, a: "bush" }, { y: 2009, v: 9.3, a: "obama" }, { y: 2010, v: 9.6, a: "obama" }, { y: 2011, v: 8.9, a: "obama" }, { y: 2012, v: 8.1, a: "obama" }, { y: 2013, v: 7.4, a: "obama" }, { y: 2014, v: 6.2, a: "obama" }, { y: 2015, v: 5.3, a: "obama" }, { y: 2016, v: 4.9, a: "obama" }, { y: 2017, v: 4.4, a: "trump1" }, { y: 2018, v: 3.9, a: "trump1" }, { y: 2019, v: 3.7, a: "trump1" }, { y: 2020, v: 8.1, a: "trump1" }, { y: 2021, v: 5.4, a: "biden" }, { y: 2022, v: 3.6, a: "biden" }, { y: 2023, v: 3.6, a: "biden" }, { y: 2024, v: 4.0, a: "biden" }] },
  inflation: { l: "Inflation (CPI)", u: "%", inv: true, cat: "Prices",
    d: [{ y: 1993, v: 3.0, a: "clinton" }, { y: 1994, v: 2.6, a: "clinton" }, { y: 1995, v: 2.8, a: "clinton" }, { y: 1996, v: 2.9, a: "clinton" }, { y: 1997, v: 2.3, a: "clinton" }, { y: 1998, v: 1.5, a: "clinton" }, { y: 1999, v: 2.2, a: "clinton" }, { y: 2000, v: 3.4, a: "clinton" }, { y: 2001, v: 2.8, a: "bush" }, { y: 2002, v: 1.6, a: "bush" }, { y: 2003, v: 2.3, a: "bush" }, { y: 2004, v: 2.7, a: "bush" }, { y: 2005, v: 3.4, a: "bush" }, { y: 2006, v: 3.2, a: "bush" }, { y: 2007, v: 2.9, a: "bush" }, { y: 2008, v: 3.8, a: "bush" }, { y: 2009, v: -0.3, a: "obama" }, { y: 2010, v: 1.6, a: "obama" }, { y: 2011, v: 3.2, a: "obama" }, { y: 2012, v: 2.1, a: "obama" }, { y: 2013, v: 1.5, a: "obama" }, { y: 2014, v: 1.6, a: "obama" }, { y: 2015, v: 0.1, a: "obama" }, { y: 2016, v: 1.3, a: "obama" }, { y: 2017, v: 2.1, a: "trump1" }, { y: 2018, v: 2.4, a: "trump1" }, { y: 2019, v: 1.8, a: "trump1" }, { y: 2020, v: 1.2, a: "trump1" }, { y: 2021, v: 4.7, a: "biden" }, { y: 2022, v: 8.0, a: "biden" }, { y: 2023, v: 4.1, a: "biden" }, { y: 2024, v: 2.9, a: "biden" }] },
  sp500: { l: "S&P 500", u: "idx", inv: false, cat: "Markets",
    d: [{ y: 1993, v: 452, a: "clinton" }, { y: 1994, v: 460, a: "clinton" }, { y: 1995, v: 615, a: "clinton" }, { y: 1996, v: 741, a: "clinton" }, { y: 1997, v: 970, a: "clinton" }, { y: 1998, v: 1229, a: "clinton" }, { y: 1999, v: 1469, a: "clinton" }, { y: 2000, v: 1320, a: "clinton" }, { y: 2001, v: 1148, a: "bush" }, { y: 2002, v: 880, a: "bush" }, { y: 2003, v: 1112, a: "bush" }, { y: 2004, v: 1212, a: "bush" }, { y: 2005, v: 1249, a: "bush" }, { y: 2006, v: 1418, a: "bush" }, { y: 2007, v: 1468, a: "bush" }, { y: 2008, v: 903, a: "bush" }, { y: 2009, v: 1115, a: "obama" }, { y: 2010, v: 1258, a: "obama" }, { y: 2011, v: 1258, a: "obama" }, { y: 2012, v: 1426, a: "obama" }, { y: 2013, v: 1848, a: "obama" }, { y: 2014, v: 2059, a: "obama" }, { y: 2015, v: 2044, a: "obama" }, { y: 2016, v: 2239, a: "obama" }, { y: 2017, v: 2674, a: "trump1" }, { y: 2018, v: 2507, a: "trump1" }, { y: 2019, v: 3231, a: "trump1" }, { y: 2020, v: 3756, a: "trump1" }, { y: 2021, v: 4766, a: "biden" }, { y: 2022, v: 3840, a: "biden" }, { y: 2023, v: 4770, a: "biden" }, { y: 2024, v: 5881, a: "biden" }] },
  debt_gdp: { l: "Debt-to-GDP", u: "%", inv: true, cat: "Fiscal",
    d: [{ y: 1993, v: 64.4, a: "clinton" }, { y: 1994, v: 64.0, a: "clinton" }, { y: 1995, v: 64.2, a: "clinton" }, { y: 1996, v: 63.3, a: "clinton" }, { y: 1997, v: 60.3, a: "clinton" }, { y: 1998, v: 57.2, a: "clinton" }, { y: 1999, v: 55.3, a: "clinton" }, { y: 2000, v: 54.7, a: "clinton" }, { y: 2001, v: 54.3, a: "bush" }, { y: 2002, v: 56.8, a: "bush" }, { y: 2003, v: 59.1, a: "bush" }, { y: 2004, v: 61.0, a: "bush" }, { y: 2005, v: 60.9, a: "bush" }, { y: 2006, v: 61.1, a: "bush" }, { y: 2007, v: 62.0, a: "bush" }, { y: 2008, v: 67.7, a: "bush" }, { y: 2009, v: 82.4, a: "obama" }, { y: 2010, v: 91.4, a: "obama" }, { y: 2011, v: 95.6, a: "obama" }, { y: 2012, v: 99.7, a: "obama" }, { y: 2013, v: 100.4, a: "obama" }, { y: 2014, v: 103.4, a: "obama" }, { y: 2015, v: 100.8, a: "obama" }, { y: 2016, v: 105.6, a: "obama" }, { y: 2017, v: 105.0, a: "trump1" }, { y: 2018, v: 106.1, a: "trump1" }, { y: 2019, v: 107.2, a: "trump1" }, { y: 2020, v: 129.2, a: "trump1" }, { y: 2021, v: 126.4, a: "biden" }, { y: 2022, v: 120.6, a: "biden" }, { y: 2023, v: 122.3, a: "biden" }, { y: 2024, v: 124.0, a: "biden" }] },
  median_income: { l: "Median Income", u: "$K", inv: false, cat: "Wages",
    d: [{ y: 1993, v: 52.3, a: "clinton" }, { y: 1994, v: 53.2, a: "clinton" }, { y: 1995, v: 54.5, a: "clinton" }, { y: 1996, v: 55.9, a: "clinton" }, { y: 1997, v: 57.6, a: "clinton" }, { y: 1998, v: 59.5, a: "clinton" }, { y: 1999, v: 60.1, a: "clinton" }, { y: 2000, v: 59.5, a: "clinton" }, { y: 2001, v: 58.1, a: "bush" }, { y: 2002, v: 57.4, a: "bush" }, { y: 2003, v: 56.5, a: "bush" }, { y: 2004, v: 56.1, a: "bush" }, { y: 2005, v: 56.2, a: "bush" }, { y: 2006, v: 56.4, a: "bush" }, { y: 2007, v: 57.4, a: "bush" }, { y: 2008, v: 55.3, a: "bush" }, { y: 2009, v: 55.7, a: "obama" }, { y: 2010, v: 54.2, a: "obama" }, { y: 2011, v: 53.4, a: "obama" }, { y: 2012, v: 53.6, a: "obama" }, { y: 2013, v: 54.5, a: "obama" }, { y: 2014, v: 55.6, a: "obama" }, { y: 2015, v: 58.5, a: "obama" }, { y: 2016, v: 60.3, a: "obama" }, { y: 2017, v: 61.4, a: "trump1" }, { y: 2018, v: 63.2, a: "trump1" }, { y: 2019, v: 68.7, a: "trump1" }, { y: 2020, v: 67.5, a: "trump1" }, { y: 2021, v: 70.8, a: "biden" }, { y: 2022, v: 74.6, a: "biden" }, { y: 2023, v: 80.6, a: "biden" }, { y: 2024, v: 81.5, a: "biden" }] },
};

const METRIC_ORDER = ["gdp", "unemployment", "inflation", "sp500", "debt_gdp", "median_income"];

/* ─────────────────────────────────────────────
   LOCAL HELPERS — heatmap is computed via lib/display-modes
───────────────────────────────────────────── */

// Bind the per-metric value resolver to this page's METRICS + METRIC_DISPLAY
// once, so call sites can stay short.
/**
 * How sections are separated.
 *  - "calm":  one cream canvas, generous space between sections, and the dark
 *             Live Broadcast band as the single change of colour.
 *  - "cards": Apple-style — every section is a rounded panel floating on a
 *             white page with a gutter around it; Live Broadcast is the one
 *             dark panel.
 */
const LAYOUT = "calm" as "calm" | "cards";
const PAGE_BG = LAYOUT === "cards" ? "#ffffff" : C.bg;

function Tile({ dark, mob, children, style }: { dark?: boolean; mob: boolean; children: React.ReactNode; style?: React.CSSProperties }) {
  if (LAYOUT === "calm") return <div style={style}>{children}</div>;
  return (
    <div style={{
      background: dark ? "#0C0A08" : "#f3ede5",
      margin: mob ? "0 8px" : "0 16px", borderRadius: mob ? 20 : 28, overflow: "hidden",
      ...style,
    }}>{children}</div>
  );
}
const TILE_GAP = LAYOUT === "cards" ? 16 : 0;

function resolveDisplay(c: Cell, mk: string, mode: DisplayMode, dollarMode: DollarMode) {
  return getDisplayedChange(c, mk, mode, dollarMode, METRIC_DISPLAY_LANDING, METRICS[mk].inv);
}

// Value formatter for start→end display. The landing page uses %, $K, idx.
function fmt(v: number, u: string): string {
  if (u === "%") return v.toFixed(1) + "%";
  if (u === "$K") return "$" + v.toFixed(1) + "K";
  if (u === "idx") return v.toLocaleString();
  return String(v);
}

/* ─────────────────────────────────────────────
   MOBILE HOOK
───────────────────────────────────────────── */
function useIsMobile() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w < 768;
}

function useMedium() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w < 980;
}

/* ═══════════════════════════════════════════════
   COMPONENTS
═══════════════════════════════════════════════ */

/* ── Nav ── */
const NAV_H = 80;
function Nav({ mob, dark = false, overlay = false }: { mob: boolean; dark?: boolean; overlay?: boolean }) {
  // `dark`: floating over the full-screen hero — a translucent smoked bar with
  // light type. It turns back into the cream bar once the hero scrolls away.
  const ink = dark ? "#F4F0EA" : C.ink;
  const sub = dark ? "rgba(244,240,234,.72)" : C.sub;
  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 50,
      // Desktop: a floating, rounded panel inset from the window edges —
      // the bar itself is transparent and the panel inside carries the
      // glass. Phones keep the full-width bar.
      ...(mob ? {
        background: "color-mix(in oklab, #f8f5f0 92%, transparent)",
        backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
        borderBottom: `1px solid ${C.rule}`,
      } : { padding: "12px 16px 0", background: "transparent" }),
      // Overlay: the bar takes no space, so the hero runs full-screen beneath
      // it. Constant (not tied to \`dark\`) so nothing shifts when it recolours.
      ...(overlay ? { marginBottom: -NAV_H } : {}),
    }}>
      <div style={{
        maxWidth: mob ? 1280 : "none", margin: "0 auto", padding: mob ? "12px 20px" : "12px 20px 12px 24px",
        display: "flex", alignItems: "center", gap: mob ? 16 : 40,
        ...(mob ? {} : {
          borderRadius: 12,
          background: dark ? "rgba(28,24,20,.62)" : "rgba(248,245,240,.86)",
          backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
          border: `1px solid ${dark ? "rgba(255,255,255,.08)" : C.rule}`,
          boxShadow: dark ? "none" : "0 6px 24px -12px rgba(20,17,14,.18)",
          transition: "background .25s ease, border-color .25s ease, box-shadow .25s ease",
        }),
      }}>
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: SERIF, flexShrink: 0, whiteSpace: "nowrap", fontSize: 20, fontWeight: 600, letterSpacing: "-0.015em" }}>
          <CheetahMark height={mob ? 22 : 26} ink={ink} accent={dark ? "#E0493A" : C.accent} />
          <span style={{ color: ink, transition: "color .25s ease" }}>Vote <em style={{ fontStyle: "italic", color: dark ? "#E0493A" : C.accent, fontWeight: 500 }}>Unbiased</em></span>
        </div>

        {/* Links — desktop only */}
        {!mob && (
          <div style={{ display: "flex", gap: 24, fontSize: 13, color: sub, fontWeight: 500 }}>
            <a href="#method" style={{ padding: "4px 0", color: sub }}>Methodology</a>
            <a href="#sources" style={{ padding: "4px 0", color: sub }}>Sources</a>
          </div>
        )}

        {/* CTA */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          {/* Both viewports go to the broadcast. This used to send mobile to
              Live Benchmark on the theory that a short "Live" label reads as
              'live data, not a video player' — but the pill carries a pulsing
              red dot, and during an actual broadcast that dot promises the
              broadcast. Tapping it and landing on a chart is the bug. Off air
              /live is still the right destination: it shows the archive, the
              schedule and the record. */}
          {/* C.accent, not the #dc2626 that used to sit here — the same stray
              red that was mismatched in the dashboard nav. */}
          <Link href="/live" className="vu-cta vu-cta-o" style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: mob ? "8px 12px" : "10px 14px",
            borderRadius: 4, fontSize: 13, fontWeight: 600,
            background: "transparent", color: dark ? "#F4F0EA" : C.accent, border: `1px solid ${dark ? "rgba(244,240,234,.3)" : C.accent + "40"}`,
            textDecoration: "none",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: dark ? "#EF4444" : C.accent, animation: "pulse 2s infinite" }} />
            {mob ? "Live" : "Live Broadcast"}
          </Link>
          {/* Desktop: Subscribe (the hero already has "Open the ledger").
              Scrolls to the newsletter form and puts the cursor in it. */}
          <Link href={mob ? "/dashboard" : "#cta"} className="vu-cta vu-cta-p"
            onClick={mob ? undefined : (e) => {
              const el = document.getElementById("cta");
              if (!el) return;
              e.preventDefault();
              el.scrollIntoView({ behavior: "smooth", block: "start" });
              const input = el.querySelector("input");
              if (input) setTimeout(() => (input as HTMLInputElement).focus({ preventScroll: true }), 600);
            }}
            style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: mob ? "8px 14px" : "10px 16px",
            borderRadius: 4, fontSize: 13, fontWeight: 500,
            background: ink, color: dark ? "#0C0A08" : C.bg, border: `1px solid ${ink}`,
            textDecoration: "none",
          }}>
            {mob ? <>Data <span className="vu-arw">→</span></> : "Subscribe"}
          </Link>
        </div>
      </div>
    </nav>
  );
}

/* ── Hero Chart Visualization ── */
function HeroViz({ mob }: { mob: boolean }) {
  const data = METRICS.gdp.d;

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.rule}`, borderRadius: 4,
      padding: mob ? 14 : 20,
      boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 12px 32px -12px rgba(0,0,0,0.08)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: mob ? 10 : 14, marginBottom: 6, borderBottom: `1px solid ${C.rule}`, gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: mob ? 12 : 13, fontFamily: SANS }}>The economy, by administration</span>
        <span style={{ fontSize: mob ? 10 : 11, color: C.mute, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>31 yrs · BEA</span>
      </div>
      <ResponsiveContainer width="100%" height={mob ? 200 : 280}>
        <BarChart data={data} margin={{ top: 10, right: mob ? 4 : 10, left: mob ? -16 : -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.rule} vertical={false} />
          <XAxis dataKey="y" fontSize={mob ? 9 : 10} fontFamily={SANS} stroke={C.mute} tick={{ fill: C.sub }} interval={mob ? 5 : 3} />
          <YAxis fontSize={mob ? 9 : 10} fontFamily={SANS} stroke={C.rule} tick={{ fill: C.sub }} tickFormatter={v => `${v}%`} />
          <Tooltip
            contentStyle={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 4, fontFamily: SANS, fontSize: 12 }}
            formatter={(v: number) => [`${v.toFixed(1)}%`, "GDP Growth"]}
            labelStyle={{ fontWeight: 700, color: C.ink }}
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
          />
          <Bar dataKey="v" radius={[2, 2, 0, 0]} animationDuration={1200}>
            {data.map((d, i) => (
              <RechartsCell key={i} fill={ADMINS[d.a]?.color || C.sub} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.rule}`, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: mob ? 10 : 11, color: C.mute, letterSpacing: "0.06em", textTransform: "uppercase", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: mob ? 8 : 14, fontSize: mob ? 9 : 11, color: C.sub, flexWrap: "wrap" }}>
          {AID.map(id => (
            <span key={id} style={{ display: "flex", alignItems: "center", gap: mob ? 4 : 6 }}>
              <i style={{ width: mob ? 8 : 10, height: mob ? 8 : 10, borderRadius: 2, display: "inline-block", background: ADMINS[id].color }} />
              {ADMINS[id].name}
            </span>
          ))}
        </div>
        <span>Source: BEA</span>
      </div>
    </div>
  );
}

/* ── Full-screen hero (desktop) ──
 * One picture, one line, two buttons. The picture is the site's own record:
 * 31 years of GDP growth, coloured by administration, drifting slowly behind
 * the headline. Stock footage would say "serious"; this says "data" before a
 * word is read, and nobody else has it. */
function DarkHero({ med }: { med: boolean }) {
  const data = METRICS.gdp.d as { y: number; v: number; a: string }[];
  const max = Math.max(...data.map(d => Math.abs(d.v)));
  return (
    <header id="top" data-dark style={{ position: "relative", minHeight: "100vh", background: "#0C0A08", color: "#FFFEFC", overflow: "hidden", display: "flex", alignItems: "center" }}>
      <style>{`
        @keyframes dhBreathe{0%,100%{transform:scaleY(.82)}50%{transform:scaleY(1)}}
        .dh-bar{animation:dhBreathe 7s ease-in-out infinite}
        @media (prefers-reduced-motion:reduce){.dh-bar{animation:none}}
        .dh-ghost{transition:background .15s,border-color .15s}
        .dh-ghost:hover{background:rgba(255,255,255,.08)!important;border-color:rgba(255,255,255,.6)!important}
      `}</style>
      {/* Background chart — decorative; the same data is charted properly below. */}
      <div aria-hidden style={{ position: "absolute", inset: "12% 3% 0", display: "flex", alignItems: "stretch", gap: "0.6%" }}>
        {data.map((d, i) => {
          const h = (Math.abs(d.v) / max) * 58;
          return (
            <div key={d.y} style={{ flex: 1, position: "relative" }}>
              <span className="dh-bar" style={{
                position: "absolute", left: 0, right: 0,
                ...(d.v >= 0 ? { bottom: "30%", height: `${h}%`, transformOrigin: "bottom" } : { top: "70%", height: `${h * 0.9}%`, transformOrigin: "top" }),
                background: ADMINS[d.a]?.color || "#555", opacity: 0.55, borderRadius: 2,
                animationDelay: `${(i % 9) * 0.6}s`,
              }} />
            </div>
          );
        })}
      </div>
      {/* Legibility: darken the band the words sit on, keep the bars alive at the edges. */}
      <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 55% at 50% 50%, rgba(12,10,8,.88) 0%, rgba(12,10,8,.55) 60%, rgba(12,10,8,.35) 100%), linear-gradient(180deg, rgba(12,10,8,.55) 0%, rgba(12,10,8,0) 30%, rgba(12,10,8,0) 70%, rgba(12,10,8,.8) 100%)" }} />

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 1180, margin: "0 auto", padding: "120px 32px 64px", textAlign: "center" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 10, padding: "6px 14px",
          border: "1px solid rgba(255,255,255,.18)", borderRadius: 999, background: "rgba(255,255,255,.04)",
          fontSize: 11, color: "#D8CFC4", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 500, marginBottom: 28,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#E0493A", boxShadow: "0 0 0 3px rgba(224,73,58,.25)" }} />
          Political &amp; economic intelligence · No spin
        </div>
        <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: med ? 64 : "clamp(64px, 7.4vw, 116px)", lineHeight: 0.98, letterSpacing: "-0.03em", margin: "0 auto", maxWidth: "12ch", textWrap: "balance" } as React.CSSProperties}>
          The economy under every president, <em style={{ fontStyle: "italic", color: "#E0493A" }}>in data.</em>
        </h1>
        <div style={{ marginTop: 40, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/dashboard" className="vu-cta" style={{
            display: "inline-flex", alignItems: "center", gap: 8, padding: "15px 26px", borderRadius: 4,
            fontSize: 15, fontWeight: 600, textDecoration: "none", background: "#FFFEFC", color: "#0C0A08",
          }}>Open the ledger <span className="vu-arw">→</span></Link>
          <a href="#method" className="dh-ghost" style={{
            display: "inline-flex", alignItems: "center", padding: "15px 22px", borderRadius: 4,
            fontSize: 15, fontWeight: 600, textDecoration: "none", color: "#FFFEFC",
            border: "1px solid rgba(255,255,255,.35)", background: "transparent",
          }}>See methodology</a>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 64, marginTop: 72 }}>
          {[{ n: 19, l: "Economic metrics" }, { n: 5, l: "Administrations" }, { n: 32, l: "Years of data", suffix: "yrs" }].map(st => (
            <div key={st.l}>
              <div style={{ fontFamily: SERIF, fontSize: 40, lineHeight: 1, letterSpacing: "-0.025em", fontVariantNumeric: "tabular-nums" }}>
                <CountUp to={st.n} />
                {st.suffix && <span style={{ color: "#A69E92" }}>{st.suffix}</span>}
                <span style={{ color: "#A69E92" }}>+</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "#A69E92", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500 }}>{st.l}</div>
            </div>
          ))}
        </div>
      </div>
      {/* Key for the background: without it the bars are decoration; with it
          they are the record — and the full-size chart below became a repeat. */}
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 22, zIndex: 1,
        display: "flex", justifyContent: "center", alignItems: "center", gap: 18, flexWrap: "wrap",
        fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8C8479",
      }}>
        <span>GDP growth, {data[0].y}–{data[data.length - 1].y}</span>
        {AID.map(id => (
          <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#BDB5A8" }}>
            <i style={{ width: 9, height: 9, borderRadius: 2, background: ADMINS[id].color, display: "inline-block" }} />
            {ADMINS[id].name}
          </span>
        ))}
        <span>Source: BEA</span>
      </div>
    </header>
  );
}

/* ── Hero ── */
function Hero({ mob, med }: { mob: boolean; med: boolean }) {
  return (
    <header style={{
      padding: mob ? "40px 0" : "56px 0 48px",
    }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: mob ? "0 20px" : "0 32px", display: "grid", gridTemplateColumns: med ? "1fr" : "1.15fr 1fr", gap: med ? 40 : 72, alignItems: "end" }}>
        <div>
          {/* Kicker */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: mob ? 8 : 12,
            padding: mob ? "6px 10px" : "6px 12px", border: `1px solid ${C.rule}`, borderRadius: 999,
            background: C.card, fontSize: mob ? 10 : 11, color: C.sub, letterSpacing: "0.08em",
            textTransform: "uppercase", fontWeight: 500, marginBottom: 24,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, boxShadow: `0 0 0 3px rgba(184,55,45,0.2)`, flexShrink: 0 }} />
            No spin · No editorial · You interpret
          </div>

          {/* Headline */}
          <h1 style={{
            fontFamily: SERIF, fontSize: mob ? 44 : (med ? 56 : 96),
            lineHeight: 0.98, letterSpacing: "-0.032em", fontWeight: 400,
          }}>
            The economy<br />under every<br />president,<br />
            <em style={{ fontStyle: "italic", color: C.accent }}>in data.</em>
          </h1>

          {/* Hero subtitle removed per design — headline + CTAs only. */}

          {/* CTA */}
          <div style={{ marginTop: 32, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <Link href="/dashboard" className="vu-cta vu-cta-p" style={{
              display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 24px",
              borderRadius: 4, fontSize: 15, fontWeight: 600, textDecoration: "none",
              background: C.ink, color: C.bg, border: `1px solid ${C.ink}`,
            }}>
              Open the ledger <span className="vu-arw">→</span>
            </Link>
            <a href="#method" className="vu-cta vu-cta-s" style={{
              display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 20px",
              borderRadius: 4, fontSize: 15, fontWeight: 600, textDecoration: "none",
              border: `1px solid ${C.rule}`, background: C.card, color: C.ink,
            }}>
              See methodology
            </a>
          </div>

          {/* Mobile: GDP-by-administration chart sits directly under the CTAs.
              On desktop this chart lives in the right column (see below). */}
          {mob && (
            <div style={{ marginTop: 28 }}>
              <HeroViz mob />
            </div>
          )}

          {/* Stats */}
          <div style={{
            display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(3, 1fr)",
            marginTop: 48, paddingTop: 28, borderTop: `1px solid ${C.rule}`, gap: mob ? 16 : 24,
          }}>
            {/* "Active conflicts tracked" removed — a defence stat sat oddly
                among three economic ones, and it was the only figure here
                nobody was maintaining.

                The rest gain a "+": these are floors, not exact counts. The
                metric count in particular moved from 14 to 20 on the
                benchmark today without anyone editing this line, which is
                precisely why a bare number here goes stale silently. */}
            {[{ n: 19, l: "Economic metrics" }, { n: 5, l: "Administrations" }, { n: 32, l: "Years of data", suffix: "yrs" }].map((s, i) => (
              <div key={i}>
                <div style={{ fontFamily: SERIF, fontSize: mob ? 28 : 40, lineHeight: 1, letterSpacing: "-0.025em", fontVariantNumeric: "tabular-nums" }}>
                  <CountUp to={s.n} />
                  {s.suffix && <span style={{ color: C.mute }}>{s.suffix}</span>}
                  <span style={{ color: C.mute }}>+</span>
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: C.sub, letterSpacing: "0.09em", textTransform: "uppercase", fontWeight: 500 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Desktop: chart in right column. Mobile renders it inside the
            left column directly under the CTAs (above). */}
        {!mob && <HeroViz mob={mob} />}
      </div>
    </header>
  );
}

/**
 * Counts a stat up when it first scrolls into view.
 *
 * Deliberately restrained: it runs ONCE, on entry, and only for figures that
 * are round headline counts. Animating a real measurement would be worse
 * than static — a number sliding past values it never held reads as data
 * changing, which on this site it must not.
 *
 * Honours prefers-reduced-motion by rendering the final value immediately.
 * An IntersectionObserver is used rather than a mount timer so the count is
 * actually seen rather than finishing above the fold before anyone scrolls.
 */
function CountUp({ to, ms = 900 }: { to: number; ms?: number }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [n, setN] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setN(to); return; }

    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting || done.current) return;
      done.current = true;
      io.disconnect();
      const t0 = performance.now();
      let raf = 0;
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / ms);
        // Ease out — fast start, settle at the end, so it reads as landing
        // on the number rather than ticking up to it.
        setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      return () => cancelAnimationFrame(raf);
    }, { threshold: 0.4 });

    io.observe(el);
    return () => io.disconnect();
  }, [to, ms]);

  // The final value is in the DOM for assistive tech and for search engines
  // regardless of whether the animation ever runs.
  return <span ref={ref} aria-label={String(to)}>{n}</span>;
}

/* ── Scorecard Heatmap ── */
function HeatCell({
  id, mk, c, mob, metricLabel, unit, flipBelow = false,
  displayMode = "per_metric", dollarMode = "real",
}: {
  id: string; mk: string; c: Cell | undefined; mob: boolean;
  metricLabel: string; unit: string; flipBelow?: boolean;
  displayMode?: DisplayMode; dollarMode?: DollarMode;
}) {
  const [hov, setHov] = useState(false);
  const admin = ADMINS[id as keyof typeof ADMINS];

  const disp = c ? resolveDisplay(c, mk, displayMode, dollarMode) : null;
  const cfgL = METRIC_DISPLAY_LANDING[mk];
  const st = disp && disp.value !== null
    ? cellColorFromMag(colorMagnitude(disp.value, disp.unit, {
        pctAvgTarget: cfgL?.pctAvgTarget,
        pctAvgRange:  cfgL?.pctAvgRange,
      }), disp.improved)
    : { bg: C.paper, text: C.mute };
  // Compact form ("+1.8 pp") for the cell; verbose form ("+1.8 percentage points")
  // for the tooltip so the abbreviation isn't unexplained on hover.
  const headline = disp ? formatDisplayedChange(disp.value, disp.unit) : "—";
  const tooltipHeadline = disp ? formatDisplayedChange(disp.value, disp.unit, true) : "—";

  // Tooltip footnote: when in per-metric mode, show the raw % for transparency
  // (so the reader can see what the alternative framing produces).
  const showRawNote = displayMode === "per_metric" && c
    && disp && disp.unit !== "pct"
    && isFinite(c.pctChange) && Math.abs(c.pctChange) < 100000;
  const rawNote = showRawNote && c
    ? `raw % change: ${c.pctChange >= 0 ? "+" : ""}${c.pctChange.toFixed(1)}%`
    : null;

  // Annualized values get a small "(real)" / "(nominal)" qualifier in the tooltip.
  const dollarQualifier = displayMode === "per_metric"
    && disp && disp.unit === "pct_yr"
    ? (dollarMode === "real" ? " (real)" : " (nominal)")
    : "";

  return (
    <Link
      href={`/dashboard?metric=${mk}`}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: "relative",
        margin: mob ? 3 : 5, height: mob ? 44 : 52, borderRadius: 3,
        display: "grid", placeItems: "center", padding: "4px 6px",
        background: st.bg, color: st.text, cursor: "pointer",
        transition: "transform 0.18s ease, box-shadow 0.18s ease",
        textDecoration: "none",
        transform: hov ? "scale(1.08)" : "scale(1)",
        boxShadow: hov ? "0 4px 20px rgba(0,0,0,0.18)" : "none",
        zIndex: hov ? 10 : 1,
      }}
    >
      {/* Design 3a (mobile): every cell carries its exact unit as a tiny
          sublabel — the ledger reads without a legend. Desktop keeps the
          inline "+1.4 pp" + range line. */}
      {mob ? (
        <span style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.15 }}>
          <span style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {disp && disp.value !== null && isFinite(disp.value)
              ? `${disp.unit === "pct_avg" ? "" : disp.value >= 0 ? "+" : ""}${disp.value.toFixed(1)}`
              : "—"}
          </span>
          <span style={{ fontFamily: SANS, fontSize: 7.5, fontWeight: 600, letterSpacing: "0.07em", opacity: 0.8, textTransform: "uppercase" }}>
            {disp
              ? (disp.unit === "pp" ? "pp"
                : disp.unit === "pct_avg" ? "% avg"
                : disp.unit === "pct_yr" ? `%/yr ${displayMode === "per_metric" && cfgL?.dollarAware ? (dollarMode === "real" ? "real" : "nom") : ""}`.trim()
                : "%")
              : ""}
          </span>
        </span>
      ) : (
        <span style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{headline}</span>
      )}
      {!mob && c && (
        <span style={{ fontSize: 9, letterSpacing: "0.04em", opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>
          {fmt(c.start, unit)} → {fmt(c.end, unit)}
        </span>
      )}
      {/* Tooltip — flips below for the top row because the scorecard container clips
          vertical overflow (overflowX:auto forces overflow-y to behave non-visibly). */}
      {hov && !mob && c && (
        <div style={{
          position: "absolute",
          ...(flipBelow
            ? { top: "calc(100% + 10px)" }
            : { bottom: "calc(100% + 10px)" }),
          left: "50%", transform: "translateX(-50%)",
          background: C.ink, color: "#fff", padding: "10px 14px", borderRadius: 6,
          fontSize: 12, lineHeight: 1.5, whiteSpace: "nowrap", pointerEvents: "none",
          boxShadow: "0 8px 30px rgba(0,0,0,0.25)", zIndex: 100,
          minWidth: 180, textAlign: "center",
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{metricLabel} under {admin.name}</div>
          <div style={{ fontVariantNumeric: "tabular-nums" }}>
            <span style={{ opacity: 0.7 }}>{fmt(c.start, unit)}</span>
            <span style={{ margin: "0 6px", opacity: 0.5 }}>→</span>
            <span>{fmt(c.end, unit)}</span>
          </div>
          <div style={{
            fontFamily: SERIF, fontSize: 16, fontWeight: 700, marginTop: 4,
            color: disp && disp.improved ? "#8ee3e6" : "#fed7aa",
          }}>{tooltipHeadline}<span style={{ fontSize: 11, fontWeight: 400, opacity: 0.7 }}>{dollarQualifier}</span></div>
          {rawNote && (
            <div style={{ fontSize: 10, opacity: 0.45, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
              {rawNote}
            </div>
          )}
          <div style={{ fontSize: 10, opacity: 0.5, marginTop: 4 }}>Click to explore →</div>
          {/* Arrow — points down at the cell when tooltip is above, up at the cell when below */}
          <div style={{
            position: "absolute",
            ...(flipBelow
              ? { top: -6, borderBottom: `6px solid ${C.ink}` }
              : { bottom: -6, borderTop: `6px solid ${C.ink}` }),
            left: "50%", transform: "translateX(-50%)",
            width: 0, height: 0,
            borderLeft: "6px solid transparent", borderRight: "6px solid transparent",
          }} />
        </div>
      )}
    </Link>
  );
}

function ScorecardSection({ mob, med }: { mob: boolean; med: boolean }) {
  const heat = useMemo(() => computeHeatmap(METRICS, AID), []);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("per_metric");
  const [dollarMode, setDollarMode] = useState<DollarMode>("real");

  return (
    <section id="scorecard" style={{ padding: mob ? "48px 0" : "72px 0", borderBottom: `1px solid ${C.rule}` }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: mob ? "0 20px" : "0 32px" }}>
        {/* Section head */}
        <div style={{ display: "grid", gridTemplateColumns: med ? "1fr" : "1fr 1.4fr", gap: med ? 16 : 64, marginBottom: 40, alignItems: "end" }}>
          <div>
            <div style={{ fontFamily: SANS, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.sub, fontWeight: 500, marginBottom: 12 }}>Section 01 · The Ledger</div>
            <h2 style={{ fontFamily: SERIF, fontSize: mob ? 32 : 44, lineHeight: 1.05, letterSpacing: "-0.022em", fontWeight: 400 }}>
              Every metric,<br />every president, <em style={{ fontStyle: "italic", color: C.accent }}>at a glance.</em>
            </h2>
          </div>
          <div>
            {/* Scorecard intro paragraph removed per design — headline only. */}
            <Link href="/dashboard" style={{
              marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8,
              fontSize: 13, color: C.accent, fontWeight: 500, textDecoration: "none",
              borderBottom: "1px solid currentColor", paddingBottom: 1,
            }}>
              Open full scorecard ↗
            </Link>
          </div>
        </div>

        {/* Heatmap */}
        {mob && (
          <div style={{ fontSize: 11, color: C.mute, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <span>←</span> Scroll to see all presidents <span>→</span>
          </div>
        )}
        <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 4, overflow: "hidden", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          {/* Display-mode toggles */}
          <div style={{
            display: "flex", justifyContent: "flex-end", alignItems: "center",
            gap: mob ? 12 : 20, padding: mob ? "10px 12px" : "10px 16px",
            background: C.paper, borderBottom: `1px solid ${C.rule}`,
            flexWrap: "wrap", minWidth: mob ? 800 : undefined,
          }}>
            <PillToggle<DisplayMode>
              label="Display"
              value={displayMode}
              onChange={setDisplayMode}
              options={[
                { value: "per_metric", label: "Per-metric" },
                { value: "raw_pct",    label: "Raw %" },
              ]}
            />
            <PillToggle<DollarMode>
              label="$ values"
              value={dollarMode}
              onChange={setDollarMode}
              disabled={displayMode === "raw_pct"}
              options={[
                { value: "real",    label: "Real" },
                { value: "nominal", label: "Nominal" },
              ]}
            />
          </div>
          {/* Design 3a (mobile): one-line "how to read" — with units on every
              cell and row label, this single line replaces legend-hunting. */}
          {mob && (
            <div style={{
              padding: "8px 12px", fontSize: 10, color: C.sub, background: C.paper,
              borderBottom: `1px solid ${C.rule}`, minWidth: 800,
              fontFamily: SANS, letterSpacing: "0.02em", lineHeight: 1.5,
            }}>
              How to read — <strong style={{ color: C.ink }}>pp</strong>: point change over the term
              {" · "}<strong style={{ color: C.ink }}>% avg</strong>: average across tenure
              {" · "}<strong style={{ color: C.ink }}>%/yr real</strong>: inflation-adjusted yearly rate
            </div>
          )}
          {/* Header row */}
          <div style={{
            display: "grid",
            gridTemplateColumns: mob ? "130px repeat(5, 1fr) minmax(80px,1fr)" : "200px repeat(5, 1fr) minmax(100px,1fr)",
            alignItems: "center", background: C.paper, borderBottom: `1px solid ${C.rule}`,
            padding: "10px 0", fontSize: 11, letterSpacing: "0.09em", textTransform: "uppercase",
            color: C.sub, fontWeight: 500, minWidth: mob ? 800 : undefined,
          }}>
            <div style={{ paddingLeft: 20 }}>Metric</div>
            {AID.map(id => {
              const a = ADMINS[id];
              return (
                <div key={id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, textAlign: "center", fontSize: 10 }}>
                  <div style={{ width: 28, height: 3, borderRadius: 2, background: a.color }} />
                  <div style={{ color: C.ink, fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em", textTransform: "none", fontFamily: SERIF }}>{a.name}</div>
                  {!mob && <div style={{ color: C.mute, letterSpacing: "0.04em", fontFamily: SANS }}>{a.full}</div>}
                </div>
              );
            })}
            {/* Trump II header */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, textAlign: "center", fontSize: 10 }}>
              <div style={{ width: 28, height: 3, borderRadius: 2, background: "#c1272d" }} />
              <div style={{ color: C.ink, fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em", textTransform: "none", fontFamily: SERIF }}>Trump II</div>
              {!mob && <div style={{ color: C.mute, letterSpacing: "0.04em", fontFamily: SANS }}>2025–</div>}
            </div>
          </div>

          {/* Data rows */}
          {METRIC_ORDER.map((mk, rowIdx) => {
            const m = METRICS[mk];
            // Top row's tooltip would otherwise be clipped by the container's overflow.
            const flipBelow = rowIdx === 0;
            return (
              <div key={mk} style={{
                display: "grid",
                gridTemplateColumns: mob ? "130px repeat(5, 1fr) minmax(80px,1fr)" : "200px repeat(5, 1fr) minmax(100px,1fr)",
                alignItems: "center", borderTop: `1px solid ${C.rule}`, fontSize: 13,
                transition: "background 0.15s", minWidth: mob ? 800 : undefined,
              }}>
                <div style={{ padding: mob ? "12px" : "14px 20px", display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 10, color: C.mute, letterSpacing: "0.08em", textTransform: "uppercase" }}>{m.cat}</span>
                  <span style={{ fontWeight: 600, color: C.ink, fontSize: 13 }}>
                    {m.l}
                    {/* Design 3a (mobile): the metric's unit rides the row
                        label too, so a row is self-describing at a glance. */}
                    {mob && (
                      <span style={{ fontSize: 9, color: C.mute, fontWeight: 500, marginLeft: 4 }}>
                        {displayMode === "raw_pct" ? "%"
                          : METRIC_DISPLAY_LANDING[mk]?.perMetricUnit === "pp" ? "pp"
                          : METRIC_DISPLAY_LANDING[mk]?.perMetricUnit === "pct_avg" ? "% avg"
                          : `%/yr ${dollarMode === "real" ? "real" : "nom"}`}
                      </span>
                    )}
                  </span>
                </div>
                {AID.map(id => (
                  <HeatCell key={id} id={id} mk={mk} c={heat[mk]?.[id]} mob={mob}
                    metricLabel={m.l} unit={m.u} flipBelow={flipBelow}
                    displayMode={displayMode} dollarMode={dollarMode} />
                ))}
                {/* Trump II — live CTA cell */}
                <Link href="/live-benchmark" style={{
                  margin: mob ? 3 : 5, height: mob ? 44 : 52, borderRadius: 3,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "4px 6px", textDecoration: "none",
                  background: `repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(193,39,45,0.04) 4px, rgba(193,39,45,0.04) 8px)`,
                  border: "1px dashed rgba(193,39,45,0.25)",
                  cursor: "pointer", transition: "all 0.18s",
                }}>
                  <span className="live-pulse" style={{
                    width: 6, height: 6, borderRadius: "50%", background: "#c1272d", flexShrink: 0,
                  }} />
                  <span style={{ fontFamily: SANS, fontSize: mob ? 10 : 11, fontWeight: 600, color: "#c1272d", letterSpacing: "0.04em" }}>
                    LIVE
                  </span>
                </Link>
              </div>
            );
          })}

          {/* Legend strip — needs the same minWidth as the rows above so when
              the user scrolls horizontally on mobile, the legend background
              extends to the right edge of the table instead of cutting off
              short and exposing whitespace beyond the visible viewport. */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 20px", background: C.paper, borderTop: `1px solid ${C.rule}`,
            fontSize: 11, color: C.sub, letterSpacing: "0.04em", flexWrap: "wrap", gap: 12,
            minWidth: mob ? 800 : undefined,
          }}>
            <span>
              {displayMode === "per_metric"
                ? <>Per-metric view: percentage-point (pp) change for rates, {dollarMode} annualized for prices/income, average for inflation.</>
                : <>Raw % change from inherited value to last year of administration.</>}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>Worsened</span>
              <div style={{ display: "flex", border: `1px solid ${C.rule}`, borderRadius: 3, overflow: "hidden" }}>
                {[0.8, 0.45, 0.2].map((a, i) => <i key={i} style={{ width: 22, height: 14, display: "inline-block", background: `rgba(194,65,12,${a})` }} />)}
                <i style={{ width: 22, height: 14, display: "inline-block", background: C.paper }} />
                {[0.2, 0.45, 0.8].map((a, i) => <i key={i} style={{ width: 22, height: 14, display: "inline-block", background: `rgba(13,115,119,${a})` }} />)}
              </div>
              <span>Improved</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* President card on Deep Dive side panel. Clicking it deep-links into the
   dashboard's Data tab, in detail mode for the current metric, with the
   clicked admin pre-selected in the side panel (?metric=<mk>&admin=<id>). */
function PresidentCard({
  id, name, full, color, metricKey, headline, improved, start, end,
}: {
  id: string; name: string; full: string; color: string;
  metricKey: string; headline: string; improved: boolean;
  start: string; end: string;
}) {
  const [hov, setHov] = useState(false);
  return (
    <Link href={`/dashboard?metric=${metricKey}&admin=${id}`}
          onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
          aria-label={`Open ${name} detail on dashboard`}
          style={{
            display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12,
            alignItems: "center", padding: "10px 12px",
            background: hov ? C.paper : C.card,
            border: `1px solid ${hov ? color : C.rule}`,
            borderRadius: 3, fontSize: 13,
            textDecoration: "none", color: "inherit",
            cursor: "pointer",
            transform: hov ? "translateX(2px)" : "translateX(0)",
            boxShadow: hov ? `0 2px 8px -2px rgba(0,0,0,0.08)` : "none",
            transition: "all 0.15s ease",
          }}>
      <div style={{ width: 6, height: 32, borderRadius: 2, background: color }} />
      <div>
        <div style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 15, letterSpacing: "-0.01em", display: "flex", alignItems: "center", gap: 6 }}>
          {name}
          <span style={{
            fontFamily: SANS, fontSize: 11, color: hov ? color : C.mute,
            transition: "all 0.15s ease",
            transform: hov ? "translateX(2px)" : "translateX(0)",
            display: "inline-block",
          }}>→</span>
        </div>
        <div style={{ fontSize: 10, color: C.mute, letterSpacing: "0.06em", textTransform: "uppercase" }}>{full}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{
          fontFamily: SERIF, fontSize: 17, fontVariantNumeric: "tabular-nums", fontWeight: 500,
          color: improved ? C.improveStrong : C.declineStrong,
        }}>
          {headline}
        </div>
        <div style={{ fontSize: 10, color: C.mute, fontVariantNumeric: "tabular-nums" }}>
          {start} → {end}
        </div>
      </div>
    </Link>
  );
}

/* ── Deep Dive ── */
function DeepDiveSection({ mob, med }: { mob: boolean; med: boolean }) {
  const [mk, setMk] = useState("gdp");
  const m = METRICS[mk];
  const heat = useMemo(() => computeHeatmap(METRICS, AID), []);

  return (
    <section id="data" style={{ padding: mob ? "48px 0" : "88px 0" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: mob ? "0 20px" : "0 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: med ? "1fr" : "1fr 1.4fr", gap: med ? 16 : 64, marginBottom: 40, alignItems: "end" }}>
          <div>
            <div style={{ fontFamily: SANS, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.sub, fontWeight: 500, marginBottom: 12 }}>Section 02 · Deep Dive</div>
            <h2 style={{ fontFamily: SERIF, fontSize: mob ? 32 : 44, lineHeight: 1.05, letterSpacing: "-0.022em", fontWeight: 400 }}>
              The long view,<br />color-coded by <em style={{ fontStyle: "italic", color: C.accent }}>who held office.</em>
            </h2>
          </div>
          {/* Deep Dive intro paragraph removed per design — headline only. */}
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 4, overflow: "hidden", display: "grid", gridTemplateColumns: med ? "1fr" : "1.2fr 1fr" }}>
          {/* Chart side */}
          <div style={{ padding: mob ? 20 : "28px 32px", borderRight: med ? "none" : `1px solid ${C.rule}`, borderBottom: med ? `1px solid ${C.rule}` : "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20 }}>
              <h3 style={{ fontFamily: SERIF, fontSize: mob ? 22 : 30, fontWeight: 400, letterSpacing: "-0.015em", lineHeight: 1.15, margin: 0 }}>
                {m.l} <em style={{ fontStyle: "italic", color: C.sub }}>({m.u})</em>
              </h3>
            </div>

            {/* Metric switch */}
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 4, padding: 6,
              background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 6,
              width: "fit-content", marginTop: 16, marginBottom: 20,
            }}>
              {METRIC_ORDER.map(k => (
                <button key={k} onClick={() => setMk(k)} className="vu-pill" style={{
                  padding: "6px 12px", fontSize: 11, letterSpacing: "0.04em", fontWeight: 500,
                  color: mk === k ? C.ink : C.sub, borderRadius: 3, border: mk === k ? `1px solid ${C.rule}` : "1px solid transparent",
                  background: mk === k ? C.card : "transparent", cursor: "pointer",
                  boxShadow: mk === k ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
                }}>
                  {METRICS[k].l}
                </button>
              ))}
              <Link href="/dashboard" className="vu-cta vu-cta-o" style={{
                padding: "6px 12px", fontSize: 11, letterSpacing: "0.04em", fontWeight: 600,
                color: C.accent, borderRadius: 3, border: `1px dashed ${C.accent}`,
                background: "transparent", cursor: "pointer", textDecoration: "none",
                display: "inline-flex", alignItems: "center", gap: 4,
              }}>
                +13 more <span className="vu-arw">→</span>
              </Link>
            </div>

            {/* Chart */}
            <ResponsiveContainer width="100%" height={mob ? 260 : 360}>
              <BarChart data={m.d} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.rule} vertical={false} />
                <XAxis dataKey="y" fontSize={10} fontFamily={SANS} stroke={C.mute} tick={{ fill: C.sub }} interval={3} />
                <YAxis fontSize={10} fontFamily={SANS} stroke={C.rule} tick={{ fill: C.sub }} tickFormatter={v => fmt(v, m.u)} />
                <Tooltip
                  contentStyle={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 4, fontFamily: SANS, fontSize: 12 }}
                  formatter={(v: number) => [fmt(v, m.u), m.l]}
                  labelStyle={{ fontWeight: 700, color: C.ink }}
                  cursor={{ fill: "rgba(0,0,0,0.04)" }}
                />
                <Bar dataKey="v" radius={[2, 2, 0, 0]} animationDuration={800}>
                  {m.d.map((d, i) => (
                    <RechartsCell key={i} fill={ADMINS[d.a]?.color || C.sub} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Side panel */}
          <div style={{ padding: mob ? 20 : "28px 32px", background: C.paper, display: "flex", flexDirection: "column", gap: 18 }}>
            <h4 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 22, letterSpacing: "-0.01em", lineHeight: 1.2, margin: 0 }}>
              By administration
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {AID.map(id => {
                const a = ADMINS[id];
                const c = heat[mk]?.[id];
                if (!c) return null;
                // Use the same per-metric framing as Section 01 (real dollars for $/idx
                // metrics). No toggle here — the deep dive is focused, the per-metric
                // unit is in the value itself ("+1.8 pp" / "+10.5%/yr" / "4.9% avg").
                const disp = resolveDisplay(c, mk, "per_metric", "real");
                const headline = formatDisplayedChange(disp.value, disp.unit);
                return (
                  <PresidentCard key={id} id={id} name={a.name} full={a.full} color={a.color}
                                 metricKey={mk} headline={headline}
                                 improved={disp.improved}
                                 start={fmt(c.start, m.u)} end={fmt(c.end, m.u)} />
                );
              })}
            </div>

            <div style={{
              fontSize: 10, color: C.mute, letterSpacing: "0.04em", lineHeight: 1.5,
              padding: "0 2px", marginTop: -6,
            }}>
              {METRIC_DISPLAY_LANDING[mk]?.perMetricUnit === "pp" && <>Showing percentage-point (pp) change across each tenure.</>}
              {METRIC_DISPLAY_LANDING[mk]?.perMetricUnit === "pct_yr" && <>Showing real annualized growth (CPI-adjusted) per year.</>}
              {METRIC_DISPLAY_LANDING[mk]?.perMetricUnit === "pct_avg" && <>Showing average annual inflation during each tenure.</>}
            </div>

            <Link href="/dashboard" className="vu-cta vu-cta-p" style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 16px", background: C.ink, color: C.bg, borderRadius: 4,
              textDecoration: "none", fontSize: 13,
            }}>
              <div>
                <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 15 }}>See all 19 metrics</div>
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>Jobs, wages, trade, debt, and more</div>
              </div>
              <span className="vu-arw" style={{ fontSize: 20, opacity: 0.7 }}>→</span>
            </Link>

            <div style={{
              padding: "14px 16px", background: C.card,
              borderLeft: `3px solid ${C.accent}`, fontSize: 11, color: C.sub, lineHeight: 1.55,
            }}>
              <strong style={{ color: C.ink, display: "block", marginBottom: 4, fontFamily: SERIF, fontWeight: 600, fontSize: 13 }}>Context matters</strong>
              Presidents inherit economic conditions and share influence with Congress, the Fed,
              and global events. Correlation ≠ causation. Use this data to inform, not to conclude.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Principles ── */
const METHOD_POINTS = [
  { n: "01", t: "Raw numbers only", p: "Straight from BEA, BLS, Census, the Fed." },
  { n: "02", t: "No verdicts, no rankings.", p: "We show what moved. The verdict is yours." },
  { n: "03", t: "Context, not commentary.", p: "Definitions and benchmarks. No op-eds." },
];

function PrinciplesSection({ mob, med }: { mob: boolean; med: boolean }) {
  const items = [
    { n: "01", t: "Raw numbers only", p: "Every value on this site comes straight from the source agency — BEA, BLS, Treasury, Census, Fed. No modeling, no seasonal adjustments of our own, no averaging across administrations.", r: "Methodology" },
    { n: "02", t: "No verdicts, no rankings.", p: "We don't pick winners. A chart shows what happened; the scorecard shows which direction the needle moved. Whether that was good or the president's doing is for you to decide.", r: "Editorial policy" },
    { n: "03", t: "Context, not commentary.", p: "Each metric comes with a definition, a benchmark from historical averages, and notes on what presidents actually influence. No op-eds, no hot takes, no guest columnists.", r: "How we write" },
  ];

  return (
    <section id="method" style={{ padding: mob ? "48px 0" : "72px 0 56px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: mob ? "0 20px" : "0 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: med ? "1fr" : "1fr 1.4fr", gap: med ? 16 : 64, marginBottom: 40, alignItems: "end" }}>
          <div>
            <div style={{ fontFamily: SANS, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.sub, fontWeight: 500, marginBottom: 12 }}>Section 01 · Principles</div>
            <h2 style={{ fontFamily: SERIF, fontSize: mob ? 32 : 44, lineHeight: 1.05, letterSpacing: "-0.022em", fontWeight: 400 }}>
              How we stay <em style={{ fontStyle: "italic", color: C.accent }}>out of the way.</em>
            </h2>
          </div>
          {/* Principles intro paragraph removed per design — headline only. */}
        </div>

        {/* Mobile: 3-up tile grid (matches the Sources section pattern) —
            number + headline only, descriptions + footer links hidden so
            three principles fit on one screen instead of three full scrolls.
            Descriptions still discoverable via the title attribute (long-
            press on touch). Desktop unchanged: full 3-up with descriptions
            and footer links. */}
        <div style={{
          display: "grid",
          gridTemplateColumns: mob ? "repeat(3, 1fr)" : (med ? "1fr" : "repeat(3, 1fr)"),
          background: C.rule, border: `1px solid ${C.rule}`, borderRadius: 4,
          overflow: "hidden", gap: 1,
        }}>
          {items.map(it => (
            <div key={it.n}
              title={mob ? `${it.t} — ${it.p}` : undefined}
              style={{
                background: C.card,
                padding: mob ? "16px 10px" : "32px 28px",
                display: "flex", flexDirection: "column",
                gap: mob ? 6 : 14,
                minWidth: 0,
              }}>
              <div style={{
                fontFamily: SERIF,
                fontSize: mob ? 24 : 36,
                fontWeight: 400, color: C.accent, letterSpacing: "-0.02em",
                lineHeight: 1, fontStyle: "italic",
              }}>{it.n}</div>
              <h3 style={{
                fontFamily: SERIF, fontWeight: 500,
                fontSize: mob ? 13 : 22,
                lineHeight: 1.2, letterSpacing: "-0.01em", margin: 0,
              }}>{it.t}</h3>
              {!mob && (
                <>
                  <p style={{ fontSize: 13, color: C.sub, lineHeight: 1.6, margin: 0 }}>{it.p}</p>
                  <div style={{
                    marginTop: "auto", paddingTop: 14, borderTop: `1px solid ${C.rule}`,
                    fontSize: 11, color: C.mute, letterSpacing: "0.08em", textTransform: "uppercase",
                  }}>{it.r} ↗</div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Sources ── */
const SOURCES = [
    { src: "BEA", d: "Bureau of Economic Analysis — GDP, trade balance, national accounts." },
    { src: "BLS", d: "Bureau of Labor Statistics — unemployment, wages, jobs, CPI." },
    { src: "Census", d: "U.S. Census Bureau — median income, poverty, demographics." },
    { src: "Treasury", d: "U.S. Treasury — federal debt, deficit, budget." },
    { src: "Federal Reserve", d: "Fed funds rate, money supply, balance sheet." },
    { src: "EIA", d: "Energy Information Administration — gasoline, energy prices." },
    { src: "CSIS", d: "Center for Strategic & International Studies — military cost estimates, defense analysis." },
    { src: "Brown Univ.", d: "Costs of War Project — total war expenditures, veteran care, conflict budgets." },
    { src: "Kiel Institute", d: "Ukraine Support Tracker — bilateral aid commitments by country." },
    { src: "CBO", d: "Congressional Budget Office — deficit projections, spending analysis." },
    { src: "S&P Global", d: "S&P 500 index, credit ratings, financial indicators." },
    { src: "CRS", d: "Congressional Research Service — supplemental appropriations, military aid reports." },
];

function SourcesSection({ mob, med }: { mob: boolean; med: boolean }) {
  const sources = SOURCES;

  return (
    <section id="sources" style={{ padding: mob ? "48px 0" : "56px 0 96px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: mob ? "0 20px" : "0 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: med ? "1fr" : "1fr 1.4fr", gap: med ? 16 : 64, marginBottom: 40, alignItems: "end" }}>
          <div>
            <div style={{ fontFamily: SANS, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.sub, fontWeight: 500, marginBottom: 12 }}>Section 02 · Sources</div>
            <h2 style={{ fontFamily: SERIF, fontSize: mob ? 32 : 44, lineHeight: 1.05, letterSpacing: "-0.022em", fontWeight: 400 }}>
              Where the <em style={{ fontStyle: "italic", color: C.accent }}>numbers come from.</em>
            </h2>
          </div>
          {/* Sources intro paragraph removed per design — headline only. */}
        </div>

        {/* Sources grid. Mobile is a 4-up compact tile layout (acronym only,
            descriptions hidden) so all 12 sources fit in 3 rows instead of 12
            and the page stops feeling endlessly scrollable. Desktop keeps the
            full layout with descriptions since there's room. The hidden
            descriptions live in `title` attributes so they're still
            discoverable via long-press on touch / hover on desktop. */}
        {/* Desktop: a clean list on hairlines rather than twelve boxed cards —
            the busiest block on the page, calmed down. */}
        <div style={{
          display: "grid",
          gridTemplateColumns: mob ? "repeat(4, 1fr)" : (med ? "repeat(2, 1fr)" : "repeat(3, 1fr)"),
          gap: mob ? 6 : "0 48px",
        }}>
          {sources.map(s => (
            <div key={s.src}
              title={mob ? s.d : undefined}
              style={{
                padding: mob ? "10px 8px" : "18px 0 20px",
                ...(mob
                  ? { background: C.card, border: `1px solid ${C.rule}`, borderRadius: 4 }
                  : { borderTop: `1px solid ${C.rule}` }),
                display: "flex", flexDirection: "column", gap: 6,
                minWidth: 0, // allow text to ellipsis inside a tight column
                textAlign: mob ? "center" : "left",
                justifyContent: mob ? "center" : "flex-start",
                alignItems: mob ? "center" : "stretch",
                minHeight: mob ? 56 : undefined,
              }}>
              <span style={{
                fontFamily: SERIF, fontWeight: 600,
                fontSize: mob ? 13 : 17,
                letterSpacing: "-0.01em",
                lineHeight: 1.15,
                whiteSpace: mob ? "normal" : "nowrap",
                overflow: "hidden", textOverflow: "ellipsis",
              }}>{s.src}</span>
              {!mob && (
                <span style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.5 }}>{s.d}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Animated Waveform ── */
/* ── Coming Soon — single card (State Atlas shipped Q2 2026) ── */
// The old white "Now in beta" card is replaced by a full-bleed device
// showcase. See components/landing/LivePromo.tsx.
function ComingSoonSection() {
  return <LivePromo />;
}

/* ── Newsletter CTA ── */
function CTASection({ mob, med }: { mob: boolean; med: boolean }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [msg, setMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source: "landing-page" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus("success");
        setMsg("You're in. First update drops next month.");
        setEmail("");
        try { window.localStorage.setItem("vu_banner_dismissed", "1"); } catch {}
      } else {
        setStatus("error");
        setMsg(data.error || "Something went wrong. Try again.");
      }
    } catch {
      setStatus("error");
      setMsg("Network error. Try again.");
    }
  };

  // Spotlight the field when someone arrives via #cta.
  //
  // The "Join our newsletter" button drops you two thirds down a long page,
  // and the form sits to the RIGHT of the headline — so the thing you came
  // for is not where your eye lands. A brief ring plus focus says "type
  // here" without a tooltip or a colour that reads as an error.
  //
  // Focus alone would be enough on desktop but does nothing visible on
  // touch, where no caret appears until you tap; the ring covers both.
  const emailRef = useRef<HTMLInputElement | null>(null);
  const [spotlight, setSpotlight] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || window.location.hash !== "#cta") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // Wait for the browser's own anchor scroll to settle, or the ring
    // appears while the page is still flying past it.
    const on = setTimeout(() => {
      setSpotlight(true);
      // Don't steal focus on touch: it summons the keyboard over the page
      // the moment someone lands, which is hostile.
      if (!reduce && window.matchMedia?.("(hover: hover)").matches) {
        emailRef.current?.focus({ preventScroll: true });
      }
    }, 600);
    const off = setTimeout(() => setSpotlight(false), 4000);
    return () => { clearTimeout(on); clearTimeout(off); };
  }, []);

  return (
    <section id="cta" style={{
      // Anchor target for the "Join our newsletter" button in the /live nav.
      // scrollMarginTop keeps the headline clear of the sticky header on
      // arrival — without it the anchor lands with the form under the nav.
      scrollMarginTop: 72,
      padding: mob ? "48px 0" : "112px 0 88px",
    }}>
      <div style={{
        maxWidth: 1280, margin: "0 auto", padding: mob ? "0 20px" : "0 32px",
        display: "grid", gridTemplateColumns: med ? "1fr" : "1fr 1fr", gap: med ? 28 : 72, alignItems: "center",
      }}>
        <div>
          <div style={{ fontFamily: SANS, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#A69E92", fontWeight: 500, marginBottom: 16 }}>Monthly dispatch</div>
          <h2 style={{ fontFamily: SERIF, fontSize: mob ? 32 : 52, lineHeight: 1.02, letterSpacing: "-0.024em", fontWeight: 400, margin: 0, color: "#FFFEFC" }}>
            One email a month.<br />The ledger, <em style={{ fontStyle: "italic", color: "#E0493A" }}>updated.</em>
          </h2>
          <p style={{ marginTop: 16, color: "#A69E92", fontSize: 16, maxWidth: "44ch", lineHeight: 1.5 }}>
            New data lands, old data gets revised, and we flag the ones that changed most.
            No campaign coverage. No horse race. Just the numbers.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 480 }}>
          {status === "success" ? (
            <div style={{
              padding: "20px 24px", background: "#1A1613", border: "1px solid #0E7477",
              borderRadius: 4, fontFamily: SANS, fontSize: 15, color: "#2BA5A0", fontWeight: 600,
            }}>
              {msg}
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, flexDirection: mob ? "column" : "row" }}>
                <input
                  ref={emailRef}
                  type="email" placeholder="name@domain.com" required value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={{
                    flex: 1, padding: "14px 18px", font: "inherit", fontSize: mob ? 16 : 17,
                    border: `1px solid ${spotlight ? "#E0493A" : "#3A332D"}`, borderRadius: 4,
                    background: "#1A1613", color: "#FFFEFC", colorScheme: "dark",
                    // A ring rather than a colour swap: the field keeps its
                    // normal appearance, so nothing looks like an error state.
                    boxShadow: spotlight ? `0 0 0 4px ${C.accent}22` : "none",
                    transition: "box-shadow .25s ease, border-color .25s ease",
                  }}
                />
                <button type="submit" disabled={status === "loading"} className="vu-cta" style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "14px 24px", borderRadius: 4, fontSize: 15, fontWeight: 600,
                  background: "#FFFEFC", color: "#0C0A08", border: "1px solid #FFFEFC",
                  cursor: status === "loading" ? "wait" : "pointer", opacity: status === "loading" ? 0.7 : 1,
                }}>
                  {status === "loading" ? "..." : <>Subscribe <span className="vu-arw">→</span></>}
                </button>
              </div>
              {status === "error" && <div style={{ fontSize: 13, color: C.declineStrong }}>{msg}</div>}
              <div style={{ fontSize: 11, color: "#8C8479", letterSpacing: "0.04em" }}>
                Join the community
              </div>
            </>
          )}
        </form>
      </div>
    </section>
  );
}

/* ── Footer ── */
function Footer({ mob, med }: { mob: boolean; med: boolean }) {
  return (
    <footer>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: mob ? "0 20px" : "0 32px" }}>
        <div style={{
          padding: "48px 0 24px",
          display: "grid", gridTemplateColumns: mob ? "1fr" : (med ? "1fr 1fr" : "1.5fr 1fr 1fr 1fr"),
          gap: mob ? 28 : 48, fontSize: 13,
        }}>
          {/* Brand col */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: SERIF, fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>
              <CheetahMark height={22} ink="#F4F0EA" accent="#E0493A" />
              <span style={{ color: "#F4F0EA" }}>Vote <em style={{ fontStyle: "italic", color: "#E0493A", fontWeight: 500 }}>Unbiased</em></span>
            </div>
            <p style={{ color: "#A69E92", marginTop: 12, maxWidth: "38ch", fontSize: 13, lineHeight: 1.55 }}>
              An independent, non-partisan data project. No advertisers, no political action
              committee, no affiliation with any campaign or party.
            </p>
          </div>

          {/* Link cols */}
          {[
            { h: "Data", links: [{ l: "Dashboard", href: "/dashboard" }, { l: "Live benchmark", href: "/live-benchmark" }, { l: "Scorecard", href: "/dashboard" }] },
            { h: "About", links: [{ l: "Methodology", href: "#method" }, { l: "Sources", href: "#sources" }] },
            { h: "Stay in touch", links: [{ l: "Newsletter", href: "#cta" }] },
          ].map(col => (
            <div key={col.h}>
              <h4 style={{ fontSize: 11, color: "#8C8479", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 500, marginBottom: 14 }}>{col.h}</h4>
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 8, color: "#D8CFC4", padding: 0, margin: 0 }}>
                {col.links.map(l => <li key={l.l}><a href={l.href} style={{ color: "inherit", textDecoration: "none", transition: "color 0.15s" }}>{l.l}</a></li>)}
              </ul>
            </div>
          ))}
        </div>

        <div style={{
          borderTop: "1px solid rgba(255,255,255,.1)", marginTop: 48, padding: "20px 0 28px",
          display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
          fontSize: 11, color: "#8C8479", letterSpacing: "0.06em", textTransform: "uppercase",
        }}>
          <span>© 2026 Vote Unbiased · voteunbiased.org</span>
          <span>No spin · No editorial · You interpret</span>
        </div>
      </div>
    </footer>
  );
}

/* ═══════════════════════════════════════════════
   APP
═══════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════
   MOBILE LANDING — design 3a "One-Screen Ledger" (handoff v2)
   Compressed mobile-first landing (~4 screens). v2 changes: LIVE data
   ticker under the nav (bound to /api/benchmark-data), chart panel
   ABOVE the table (the table drives it), legend as table footer,
   trust strip cut, rows (not cells) select on mobile.
   Desktop rendering untouched (LandingPage branches on `mob`).
═══════════════════════════════════════════════ */

const M_UNIT_TAG: Record<string, string> = { pp: "pp", pct_avg: "% avg", pct_yr: "%/yr real" };
const M_FOOTNOTE: Record<string, string> = {
  pp: "Percentage-point change: inherited value → last full year in office.",
  pct_avg: "Average annual rate across the years of each tenure.",
  pct_yr: "Annualized yearly growth, CPI-adjusted (real). Tap any row below.",
};
const TERM_STARTS: { y: number; idx: number; a: string }[] = [
  { y: 1993, idx: 0, a: "clinton" }, { y: 2001, idx: 8, a: "bush" },
  { y: 2009, idx: 16, a: "obama" }, { y: 2017, idx: 24, a: "trump1" },
  { y: 2021, idx: 28, a: "biden" },
];

/* ── LIVE data ticker ─────────────────────────────
   Marquee of the latest official prints, bound to the existing
   /api/benchmark-data FRED pipeline (same freshness pattern as
   InsightsStrip: fetch after paint, static snapshot fallback, per-item
   as-of stamps). Never hardcoded — the fallback only bridges the fetch. */
interface TapeItem { label: string; val: string; delta: string; deltaColor: string; asOf: string }

const TAPE_FALLBACK: TapeItem[] = [
  { label: "UNEMPLOYMENT", val: "4.2%", delta: "−0.1 pp", deltaColor: "#0d7377", asOf: "JUN ’26" },
  { label: "INFLATION · CPI YOY", val: "4.2%", delta: "+0.4 m/m", deltaColor: "#c2410c", asOf: "JUN ’26" },
  { label: "PAYROLLS", val: "+57K", delta: "−72K prior", deltaColor: "#c2410c", asOf: "JUN ’26" },
  { label: "FED FUNDS", val: "3.63%", delta: "hold", deltaColor: "#9a9490", asOf: "JUN ’26" },
  { label: "GAS", val: "$3.90", delta: "−$0.43", deltaColor: "#0d7377", asOf: "JUN ’26" },
];

function tapeAsOf(monthIdx: number): string {
  // Trump II months are calendar months since inauguration (Jan 2025).
  const d = new Date(Date.UTC(2025, 0, 15));
  d.setUTCMonth(d.getUTCMonth() + monthIdx);
  return `${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase()} ’${String(d.getUTCFullYear()).slice(2)}`;
}

function MobileTicker() {
  const [tape, setTape] = useState<TapeItem[]>(TAPE_FALLBACK);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/benchmark-data")
      .then(r => r.json())
      .then(d => {
        if (cancelled || !d?.metrics) return;
        const pick = (k: string) => {
          const m = d.metrics[k];
          const t2 = m?.series?.find((s: { id: string }) => s.id === "trump2")?.data;
          if (!t2 || t2.length < 2) return null;
          const sorted = [...t2].sort((a: { month: number }, b: { month: number }) => a.month - b.month);
          return { last: sorted[sorted.length - 1], prev: sorted[sorted.length - 2], lower: !!m.lowerBetter };
        };
        const col = (delta: number, lower: boolean) =>
          Math.abs(delta) < 1e-9 ? "#9a9490" : (delta < 0) === lower ? "#0d7377" : "#c2410c";
        const sgn = (v: number) => (v >= 0 ? "+" : "−");
        const items: TapeItem[] = [];

        const u = pick("unemployment");
        if (u) {
          const dl = u.last.value - u.prev.value;
          items.push({ label: "UNEMPLOYMENT", val: `${u.last.value.toFixed(1)}%`, delta: `${sgn(dl)}${Math.abs(dl).toFixed(1)} pp`, deltaColor: col(dl, true), asOf: tapeAsOf(u.last.month) });
        }
        const inf = pick("inflation");
        if (inf) {
          const dl = inf.last.value - inf.prev.value;
          items.push({ label: "INFLATION · CPI YOY", val: `${inf.last.value.toFixed(1)}%`, delta: `${sgn(dl)}${Math.abs(dl).toFixed(1)} m/m`, deltaColor: col(dl, true), asOf: tapeAsOf(inf.last.month) });
        }
        const j = pick("jobs");
        if (j) {
          const dl = j.last.value - j.prev.value;
          items.push({ label: "PAYROLLS", val: `${sgn(j.last.value)}${Math.abs(Math.round(j.last.value))}K`, delta: `${sgn(dl)}${Math.abs(Math.round(dl))}K prior`, deltaColor: col(dl, false), asOf: tapeAsOf(j.last.month) });
        }
        const f = pick("fed_rate");
        if (f) {
          const dl = f.last.value - f.prev.value;
          items.push({ label: "FED FUNDS", val: `${f.last.value.toFixed(2)}%`, delta: Math.abs(dl) < 1e-9 ? "hold" : `${sgn(dl)}${Math.abs(dl).toFixed(2)} pp`, deltaColor: col(dl, true), asOf: tapeAsOf(f.last.month) });
        }
        const g = pick("gas");
        if (g) {
          const dl = g.last.value - g.prev.value;
          items.push({ label: "GAS", val: `$${g.last.value.toFixed(2)}`, delta: `${sgn(dl)}$${Math.abs(dl).toFixed(2)}`, deltaColor: col(dl, true), asOf: tapeAsOf(g.last.month) });
        }
        if (items.length >= 3) setTape(items);
      })
      .catch(() => { /* fallback tape stays */ });
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ margin: "-20px -20px 16px", position: "relative", overflow: "hidden", background: "#fff", borderBottom: `1px solid ${C.rule}` }}>
      <div className="vu-marquee" style={{ display: "flex", width: "max-content", animation: "vuMarquee 32s linear infinite" }}>
        {[...tape, ...tape].map((t, i) => (
          <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "8px 13px", whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 8.5, color: C.mute, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>{t.label}</span>
            <span style={{ fontFamily: SERIF, fontSize: 12.5, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{t.val}</span>
            <span style={{ fontSize: 9.5, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: t.deltaColor }}>{t.delta}</span>
            <span style={{ fontSize: 7.5, color: "#c9c4bc", letterSpacing: "0.06em", fontWeight: 600 }}>{t.asOf}</span>
          </div>
        ))}
      </div>
      {/* pinned LIVE badge, left */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, display: "flex", alignItems: "center", gap: 4,
        padding: "0 20px 0 12px", background: "linear-gradient(90deg,#fff 0,#fff calc(100% - 14px),rgba(255,255,255,0))",
      }}>
        {/* "LATEST", not "LIVE": on this page LIVE means the broadcast band
            just below. Solid background up to the badge's edge so the
            scrolling figures can't show through it. */}
        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", color: C.sub, border: `1px solid ${C.rule}`, borderRadius: 3, padding: "2px 5px", lineHeight: 1 }}>LATEST</span>
      </div>
      {/* right fade */}
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 24, background: "linear-gradient(270deg,#fff,transparent)" }} />
    </div>
  );
}

function MobileLanding() {
  const [openSource, setOpenSource] = useState<string | null>(null);
  // The sticky "Open the ledger" bar steps aside while the dark Live band is
  // on screen — sitting at the bottom of the viewport, it landed right on the
  // band's headline.
  const liveBandRef = useRef<HTMLDivElement>(null);
  const [bandInView, setBandInView] = useState(false);
  useEffect(() => {
    const el = liveBandRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setBandInView(e.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const heat = useMemo(() => computeHeatmap(METRICS, AID), []);
  const [selectedMetric, setSelectedMetric] = useState<string>("gdp");

  const [email, setEmail] = useState("");
  const [nlStatus, setNlStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const subscribe = async () => {
    if (!email.trim() || nlStatus === "loading") return;
    setNlStatus("loading");
    try {
      const r = await fetch("/api/subscribe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source: "mobile-landing" }),
      });
      setNlStatus(r.ok ? "ok" : "err");
    } catch { setNlStatus("err"); }
  };

  const m = METRICS[selectedMetric];
  const cfg = METRIC_DISPLAY_LANDING[selectedMetric];
  const unitTag = M_UNIT_TAG[cfg?.perMetricUnit || "pp"] || "pp";
  const series = m.d;
  const lo = Math.min(0, ...series.map(p => p.v));
  const hi = Math.max(...series.map(p => p.v));
  const span = hi - lo || 1;
  const zeroTopPct = (hi / span) * 100;

  return (
    <div>
      <style>{`
        @keyframes vuMarquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        .vu-marquee:hover, .vu-marquee:active { animation-play-state: paused !important; }

      `}</style>

      {/* Tiles, as on desktop: colour blocks divide the page, not rules. */}
      <div style={{ display: "flex", flexDirection: "column", gap: TILE_GAP ? 10 : 0, background: PAGE_BG }}>
      <Tile mob style={{ paddingBottom: 18 }}>
      {/* ── 2+3. Ticker (full-bleed) + compact hero ── */}
      <div style={{ padding: "20px 20px 6px" }}>
        <MobileTicker />
        <h1 style={{
          fontFamily: SERIF, fontSize: 31, lineHeight: 1.02, letterSpacing: "-0.028em",
          fontWeight: 400, margin: 0,
        }}>
          The economy under every president, <em style={{ fontStyle: "italic", color: C.accent }}>in data.</em>
        </h1>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <Link href="/dashboard" style={{
            background: C.ink, color: "#f8f5f0", fontSize: 12.5, fontWeight: 500,
            padding: "10px 15px", borderRadius: 4, textDecoration: "none",
          }}>
            See all 19 metrics →
          </Link>
          {/* Was a link to /dashboard — "Methodology" landed people on the
              data. It now jumps to the methodology section on this page. */}
          <a href="#method" style={{
            background: "#fff", border: `1px solid ${C.rule}`, color: C.ink,
            fontSize: 12.5, fontWeight: 500, padding: "10px 13px", borderRadius: 4, textDecoration: "none",
          }}>
            Methodology
          </a>
        </div>
      </div>

      {/* Trends feed lives at /trends — homepage strip removed per design. */}

      {/* ── 4. Metric chart panel (ABOVE the table; table drives it) ── */}
      <div style={{ background: "#fbfaf6", border: `1px solid ${C.rule}`, borderRadius: 6, margin: "16px 14px 0", padding: "12px 12px 10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
          <span style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 500 }}>{m.l} · {unitTag}</span>
          <span style={{ fontSize: 8.5, textTransform: "uppercase", color: C.mute, letterSpacing: "0.05em" }}>{m.cat} · ’93–’24</span>
        </div>
        <div style={{ position: "relative", height: 102, background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 4, overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: `${zeroTopPct}%`, borderTop: "1px dashed #d4cfc5" }} />
          {series.map((p, i) => {
            const isPos = p.v >= 0;
            const topPct = isPos ? ((hi - p.v) / span) * 100 : zeroTopPct;
            const hPct = (Math.abs(p.v) / span) * 100;
            return (
              <div key={p.y} style={{
                position: "absolute",
                left: `${i * 3.06 + 1}%`, width: "2.5%",
                top: `${topPct}%`, height: `max(${hPct}%, 2px)`,
                background: ADMINS[p.a]?.color || C.mute, borderRadius: 1,
                transition: "top .5s ease, height .5s ease, background .5s ease",
              }} />
            );
          })}
        </div>
        <div style={{ position: "relative", height: 14, marginTop: 3 }}>
          {TERM_STARTS.map(t => (
            <span key={t.y} style={{
              position: "absolute", left: `${t.idx * 3.06 + 1}%`,
              fontSize: 8.5, fontWeight: 600, color: ADMINS[t.a].color,
            }}>’{String(t.y).slice(2)}</span>
          ))}
        </div>
        <div style={{ fontSize: 9.5, color: C.mute, marginTop: 4, lineHeight: 1.5 }}>
          {M_FOOTNOTE[cfg?.perMetricUnit || "pp"]}
        </div>
      </div>

      </Tile>
      {/* ── 4b. Live Broadcast showcase (full-bleed). Moved up from below the
          table: at phone length the table is several screens, and most
          visitors never scrolled past it to the product's newest feature. ── */}
      <div ref={liveBandRef}><Tile mob dark><LivePromo /></Tile></div>
      <Tile mob style={{ paddingBottom: 18 }}>
      {/* ── 5. The ledger table ── */}
      <div style={{ background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 6, margin: "16px 14px 0", overflow: "hidden" }}>
        {/* 5.1 header */}
        <div style={{
          background: C.paper, padding: "11px 12px 9px", borderBottom: `1px solid ${C.rule}`,
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
        }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Tap any metric below</span>
          <span style={{ fontSize: 9, textTransform: "uppercase", color: C.mute, letterSpacing: "0.06em" }}>’93–’24 + live</span>
        </div>

        {/* 5.2 column header */}
        <div style={{ display: "grid", gridTemplateColumns: "90px repeat(6, 1fr)", padding: "7px 4px 6px", borderBottom: `1px solid ${C.rule}` }}>
          <div />
          {[...AID, "trump2"].map(id => {
            const a = id === "trump2" ? { name: "Trump II", color: "#c1272d" } : ADMINS[id];
            return (
              <div key={id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                <span style={{ width: 18, height: 3, borderRadius: 2, background: a.color }} />
                <span style={{ fontSize: 9, fontWeight: 600 }}>{a.name}</span>
              </div>
            );
          })}
        </div>

        {/* 5.3 metric rows — whole row selects the chart (mobile semantics) */}
        {METRIC_ORDER.map(mk => {
          const mm = METRICS[mk];
          const sel = selectedMetric === mk;
          const rowCfg = METRIC_DISPLAY_LANDING[mk];
          const rowUnit = M_UNIT_TAG[rowCfg?.perMetricUnit || "pp"] || "pp";
          return (
            <div key={mk}
              onClick={() => setSelectedMetric(mk)}
              style={{
                display: "grid", gridTemplateColumns: "90px repeat(6, 1fr)",
                borderBottom: "1px solid #efece6", cursor: "pointer",
                background: sel ? C.paper : "#fff",
                borderLeft: sel ? `3px solid ${C.accent}` : "3px solid transparent",
                transition: "background .15s, border-color .15s",
              }}>
              <div style={{ padding: "7px 8px 7px 9px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 1 }}>
                <span style={{ fontSize: 7.5, textTransform: "uppercase", color: C.mute, letterSpacing: "0.05em" }}>{mm.cat}</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, lineHeight: 1.15 }}>{mm.l}</span>
              </div>
              {AID.map(id => {
                const c = heat[mk]?.[id];
                const disp = c ? resolveDisplay(c, mk, "per_metric", "real") : null;
                const st = disp && disp.value !== null
                  ? cellColorFromMag(colorMagnitude(disp.value, disp.unit, {
                      pctAvgTarget: rowCfg?.pctAvgTarget, pctAvgRange: rowCfg?.pctAvgRange,
                    }), disp.improved)
                  : { bg: C.paper, text: C.mute };
                const val = disp && disp.value !== null && isFinite(disp.value)
                  ? `${disp.unit === "pct_avg" ? "" : disp.value >= 0 ? "+" : ""}${disp.value.toFixed(1)}`
                  : "—";
                return (
                  <div key={id} style={{
                    margin: 2, height: 42, borderRadius: 3,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
                    background: st.bg, color: st.text,
                  }}>
                    <span style={{ fontFamily: SERIF, fontSize: 11.5, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{val}</span>
                    <span style={{ fontSize: 6.5, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.85 }}>{rowUnit}</span>
                  </div>
                );
              })}
              <Link href="/live-benchmark" onClick={e => e.stopPropagation()} style={{
                margin: 2, height: 42, borderRadius: 3, textDecoration: "none",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                border: "1px dashed rgba(193,39,45,.3)",
                background: "repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(193,39,45,.05) 4px, rgba(193,39,45,.05) 8px)",
              }}>
                <span className="live-pulse" style={{ width: 5, height: 5, borderRadius: "50%", background: "#c1272d" }} />
                <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: "0.08em", color: "#c1272d" }}>LIVE</span>
              </Link>
            </div>
          );
        })}

        {/* 5.4 "See all" row */}
        <div style={{ textAlign: "center", padding: "10px 12px", background: "#fff", borderBottom: `1px solid ${C.rule}` }}>
          <Link href="/dashboard" style={{
            fontSize: 11, fontWeight: 600, color: C.accent, textDecoration: "none",
            borderBottom: "1px solid currentColor", paddingBottom: 1,
          }}>
            See all 19 metrics in the ledger →
          </Link>
        </div>

        {/* 5.5 Legend strip (table footer) */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          fontSize: 9, color: C.sub, background: C.paper, padding: "9px 12px",
        }}>
          Worsened
          <span style={{ display: "inline-flex", border: `1px solid ${C.rule}`, borderRadius: 2, overflow: "hidden" }}>
            {[
              "rgba(194,65,12,.8)", "rgba(194,65,12,.45)", "rgba(194,65,12,.2)",
              C.paper,
              "rgba(13,115,119,.2)", "rgba(13,115,119,.45)", "rgba(13,115,119,.8)",
            ].map((bg, i) => <span key={i} style={{ width: 16, height: 10, background: bg }} />)}
          </span>
          Improved
        </div>
      </div>

      </Tile>
      <Tile mob style={{ padding: "4px 0 18px", background: LAYOUT === "cards" ? "#ffffff" : undefined }}>
      {/* ── 5c. Methodology (target of the hero's Methodology button) ── */}
      <div id="method" style={{ margin: "14px 14px 0", scrollMarginTop: 80 }}>
        <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.12em", color: C.sub, marginBottom: 8, fontWeight: 500 }}>
          Methodology · how we stay out of the way
        </div>
        <div style={{ background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 6 }}>
          {METHOD_POINTS.map((m, i) => (
            <div key={m.n} style={{ display: "flex", gap: 12, padding: "10px 13px", borderTop: i ? `1px solid ${C.rule}` : "none" }}>
              <span style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 18, color: C.accent, lineHeight: 1.1, flexShrink: 0 }}>{m.n}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontFamily: SERIF, fontSize: 14.5, fontWeight: 600, color: C.ink }}>{m.t}</span>
                <span style={{ display: "block", fontSize: "clamp(10.5px, 3.2vw, 12px)", color: C.sub, lineHeight: 1.4, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.p}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── 6. Sources tile grid ── */}
      <div style={{ margin: "14px 14px 0" }}>
        <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.12em", color: C.sub, marginBottom: 8, fontWeight: 500 }}>
          Where the numbers come from
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
          {/* Tap, not long-press: the description used to live in a title
              tooltip, which phones never show. */}
          {SOURCES.map(s => {
            const on = openSource === s.src;
            return (
              <button key={s.src} type="button" aria-expanded={on}
                onClick={() => setOpenSource(on ? null : s.src)} style={{
                minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center",
                background: on ? C.ink : "#fff", color: on ? "#f8f5f0" : C.ink,
                border: `1px solid ${on ? C.ink : C.rule}`, borderRadius: 4, cursor: "pointer",
                fontFamily: SERIF, fontSize: 12, fontWeight: 600, lineHeight: 1.15,
                textAlign: "center", padding: "4px 3px", transition: "background .15s, color .15s",
              }}>{s.src}</button>
            );
          })}
        </div>
        {(() => {
          const sel = SOURCES.find(x => x.src === openSource);
          return sel ? (
            <div role="status" style={{
              marginTop: 8, padding: "9px 11px", background: "#fff", border: `1px solid ${C.rule}`,
              borderLeft: `3px solid ${C.accent}`, borderRadius: 4, fontSize: 11.5, lineHeight: 1.45, color: C.sub,
            }}>{sel.d}</div>
          ) : (
            <div style={{ fontSize: 9, color: C.mute, textAlign: "center", marginTop: 6 }}>
              Tap a tile for what it covers.
            </div>
          );
        })()}
      </div>

      </Tile>
      <Tile mob style={{ padding: "2px 0 18px" }}>
      {/* ── 7. Newsletter (compact) ── */}
      <div style={{ background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 6, margin: "16px 14px 0", padding: 14 }}>
        <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.08em", color: C.sub, marginBottom: 8, fontWeight: 500 }}>
          Join the community
        </div>
        {nlStatus === "ok" ? (
          <div style={{ fontSize: 12.5, color: "#0d7377", fontWeight: 500 }}>You’re in. First update drops next month.</div>
        ) : (
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") subscribe(); }}
              placeholder="you@example.com"
              style={{
                flex: 1, padding: "10px 12px", border: `1px solid ${C.rule}`, borderRadius: 4,
                background: "#fbfaf6", fontSize: 16, /* ≥16px: prevents iOS focus-zoom */
                fontFamily: SANS, color: C.ink, outline: "none", minWidth: 0,
              }}
            />
            <button onClick={subscribe} disabled={nlStatus === "loading"} style={{
              background: C.ink, color: "#f8f5f0", border: "none", borderRadius: 4,
              padding: "10px 14px", fontSize: 12.5, fontWeight: 500, fontFamily: SANS,
              cursor: "pointer", opacity: nlStatus === "loading" ? 0.6 : 1,
            }}>
              {nlStatus === "loading" ? "…" : "Subscribe"}
            </button>
          </div>
        )}
        {nlStatus === "err" && <div style={{ fontSize: 10.5, color: C.accent, marginTop: 6 }}>Something went wrong — try again.</div>}
      </div>

      {/* ── 8. Footer line ── */}
      <div style={{ fontSize: 9, textTransform: "uppercase", color: C.mute, textAlign: "center", padding: "14px 0 6px", letterSpacing: "0.06em" }}>
        © 2026 Vote Unbiased · No spin · You interpret
      </div>

      </Tile>
      </div>

      {/* ── 9. Sticky bottom CTA (hidden while the Live band is in view) ── */}
      <div aria-hidden={bandInView} style={{
        position: "sticky", bottom: 0, zIndex: 20, padding: "12px 16px 16px",
        opacity: bandInView ? 0 : 1, transform: bandInView ? "translateY(16px)" : "none",
        pointerEvents: bandInView ? "none" : "auto", transition: "opacity .2s ease, transform .2s ease",
        background: "linear-gradient(180deg, rgba(248,245,240,0) 0%, #f8f5f0 42%)",
      }}>
        <Link href="/dashboard" tabIndex={bandInView ? -1 : 0} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: C.ink, borderRadius: 6, padding: "13px 16px", textDecoration: "none",
          boxShadow: "0 10px 26px -10px rgba(0,0,0,.4)",
        }}>
          <span>
            <span style={{ display: "block", fontFamily: SERIF, fontSize: 15, fontWeight: 600, color: "#f8f5f0" }}>Open the ledger</span>
            <span style={{ display: "block", fontSize: 10.5, color: "rgba(248,245,240,.6)", marginTop: 1 }}>
              19 metrics · 5 administrations · sources cited
            </span>
          </span>
          <span style={{ fontSize: 18, color: "#f8f5f0" }}>→</span>
        </Link>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const mob = useIsMobile();
  const med = useMedium();
  // Nav is smoked-glass while it floats over the dark hero, cream after.
  const [overHero, setOverHero] = useState(true);
  useEffect(() => {
    // Dark whenever the panel sits over any dark band (hero, Live, closing),
    // not only the hero — over the Live band the cream panel read as grey.
    const on = () => {
      const y = NAV_H / 2 + 6;
      setOverHero([...document.querySelectorAll("[data-dark]")].some(el => {
        const r = el.getBoundingClientRect(); return r.top <= y && r.bottom >= y;
      }));
    };
    on(); window.addEventListener("scroll", on, { passive: true }); window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); };
  }, []);

  // Design 3a "One-Screen Ledger": on mobile, the entire page is the
  // compressed MobileLanding above. Desktop keeps the existing sections.
  if (mob) {
    return (
      <div style={{ background: PAGE_BG, color: C.ink, fontFamily: SANS, fontSize: 15, lineHeight: 1.5, minHeight: "100vh" }}>
        <Nav mob={mob} />
        <MobileLanding />
      </div>
    );
  }

  return (
    <div style={{ background: PAGE_BG, color: C.ink, fontFamily: SANS, fontSize: 15, lineHeight: 1.5, minHeight: "100vh" }}>
      <Nav mob={mob} dark={overHero} overlay />
      <div style={{ display: "flex", flexDirection: "column", gap: TILE_GAP, background: PAGE_BG, paddingTop: LAYOUT === "cards" ? 8 : 0 }}>
      <DarkHero med={med} />
      {/* Room before the dark band: a hard colour cut only reads as
          deliberate when the section before it has space to finish. */}
      <Tile mob={mob} style={{ paddingBottom: mob ? 56 : 40 }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: mob ? "0 20px" : "0 32px" }}>
          <InsightsStrip mob={mob} limit={3} eyebrow="What's notable right now" />
        </div>
      </Tile>
      <Tile mob={mob} dark><ComingSoonSection /></Tile>
      <Tile mob={mob}><PrinciplesSection mob={mob} med={med} /></Tile>
      <Tile mob={mob}><SourcesSection mob={mob} med={med} /></Tile>
      {/* Closing band: newsletter + footer on near-black, bookending the
          hero — dark · light · dark · light · dark down the page. */}
      <div data-dark style={{ background: "#0C0A08", color: "#F4F0EA" }}>
        <CTASection mob={mob} med={med} />
        <Footer mob={mob} med={med} />
      </div>
      </div>
    </div>
  );
}
