"use client";

import { useState } from "react";

/**
 * Share one fact-check. On phones this opens the system share sheet (Messages,
 * WhatsApp, X…) with the link, whose preview image carries the verdict; where
 * that isn't available the link is copied instead.
 */
export async function shareClaim(path: string, quote: string, verdict: string): Promise<"shared" | "copied" | "failed"> {
  const url = `${window.location.origin}${path}`;
  const short = quote.length > 100 ? quote.slice(0, 97).replace(/\s+\S*$/, "") + "…" : quote;
  const text = `${verdict.charAt(0)}${verdict.slice(1).toLowerCase()}: “${short}”`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav = navigator as any;
  if (nav.share) {
    try { await nav.share({ title: text, text, url }); return "shared"; }
    catch (e) { if ((e as Error)?.name === "AbortError") return "failed"; }
  }
  try { await navigator.clipboard.writeText(url); return "copied"; } catch { return "failed"; }
}

export default function ShareClaimButton({ path, quote, verdict, variant = "dark", small = false }: {
  path: string; quote: string; verdict: string; variant?: "dark" | "light"; small?: boolean;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const light = variant === "light";
  return (
    <button
      type="button"
      onClick={async e => {
        e.stopPropagation();
        const r = await shareClaim(path, quote, verdict);
        if (r === "copied") { setMsg("Link copied"); setTimeout(() => setMsg(null), 1800); }
      }}
      aria-label="Share this fact-check"
      style={small ? {
        fontSize: 11.5, fontWeight: 600, color: "#CFC7BD", background: "transparent",
        border: "1px solid #3A322B", borderRadius: 6, padding: "5px 9px", cursor: "pointer", lineHeight: 1,
      } : {
        fontSize: 14, fontWeight: 600, borderRadius: 8, padding: "11px 18px", cursor: "pointer",
        background: light ? "#14110E" : "#F5F1EC", color: light ? "#F8F5F0" : "#14110E", border: "none",
      }}
    >
      {msg ?? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: small ? 5 : 7 }}>
          {/* An SVG, not the ↗ character: iOS draws that as a blue emoji box. */}
          <svg width={small ? 11 : 14} height={small ? 11 : 14} viewBox="0 0 14 14" aria-hidden fill="none"
            stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 1.5v8M3.8 4.6 7 1.5l3.2 3.1M2 8.5v3.2c0 .5.4.8.8.8h8.4c.4 0 .8-.3.8-.8V8.5" />
          </svg>
          Share
        </span>
      )}
    </button>
  );
}
