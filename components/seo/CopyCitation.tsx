"use client";
import { useState } from "react";

/** One click → a debate-ready, sourced citation on the clipboard. */
export default function CopyCitation({ text, label = "Copy citation", dark = false }: { text: string; label?: string; dark?: boolean }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); } catch {} t.remove();
    }
    setDone(true); setTimeout(() => setDone(false), 2200);
  };
  return (
    <span data-nosnippet style={{ position: "relative", display: "inline-block" }}>
      <button type="button" onClick={copy} aria-label="Copy a sourced citation to your clipboard"
        style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${dark ? "rgba(255,255,255,.3)" : "#d8d2c8"}`, background: dark ? "transparent" : "#fff", color: dark ? "#fff" : "#1a1a1a", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
        {done ? "✓ Copied" : `❝ ${label}`}
      </button>
      {done && <span role="status" style={{ position: "absolute", left: 0, top: "calc(100% + 6px)", whiteSpace: "nowrap", background: "#1a1a1a", color: "#fff", fontSize: 12, padding: "5px 10px", borderRadius: 6, zIndex: 5 }}>Copied for Reddit / X!</span>}
    </span>
  );
}
