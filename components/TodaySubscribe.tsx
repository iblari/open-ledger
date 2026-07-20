"use client";

import { useState } from "react";
import { C, SANS } from "@/lib/design-tokens";

/** "The weekly signal" capture — same durable KV list as every other form. */
export default function TodaySubscribe() {
  const [email, setEmail] = useState("");
  const [st, setSt] = useState<"idle" | "busy" | "ok" | "err">("idle");
  const go = async () => {
    if (!email.trim() || st === "busy") return;
    setSt("busy");
    try {
      const r = await fetch("/api/subscribe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source: "weekly-signal" }),
      });
      setSt(r.ok ? "ok" : "err");
    } catch { setSt("err"); }
  };
  if (st === "ok") {
    return <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#7fd1c7", fontWeight: 600 }}>You&rsquo;re in — first signal lands with the next data drop.</div>;
  }
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <input
        type="email" value={email} onChange={e => setEmail(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") go(); }}
        placeholder="you@example.com"
        style={{
          flex: 1, minWidth: 0, padding: "9px 12px", borderRadius: 4, border: "none",
          fontFamily: SANS, fontSize: 16, color: C.ink, outline: "none",
        }}
      />
      <button onClick={go} disabled={st === "busy"} style={{
        background: C.accent, color: "#fff", border: "none", borderRadius: 4,
        padding: "9px 14px", fontFamily: SANS, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
        opacity: st === "busy" ? 0.6 : 1, flexShrink: 0,
      }}>Join free</button>
    </div>
  );
}
