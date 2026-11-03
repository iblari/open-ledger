"use client";
import { useEffect, useMemo, useState } from "react";
import type { PollingResult, Place } from "@/lib/polling";
import { STATE_LOOKUP, ANY_STATE_LOOKUP } from "@/lib/state-voting";

/**
 * "Find your polling place" → sheet with address / my location → map of the
 * assigned polling place (red) and nearby drop boxes (grey) → directions in
 * Apple or Google Maps. Then, on election day, "Did you vote?" → "I voted"
 * story card to share. Addresses aren't stored; the vote count is anonymous.
 */
const INK = "#14110E", RED = "#C1272D", RULE = "#E6E0D6", SUB = "#6B655C", MUTE = "#9A9288", BG = "#F7F4EF";
const SANS = "'DM Sans',system-ui,sans-serif", SERIF = "'Source Serif 4',Georgia,serif";
const LS = { seen: "vu_poll_seen", st: "vu_poll_st", answered: "vu_voted_2026", device: "vu_device" };
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const etDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const isElectionDay = () => etDay() === "2026-11-03";

type Res = PollingResult & { home?: { lat: number; lng: number } | null };
type Pin = { lat: number; lng: number; kind: "poll" | "drop" | "home"; label?: string };

/* ── Static map: OpenStreetMap tiles stitched under the pins (no map library). ── */
const lng2x = (lng: number, z: number) => ((lng + 180) / 360) * 256 * 2 ** z;
const lat2y = (lat: number, z: number) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 256 * 2 ** z; };
function MiniMap({ pins, onPick }: { pins: Pin[]; onPick?: (i: number) => void }) {
  const W = 720, H = 300;
  const { z, cx, cy } = useMemo(() => {
    for (let z = 17; z >= 3; z--) {
      const xs = pins.map(p => lng2x(p.lng, z)), ys = pins.map(p => lat2y(p.lat, z));
      if (Math.max(...xs) - Math.min(...xs) < W - 120 && Math.max(...ys) - Math.min(...ys) < H - 90)
        return { z, cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2 + 10 };
    }
    return { z: 3, cx: lng2x(pins[0].lng, 3), cy: lat2y(pins[0].lat, 3) };
  }, [pins]);
  const x0 = cx - W / 2, y0 = cy - H / 2, n = 2 ** z;
  const tiles: { x: number; y: number }[] = [];
  for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + W) / 256); tx++) for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + H) / 256); ty++) if (ty >= 0 && ty < n) tiles.push({ x: tx, y: ty });
  return (
    <div style={{ position: "relative", height: 230, overflow: "hidden", background: "#E9EEE6", borderRadius: 12 }}>
      <div style={{ position: "absolute", left: "50%", top: "50%", width: W, height: H, transform: "translate(-50%,-50%)" }}>
        {tiles.map(t => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${t.x}-${t.y}`} alt="" src={`https://tile.openstreetmap.org/${z}/${((t.x % n) + n) % n}/${t.y}.png`} width={256} height={256}
            style={{ position: "absolute", left: t.x * 256 - x0, top: t.y * 256 - y0, filter: "saturate(.35) contrast(.95)" }} />
        ))}
        {[...pins].sort((a, b) => (a.kind === "poll" ? 1 : 0) - (b.kind === "poll" ? 1 : 0)).map((p, i) => {
          const px = lng2x(p.lng, z) - x0, py = lat2y(p.lat, z) - y0;
          if (p.kind === "home") return <span key={i} title="You" style={{ position: "absolute", left: px - 8, top: py - 8, width: 16, height: 16, borderRadius: "50%", background: "#2F6FB0", border: "3px solid #fff", boxShadow: "0 0 0 1px #2F6FB055" }} />;
          const s = p.kind === "poll" ? 26 : 16;
          return <button key={i} type="button" aria-label={p.label} title={p.label} onClick={() => onPick?.(pins.indexOf(p))}
            style={{ position: "absolute", left: px - s / 2, top: py - s, width: s, height: s, padding: 0, border: "2px solid #fff", borderRadius: "50% 50% 50% 0", transform: "rotate(-45deg)", background: p.kind === "poll" ? RED : "#8A8378", cursor: "pointer" }} />;
        })}
      </div>
      <span style={{ position: "absolute", right: 6, bottom: 4, fontSize: 10, color: SUB, background: "rgba(255,255,255,.8)", padding: "1px 5px", borderRadius: 3 }}>© OpenStreetMap</span>
    </div>
  );
}

