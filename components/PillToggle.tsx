"use client";
import { C, SANS } from "@/lib/design-tokens";

// Small segmented pill toggle. Used in the scorecard header to switch
// between display modes (per-metric vs raw %, real vs nominal $).
//
// Generic over the value type, so callers can use their own union types
// without losing type safety.
export function PillToggle<T extends string>({ label, options, value, onChange, disabled = false }: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      opacity: disabled ? 0.4 : 1,
      pointerEvents: disabled ? "none" : "auto",
    }}>
      <span style={{
        fontSize: 10, color: C.sub, letterSpacing: "0.08em",
        textTransform: "uppercase", fontWeight: 500, fontFamily: SANS,
      }}>{label}</span>
      <div style={{
        display: "inline-flex", border: `1px solid ${C.rule}`,
        borderRadius: 3, background: C.card, padding: 2,
      }}>
        {options.map(opt => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              aria-pressed={active}
              style={{
                fontSize: 11, padding: "3px 10px", border: "none", cursor: "pointer",
                borderRadius: 2,
                background: active ? C.ink : "transparent",
                color: active ? C.bg : C.sub,
                fontWeight: active ? 600 : 500,
                fontFamily: SANS, transition: "all 0.12s",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
