"use client";
import { useEffect, useRef, useState } from "react";
import { STATES, type Housing } from "@/lib/local-shared";
import { useLoc, writeLoc } from "@/lib/local-client";

/** The location setting in the nav. Off by default: the site shows US
 *  figures until a reader picks a state. Any component can open it with
 *  window.dispatchEvent(new Event("vu-loc-open")). */
export const LOCAL_INK = "#6B4FBB";

export default function LocationPicker({ tone = "light", compact = false, cta }: { tone?: "light" | "dark"; compact?: boolean; cta?: string }) {
  const loc = useLoc();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [housing, setHousing] = useState<Housing>("renter");
  const box = useRef<HTMLDivElement>(null);
  const dark = tone === "dark";
  const ink = dark ? "#F4F0EA" : "#1a1a1a", sub = dark ? "rgba(244,240,234,.7)" : "#5c5856", rule = dark ? "rgba(255,255,255,.18)" : "#e2ded6";

  useEffect(() => { if (open) { setCode(loc?.state.code || ""); setHousing(loc?.housing || "renter"); } }, [open, loc]);
  useEffect(() => {
    const o = () => setOpen(true);
    window.addEventListener("vu-loc-open", o);
    return () => window.removeEventListener("vu-loc-open", o);
  }, []);
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", click); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", click); document.removeEventListener("keydown", key); };
  }, [open]);

  const long = loc ? `${loc.state.name} · ${loc.housing === "owner" ? "Owner" : "Renter"}` : "US";
  const short = loc ? loc.state.code : "US";
  const seg = (h: Housing) => ({
    flex: 1, padding: "7px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", borderRadius: 6,
    border: `1px solid ${housing === h ? "#1a1a1a" : "#e2ded6"}`, background: housing === h ? "#1a1a1a" : "#fff", color: housing === h ? "#fff" : "#1a1a1a",
  } as const);

  return (
    <div ref={box} data-nosnippet style={{ position: "relative", flex: "none" }}>
      <style>{`.vu-loc-s{display:none}@media (max-width:640px){.vu-loc-l{display:none}.vu-loc-s{display:inline}}`}</style>
      <button type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={`Your location: ${loc ? loc.state.name : "United States"}. Change`}
        onClick={() => setOpen(o => !o)}
        style={{ display: "inline-flex", alignItems: "center", gap: compact ? 4 : 6, padding: compact ? "6px 9px" : "7px 11px", borderRadius: 999, cursor: "pointer",
          fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap",
          background: "transparent", color: loc || cta ? (dark ? "#B9A6F0" : LOCAL_INK) : sub, border: `1px solid ${loc || cta ? (dark ? "#B9A6F0" : LOCAL_INK) : rule}` }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
        {!loc && cta ? cta : compact ? short : <><span className="vu-loc-l">{long}</span><span className="vu-loc-s">{short}</span></>}
        {!compact && <span aria-hidden style={{ fontSize: 9 }}>▾</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Your location" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 80, width: 268, background: "#fff", color: "#1a1a1a",
          border: "1px solid #e2ded6", borderRadius: 12, padding: 14, boxShadow: "0 12px 32px -12px rgba(20,17,14,.35)", textAlign: "left" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2, color: ink === "#F4F0EA" ? "#1a1a1a" : ink }}>Localize the data</div>
          <div style={{ fontSize: 12, color: "#5c5856", lineHeight: 1.45, marginBottom: 10 }}>Adds your area's official figures next to the national ones. Verdicts don't change.</div>
          <label style={{ fontSize: 12, color: "#5c5856" }} htmlFor="vu-loc-state">Your state</label>
          <select id="vu-loc-state" value={code} onChange={e => setCode(e.target.value)}
            style={{ display: "block", width: "100%", margin: "4px 0 10px", padding: "8px 10px", fontSize: 14, borderRadius: 8, border: "1px solid #d9d3c8", background: "#fff", color: "#1a1a1a" }}>
            <option value="">United States (no state)</option>
            {STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
          <div style={{ fontSize: 12, color: "#5c5856", marginBottom: 4 }}>Housing</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <button type="button" style={seg("renter")} onClick={() => setHousing("renter")} aria-pressed={housing === "renter"}>Renter</button>
            <button type="button" style={seg("owner")} onClick={() => setHousing("owner")} aria-pressed={housing === "owner"}>Owner</button>
          </div>
          <button type="button" onClick={() => { writeLoc(code || null, housing); setOpen(false); }}
            style={{ width: "100%", padding: "9px 0", fontSize: 14, fontWeight: 700, borderRadius: 8, border: "none", background: "#1a1a1a", color: "#fff", cursor: "pointer" }}>Save</button>
          <div style={{ fontSize: 11.5, color: "#8c8479", marginTop: 9, lineHeight: 1.45 }}>
            Saved on this device only. We never use your IP address.{loc && <> · <button type="button" onClick={() => { writeLoc(null); setOpen(false); }} style={{ background: "none", border: "none", padding: 0, color: "#5c5856", textDecoration: "underline", cursor: "pointer", fontSize: 11.5 }}>Show US only</button></>}
          </div>
        </div>
      )}
    </div>
  );
}