const fullAddr = (p: Place) => [p.address, p.city, [p.state, p.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
const apple = (p: Place) => `https://maps.apple.com/?daddr=${p.lat != null ? `${p.lat},${p.lng}` : encodeURIComponent(fullAddr(p))}&q=${encodeURIComponent(p.name)}`;
const google = (p: Place) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.lat != null ? `${p.lat},${p.lng}` : fullAddr(p))}`;
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371, dLa = ((b.lat - a.lat) * Math.PI) / 180, dLo = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const mi = (k: number) => `${(k * 0.621371).toFixed(k < 1.6 ? 1 : 0)} mi`;

const btn = (dark: boolean): React.CSSProperties => ({ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "11px 12px", borderRadius: 8, fontFamily: SANS, fontSize: 14, fontWeight: 600, textDecoration: "none", cursor: "pointer", border: dark ? "none" : `1px solid #D9D2C7`, background: dark ? INK : "#fff", color: dark ? "#fff" : INK });

export default function PollingFinder({ variant = "button", st, prompt: canPrompt = false }: { variant?: "button" | "link" | "none"; st?: string; prompt?: boolean }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"ask" | "result" | "voted">("ask");
  const [addr, setAddr] = useState("");
  const [busy, setBusy] = useState<false | "addr" | "loc">(false);
  const [err, setErr] = useState<string | null>(null);
  // Guaranteed next step when the lookup comes up empty: the state's official finder.
  const [fallback, setFallback] = useState<{ name: string; url: string } | null>(null);
  const [fbDrops, setFbDrops] = useState<Place[]>([]);
  const [res, setRes] = useState<Res | null>(null);
  const [sel, setSel] = useState<Place | null>(null);
  const [prompt, setPrompt] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);

  // Election day: someone who looked up their polling place earlier gets asked once.
  useEffect(() => {
    if (!canPrompt || !isElectionDay() || ls.get(LS.answered)) return;
    const seen = Number(ls.get(LS.seen) || 0);
    if (seen && Date.now() - seen > 20 * 60_000) { const t = setTimeout(() => setPrompt(true), 1500); return () => clearTimeout(t); }
  }, [canPrompt]);
  useEffect(() => { document.body.style.overflow = open ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [open]);

  const show = (r: Res) => {
    setRes(r); setSel(r.polling[0] || null); setMode("result");
    if (r.st) ls.set(LS.st, r.st);
    ls.set(LS.seen, String(Date.now()));
  };
  const fail = (e: string, sl?: { name: string; url: string } | null, drops: Place[] = []) => {
    const lookup = sl || (st ? STATE_LOOKUP[st] : null) || null;
    setFallback(lookup); setFbDrops(drops.slice(0, 3));
    setErr(
      e === "bad-address" ? "We couldn't match that address. Try your full street address with ZIP, or use your state's lookup below." :
      e === "no-address" ? "We couldn't turn your location into an address. Type your address, or use your state's lookup below." :
      e === "not-configured" || e === "unavailable" ? "Our lookup is busy right now. Your state's official lookup has your polling place:" :
      "We couldn't pinpoint your polling place from this address. Your state's official lookup has it:");
  };
  const find = async (q: string) => {
    setErr(null); setFallback(null); setFbDrops([]); setBusy(q.startsWith("lat=") ? "loc" : "addr");
    try {
      let j = await (await fetch(`/api/polling?${q}`)).json();
      // Busy minute at Google: wait a moment and try once more before showing the fallback.
      if (j.error === "unavailable") { await new Promise(r => setTimeout(r, 4000)); j = await (await fetch(`/api/polling?${q}`)).json(); }
      if (j.error) fail(j.error, j.stateLookup); else if (!j.found) { setRes(j); fail("no-data", j.stateLookup, j.dropoff || []); } else show(j);
    } catch { fail("unavailable"); } finally { setBusy(false); }
  };
  const locate = () => {
    if (!navigator.geolocation) { setErr("Your browser can't share location. Type your address."); return; }
    setBusy("loc"); setErr(null);
    navigator.geolocation.getCurrentPosition(
      p => find(`lat=${p.coords.latitude.toFixed(5)}&lng=${p.coords.longitude.toFixed(5)}`),
      () => { setBusy(false); setErr("Location was blocked. Type your address instead."); },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };
  const voted = async () => {
    ls.set(LS.answered, "yes"); setPrompt(false); setOpen(true); setMode("voted");
    let device = ls.get(LS.device);
    if (!device) { device = (crypto.randomUUID?.() || String(Math.random()).slice(2)).replace(/[^a-zA-Z0-9-]/g, ""); ls.set(LS.device, device); }
    try { const j = await (await fetch("/api/voted", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ st: ls.get(LS.st) || st || null, device }) })).json(); setCount(j.total ?? null); } catch { /* count is optional */ }
  };
  const cardUrl = `/api/og/i-voted?st=${encodeURIComponent(ls.get(LS.st) || st || "")}`;
  const share = async () => {
    setSharing(true);
    try {
      const blob = await (await fetch(cardUrl)).blob();
      const file = new File([blob], "i-voted-voteunbiased.png", { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) { await nav.share({ files: [file], title: "I voted" }); }
      else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
    } catch { /* user closed the share sheet */ } finally { setSharing(false); }
  };

  const drops = useMemo(() => {
    if (!res || !sel || sel.lat == null) return [];
    const at = res.home ?? { lat: sel.lat, lng: sel.lng! };
    return res.dropoff.filter(d => d.lat != null && !(d.lat === sel.lat && d.lng === sel.lng)).map(d => ({ d, k: km(at, { lat: d.lat!, lng: d.lng! }) })).sort((a, b) => a.k - b.k).slice(0, 3);
  }, [res, sel]);
  const pins: Pin[] = useMemo(() => {
    if (!sel || sel.lat == null) return [];
    return [
      ...(res?.home ? [{ lat: res.home.lat, lng: res.home.lng, kind: "home" as const }] : []),
      ...drops.map(x => ({ lat: x.d.lat!, lng: x.d.lng!, kind: "drop" as const, label: x.d.name })),
      { lat: sel.lat, lng: sel.lng!, kind: "poll" as const, label: sel.name },
    ];
  }, [sel, drops, res]);
  const dist = res?.home && sel?.lat != null ? mi(km(res.home, { lat: sel.lat, lng: sel.lng! })) : null;

  const trigger = variant === "none" ? null : variant === "link"
    ? <button type="button" onClick={() => { setOpen(true); setMode(res ? "result" : "ask"); }} style={{ background: "none", border: "none", padding: 0, font: "inherit", fontSize: 13, color: SUB, textDecoration: "underline", cursor: "pointer" }}>Find your polling place</button>
    : <button type="button" onClick={() => { setOpen(true); setMode(res ? "result" : "ask"); }} style={{ ...btn(false), width: "100%", marginTop: 8, borderColor: RED, color: RED }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>
        Find your polling place
      </button>;

  return (
    <>
      {trigger}
      {prompt && !open && (
        <div role="dialog" aria-label="Did you vote today?" style={{ position: "fixed", left: 12, right: 12, bottom: 14, zIndex: 60, maxWidth: 420, margin: "0 auto", background: "#fff", border: `1px solid ${RULE}`, borderRadius: 14, padding: 16, textAlign: "center", fontFamily: SANS, boxShadow: "0 10px 30px rgba(20,17,14,.14)" }}>
          <button type="button" aria-label="Close" onClick={() => { setPrompt(false); ls.set(LS.answered, "dismissed"); }} style={{ position: "absolute", right: 10, top: 8, background: "none", border: "none", fontSize: 18, color: MUTE, cursor: "pointer" }}>×</button>
          <div style={{ fontFamily: SERIF, fontSize: 21, color: INK }}>Did you vote today?</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
            <button type="button" onClick={voted} style={btn(true)}>Yes, I voted</button>
            <button type="button" onClick={() => { setPrompt(false); setOpen(true); setMode(res ? "result" : "ask"); }} style={btn(false)}>Not yet</button>
          </div>
          <div style={{ fontSize: 11.5, color: MUTE, marginTop: 9 }}>Anonymous. We never ask who you voted for.</div>
        </div>
      )}
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(20,17,14,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div role="dialog" aria-label="Find your polling place" onClick={e => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", background: BG, borderRadius: "18px 18px 0 0", padding: "10px 18px 22px", fontFamily: SANS, color: INK }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ width: 36, height: 4, borderRadius: 2, background: "#DDD6CB", margin: "4px auto 8px" }} />
            </div>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} style={{ position: "absolute", marginTop: -30, right: "max(14px, calc(50% - 266px))", background: "none", border: "none", fontSize: 22, color: MUTE, cursor: "pointer" }}>×</button>

            {mode === "ask" && (
              <form onSubmit={e => { e.preventDefault(); if (addr.trim().length >= 5) find(`address=${encodeURIComponent(addr.trim())}`); }}>
                <div style={{ fontFamily: SERIF, fontSize: 24 }}>Where do you vote?</div>
                <div style={{ fontSize: 13.5, color: SUB, margin: "4px 0 12px" }}>Your polling place is set by your registered address.</div>
                <input value={addr} onChange={e => { setAddr(e.target.value); setErr(null); }} autoComplete="street-address" placeholder="Home address with ZIP" aria-label="Home address"
                  style={{ width: "100%", boxSizing: "border-box", padding: "12px 13px", fontSize: 16, border: `1px solid #D9D2C7`, borderRadius: 8, background: "#fff", fontFamily: SANS }} />
                <button type="submit" disabled={!!busy} style={{ ...btn(true), width: "100%", marginTop: 10, opacity: busy ? 0.7 : 1 }}>{busy === "addr" ? "Looking up…" : "Find my polling place"}</button>
                <button type="button" onClick={locate} disabled={!!busy} style={{ ...btn(false), width: "100%", marginTop: 8, color: "#2F6FB0" }}>{busy === "loc" ? "Finding you…" : "Use my location"}</button>
                {err && <div role="alert" style={{ fontSize: 13.5, color: fallback ? INK : RED, marginTop: 12, lineHeight: 1.45 }}>{err}</div>}
                {err && (
                  <div style={{ marginTop: 8 }}>
                    <a href={fallback?.url || ANY_STATE_LOOKUP} target="_blank" rel="noopener noreferrer" style={{ ...btn(true), background: RED }}>
                      {fallback ? `Open ${fallback.name}'s official polling place lookup ↗` : "Find your polling place on vote.org ↗"}
                    </a>
                    {fallback && <a href={ANY_STATE_LOOKUP} target="_blank" rel="noopener noreferrer" style={{ display: "block", textAlign: "center", fontSize: 12.5, color: SUB, marginTop: 8 }}>Or use vote.org's locator ↗</a>}
                    {fbDrops.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 12, color: SUB, marginBottom: 4 }}>Ballot drop boxes near you</div>
                        {fbDrops.map(d => (
                          <div key={`${d.lat},${d.lng},${d.name}`} style={{ background: "#fff", border: `1px solid ${RULE}`, borderRadius: 8, padding: "9px 11px", marginTop: 6, fontSize: 13.5 }}>
                            {d.name}<span style={{ display: "block", fontSize: 12, color: SUB }}>{fullAddr(d)}{d.hours ? ` · ${d.hours}` : ""}</span>
                            <span style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 12.5 }}><a href={apple(d)} target="_blank" rel="noopener noreferrer" style={{ color: INK }}>Apple Maps ↗</a><a href={google(d)} target="_blank" rel="noopener noreferrer" style={{ color: INK }}>Google Maps ↗</a></span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div style={{ fontSize: 11.5, color: MUTE, marginTop: 12, lineHeight: 1.5 }}>We use your address only for this lookup and don't save it. Official data from your state via the Voting Information Project. Not finding it? <a href="https://vote.gov" target="_blank" rel="noopener noreferrer" style={{ color: SUB }}>vote.gov ↗</a></div>
              </form>
            )}

            {mode === "result" && res && sel && (
              <div>
                {pins.length > 0 && <MiniMap pins={pins} onPick={i => { const p = pins[i]; if (p.kind === "drop") { const d = drops.find(x => x.d.lat === p.lat && x.d.lng === p.lng)?.d; if (d) setSel(d); } }} />}
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", color: RED, marginTop: 14 }}>{sel === res.polling[0] ? (res.matchedArea ? "POLLING PLACE NEAR YOU · TUE, NOV 3" : res.polling.length > 1 ? "CLOSEST POLLING PLACE · TUE, NOV 3" : "YOUR POLLING PLACE · TUE, NOV 3") : res.polling.includes(sel) ? "POLLING PLACE · TUE, NOV 3" : "BALLOT DROP BOX"}</div>
                <div style={{ fontFamily: SERIF, fontSize: 23, lineHeight: 1.15, marginTop: 4 }}>{sel.name}</div>
                {res.matchedNearby && sel === res.polling[0] && <div style={{ fontSize: 12.5, color: "#8A5A00", background: "#FFF6E0", border: "1px solid #F0DFB0", borderRadius: 6, padding: "6px 9px", marginTop: 6 }}>{res.matchedArea ? `Your exact address isn't in the state's data, so this is the polling place for ${res.matchedNearby}, close to you. Yours is very likely the same, but it can differ.` : "Matched from a neighbouring address on your street."} <a href={res.stateLookup?.url || "https://www.vote.org/polling-place-locator/"} target="_blank" rel="noopener noreferrer" style={{ color: "#8A5A00", fontWeight: 600 }}>Confirm with {res.stateLookup?.name ?? "your state"} ↗</a></div>}
                <div style={{ fontSize: 14, color: SUB, marginTop: 2 }}>{fullAddr(sel)}{dist && res.polling.includes(sel) ? ` · ${dist}` : ""}</div>
                {sel.hours && <div style={{ fontSize: 14, marginTop: 6 }}><b style={{ fontWeight: 600 }}>{res.polling.includes(sel) ? "Open" : "Open on Nov 3"}</b> {sel.hours.replace(/^Tue, Nov 3:\s*/, "")}</div>}
                {sel.notes && <div style={{ fontSize: 13, color: SUB, marginTop: 4 }}>{sel.notes}</div>}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
                  <a href={apple(sel)} target="_blank" rel="noopener noreferrer" style={btn(true)}>Apple Maps</a>
                  <a href={google(sel)} target="_blank" rel="noopener noreferrer" style={btn(false)}>Google Maps</a>
                </div>
                {!res.polling.includes(sel) && <button type="button" onClick={() => setSel(res.polling[0])} style={{ background: "none", border: "none", color: SUB, fontSize: 13, marginTop: 10, cursor: "pointer", textDecoration: "underline", padding: 0 }}>← Back to your polling place</button>}
                {res.polling.length > 1 && res.polling.includes(sel) && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 12, color: SUB, marginBottom: 4 }}>Other polling places for your address</div>
                    {res.polling.filter(p => p !== sel).slice(0, 3).map(p => (
                      <button key={`${p.lat},${p.lng},${p.name}`} type="button" onClick={() => setSel(p)} style={{ display: "block", width: "100%", background: "#fff", border: `1px solid ${RULE}`, borderRadius: 8, padding: "9px 11px", marginTop: 6, textAlign: "left", cursor: "pointer", fontFamily: SANS, fontSize: 13.5, color: INK }}>
                        {p.name}<span style={{ display: "block", fontSize: 12, color: SUB }}>{p.address}{p.hours ? ` · ${p.hours}` : ""}</span>
                      </button>
                    ))}
                  </div>
                )}
                {drops.length > 0 && res.polling.includes(sel) && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 12, color: SUB, marginBottom: 4 }}>{res.home ? "Ballot drop boxes near you (grey pins)" : "Ballot drop boxes nearby (grey pins), distance from your polling place"}</div>
                    {drops.map(({ d, k }) => (
                      <button key={`${d.lat},${d.lng}`} type="button" onClick={() => setSel(d)} style={{ display: "flex", justifyContent: "space-between", width: "100%", gap: 10, background: "#fff", border: `1px solid ${RULE}`, borderRadius: 8, padding: "9px 11px", marginTop: 6, textAlign: "left", cursor: "pointer", fontFamily: SANS, fontSize: 13.5, color: INK }}>
                        <span>{d.name}<span style={{ display: "block", fontSize: 12, color: SUB }}>{d.address}{d.hours ? ` · ${d.hours}` : ""}</span></span>
                        <span style={{ fontSize: 12, color: MUTE, whiteSpace: "nowrap" }}>{mi(k)}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 12, color: MUTE, marginTop: 14, lineHeight: 1.5 }}>
                  For {res.input}. Bring ID if your state requires it. Source: {res.official.name ? `${res.official.name}, ` : ""}Voting Information Project.{" "}
                  {res.matchedNearby ? <b style={{ fontWeight: 600, color: INK }}>Please confirm it with your state before you go. </b>
                    : res.unofficial && <b style={{ fontWeight: 600, color: INK }}>This one comes from Google's wider data, so please confirm it. </b>}
                  {(res.stateLookup?.url || res.official.locator) && <a href={res.stateLookup?.url || res.official.locator!} target="_blank" rel="noopener noreferrer" style={{ color: SUB }}>Confirm with {res.stateLookup ? `${res.stateLookup.name}'s` : "your state's"} official lookup ↗</a>}{" "}
                  <button type="button" onClick={() => { setMode("ask"); setErr(null); }} style={{ background: "none", border: "none", padding: 0, color: SUB, textDecoration: "underline", cursor: "pointer", fontSize: 12 }}>Different address</button>
                </div>
                {isElectionDay() && ls.get(LS.answered) !== "yes" && <button type="button" onClick={voted} style={{ ...btn(false), width: "100%", marginTop: 14 }}>I voted ✓</button>}
              </div>
            )}

            {mode === "voted" && (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: SERIF, fontSize: 26 }}>Thanks for voting.</div>
                {count != null && count > 0 && <div style={{ fontSize: 13.5, color: SUB, marginTop: 4 }}>{count.toLocaleString()} Vote Unbiased reader{count === 1 ? "" : "s"} said they voted.</div>}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cardUrl} alt="I voted. I checked the data first." style={{ width: 190, aspectRatio: "9 / 16", borderRadius: 12, border: `1px solid ${RULE}`, margin: "14px auto 0", display: "block", background: "#fff" }} />
                <button type="button" onClick={share} disabled={sharing} style={{ ...btn(true), width: "100%", marginTop: 14 }}>{sharing ? "Opening…" : "Share to your story"}</button>
                <div style={{ fontSize: 11.5, color: MUTE, marginTop: 8 }}>On a phone this opens the share sheet (Instagram, Snapchat, Messages). On a computer it downloads the image.</div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
