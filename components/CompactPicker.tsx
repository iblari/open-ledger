"use client";
import { useEffect, useState } from "react";

/* ── Types ── */
export type PickerOption = {
  value: string;
  label: string;
  category?: string;
};

type CompactPickerProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  options: PickerOption[];
  value: string;
  onSelect: (value: string) => void;
};

/* ── Breakpoint hook (matches existing useIsMobile across the site) ── */
function useIsMobile() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w < 768;
}

/* ── Tokens ── */
const T = {
  bg: "#f8f5f0",
  card: "#ffffff",
  ink: "#1a1a1a",
  sub: "#5c5856",
  mute: "#9a9490",
  rule: "#e2ded6",
  accent: "#b8372d",
  handle: "#d4cfc5",
};

/* ── Component ── */
export default function CompactPicker({
  open,
  onClose,
  title = "Select",
  options,
  value,
  onSelect,
}: CompactPickerProps) {
  const mob = useIsMobile();

  // Escape key closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Group options by category, preserving insertion order
  const groups: { category: string | null; items: PickerOption[] }[] = [];
  const seen = new Map<string | null, number>();
  for (const opt of options) {
    const cat = opt.category ?? null;
    if (seen.has(cat)) {
      groups[seen.get(cat)!].items.push(opt);
    } else {
      seen.set(cat, groups.length);
      groups.push({ category: cat, items: [opt] });
    }
  }

  const handleSelect = (v: string) => {
    onSelect(v);
    onClose();
  };

  // ── Shared list content ──
  const listContent = (
    <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "4px 0" }}>
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.category && (
            <div style={{
              padding: "6px 14px 2px",
              fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
              color: T.mute, textTransform: "uppercase",
              fontFamily: "'DM Sans',sans-serif",
            }}>{g.category}</div>
          )}
          {g.items.map((opt) => {
            const sel = opt.value === value;
            return (
              <button
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: sel ? "9px 14px 9px 11px" : "9px 14px",
                  fontSize: 13, fontWeight: sel ? 700 : 500,
                  color: sel ? T.accent : T.ink,
                  background: sel ? `${T.accent}0F` : "transparent",
                  borderLeft: sel ? `3px solid ${T.accent}` : "3px solid transparent",
                  border: "none", borderLeftStyle: "solid", borderLeftWidth: 3,
                  borderLeftColor: sel ? T.accent : "transparent",
                  cursor: "pointer",
                  fontFamily: "'DM Sans',sans-serif",
                  transition: "background 0.1s ease",
                }}
              >{opt.label}</button>
            );
          })}
        </div>
      ))}
    </div>
  );

  // ── Header ──
  const header = (
    <div style={{
      padding: "0 14px 10px",
      display: "flex", justifyContent: "space-between", alignItems: "center",
      borderBottom: `1px solid ${T.rule}`,
    }}>
      <span style={{
        fontFamily: "'Source Serif 4', Georgia, serif",
        fontSize: 14, fontWeight: 700, color: T.ink,
      }}>{title}</span>
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          width: 20, height: 20, borderRadius: "50%",
          background: "rgba(0,0,0,0.05)", border: "none",
          fontSize: 10, color: T.sub, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          lineHeight: 1,
        }}
      >×</button>
    </div>
  );

  // ── Backdrop ──
  const backdrop = (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.3)", zIndex: 99,
      }}
    />
  );

  // ── Mobile: bottom sheet ──
  if (mob) {
    return (
      <>
        {backdrop}
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 100,
            maxHeight: "60vh", background: T.bg,
            borderRadius: "16px 16px 0 0",
            boxShadow: "0 -4px 20px rgba(0,0,0,0.1)",
            overflow: "hidden",
            display: "flex", flexDirection: "column",
          }}
        >
          {/* Drag handle */}
          <div style={{
            width: 32, height: 3, background: T.handle,
            borderRadius: 2, margin: "10px auto 8px",
          }} />
          {header}
          {listContent}
        </div>
      </>
    );
  }

  // ── Desktop: centered modal ──
  return (
    <>
      {backdrop}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)", zIndex: 100,
          width: 400, maxHeight: "70vh", background: T.bg,
          borderRadius: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
          overflow: "hidden",
          display: "flex", flexDirection: "column",
          padding: "14px 0 0",
        }}
      >
        {header}
        {listContent}
      </div>
    </>
  );
}
