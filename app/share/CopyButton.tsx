"use client";
import { useState } from "react";
export default function CopyButton({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /* */ } }}
      style={{ fontSize: 12.5, fontWeight: 600, padding: "6px 10px", borderRadius: 6, border: "1px solid #E2DED6", background: ok ? "#E3F1EE" : "#fff", cursor: "pointer" }}>
      {ok ? "Copied" : label}
    </button>
  );
}
