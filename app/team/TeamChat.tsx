"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Member = "ib" | "sam" | "claude";
type Kind = "message" | "request" | "approve" | "decline" | "build" | "ship" | "reject";
interface Build { request: number; status: "queued" | "building" | "ready" | "failed" | "shipped" | "rejected"; preview?: string; prUrl?: string }
interface Msg { id: number; from: Member; text: string; at: string; kind: Kind; ref?: number }
interface Req { id: number; from: Member; text: string; at: string; status: "pending" | "approved" | "declined" }

const WHO: Record<Member, { name: string; role: string; color: string }> = {
  ib: { name: "Ib", role: "CEO", color: "#B07A12" },
  claude: { name: "Claude", role: "Code & UI design", color: "#E0493A" },
  sam: { name: "Sam", role: "Social media manager", color: "#2F6FB0" },
};
const SERIF = "'Newsreader','Source Serif 4',Georgia,serif";
const LS = "vu-team-key";
const store = { get: () => { try { return localStorage.getItem(LS); } catch { return null; } }, set: (v: string | null) => { try { v ? localStorage.setItem(LS, v) : localStorage.removeItem(LS); } catch {} } };

const time = (iso: string) => {
  const d = new Date(iso), today = new Date().toDateString() === d.toDateString();
  return d.toLocaleString("en-US", { ...(today ? {} : { month: "short", day: "numeric" }), hour: "numeric", minute: "2-digit" });
};

function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return <>{parts.map((p, i) => (/^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline", wordBreak: "break-all" }}>{p}</a> : <span key={i}>{p}</span>))}</>;
}

function Avatar({ m, size = 34 }: { m: Member; size?: number }) {
  return <div style={{ width: size, height: size, borderRadius: "50%", background: WHO[m].color, color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: size * 0.42, flex: "none" }}>{WHO[m].name[0]}</div>;
}

export default function TeamChat() {
  const [key, setKey] = useState<string | null>(null);
  const [me, setMe] = useState<Member | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [draft, setDraft] = useState("");
  const [asRequest, setAsRequest] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [typing, setTyping] = useState<Member[]>([]);
  const [builds, setBuilds] = useState<Record<number, Build>>({});
  const endRef = useRef<HTMLDivElement>(null);
  const lastId = useRef(0);

  const load = useCallback(async (k: string) => {
    const r = await fetch(`/api/team`, { headers: { Authorization: `Bearer ${k}` }, cache: "no-store" });
    if (r.status === 401) { store.set(null); setKey(null); setMe(null); setErr("That key didn't work."); return; }
    const d = await r.json();
    setMe(d.me); setMsgs(d.messages); setReqs(d.requests); setTyping(d.typing || []); setBuilds(d.builds || {}); setErr("");
  }, []);

  useEffect(() => { const k = store.get(); if (k) setKey(k); }, []);
  useEffect(() => {
    if (!key) return;
    load(key);
    const t = setInterval(() => { if (!document.hidden) load(key); }, 2500);
    return () => clearInterval(t);
  }, [key, load]);
  useEffect(() => {
    const last = msgs[msgs.length - 1]?.id || 0;
    if (last !== lastId.current) { lastId.current = last; endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }
  }, [msgs]);

  const send = async (body: { text?: string; kind?: Kind; ref?: number }) => {
    if (!key) return;
    setBusy(true);
    const r = await fetch("/api/team", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { setErr((await r.json().catch(() => ({}))).error || "Couldn't send."); return; }
    await load(key);
    setTimeout(() => load(key), 800);
  };
  const submit = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    await send({ text, kind: asRequest ? "request" : "message" });
    setAsRequest(false);
  };

  if (!key || !me) {
    return (
      <div style={{ minHeight: "100vh", background: "#F8F5F0", display: "grid", placeItems: "center", padding: 20, fontFamily: "'DM Sans',system-ui,sans-serif" }}>
        <form onSubmit={e => { e.preventDefault(); const k = keyInput.trim(); if (k) { store.set(k); setKey(k); } }}
          style={{ background: "#fff", border: "1px solid #E2DED6", borderRadius: 16, padding: 28, width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontFamily: SERIF, fontSize: 30 }}>Team room</div>
          <div style={{ fontSize: 14, color: "#5F5850" }}>Ib, Claude and Sam. Enter your key.</div>
          <input value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder="Your key" type="password" autoFocus
            style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid #D8D2C8", fontSize: 16 }} />
          {err && <div style={{ color: "#C0392B", fontSize: 13 }}>{err}</div>}
          <button style={{ padding: "12px 14px", borderRadius: 10, border: 0, background: "#14110E", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Enter</button>
        </form>
      </div>
    );
  }

  const pending = reqs.filter(r => r.status === "pending");
  const byId = new Map(msgs.map(m => [m.id, m]));
  const reqStatus = new Map(reqs.map(r => [r.id, r.status]));

  const Approvals = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "#8C8479" }}>Needs Ib's approval · {pending.length}</div>
      {pending.length === 0 && <div style={{ fontSize: 13.5, color: "#8C8479" }}>Nothing waiting.</div>}
      {pending.map(r => (
        <div key={r.id} style={{ background: "#FFF8EC", border: "1px solid #EBD9B4", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, color: "#8C6A2A" }}>#{r.id} · {WHO[r.from].name} · {time(r.at)}</div>
          <div style={{ fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.45 }}><Linked text={r.text} /></div>
          {me === "ib" && (
            <div style={{ display: "flex", gap: 8 }}>
              <button disabled={busy} onClick={() => send({ kind: "approve", ref: r.id, text: "" })} style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: 0, background: "#1E7A5A", color: "#fff", fontWeight: 600, cursor: "pointer" }}>Approve</button>
              <button disabled={busy} onClick={() => send({ kind: "decline", ref: r.id, text: "" })} style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: "1px solid #D8D2C8", background: "#fff", fontWeight: 600, cursor: "pointer" }}>Decline</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="team-root" style={{ minHeight: "100vh", background: "#F8F5F0", color: "#14110E", fontFamily: "'DM Sans',system-ui,sans-serif" }}>
      <style>{`
        .team-wrap{max-width:1400px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:28px;padding:24px 24px 0}
        .team-side{position:sticky;top:20px;align-self:start;display:flex;flex-direction:column;gap:22px}
        .team-top-approvals{display:none}
        @keyframes teamdots{0%,100%{opacity:.2}50%{opacity:1}}
        .team-dots{animation:teamdots 1.2s infinite}
        @media (max-width: 860px){
          .team-wrap{grid-template-columns:1fr;padding:14px 12px 0;gap:12px}
          .team-side{display:none}
          .team-top-approvals{display:block}
        }
      `}</style>
      <div className="team-wrap">
        <main style={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 24px)" }}>
          <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", paddingBottom: 12, borderBottom: "1px solid #E2DED6" }}>
            <div>
              <div style={{ fontFamily: SERIF, fontSize: 32, lineHeight: 1.1 }}>Team room</div>
              <div style={{ fontSize: 13.5, color: "#5F5850", marginTop: 4 }}>
                {(["ib", "claude", "sam"] as Member[]).map((m, i) => <span key={m}>{i ? " · " : ""}<b style={{ color: WHO[m].color }}>{WHO[m].name}</b> {WHO[m].role}</span>)}
              </div>
            </div>
            <div style={{ fontSize: 13, color: "#8C8479" }}>You're {WHO[me].name} · <button onClick={() => { store.set(null); setKey(null); setMe(null); }} style={{ background: "none", border: 0, color: "#8C8479", textDecoration: "underline", cursor: "pointer", padding: 0 }}>sign out</button></div>
          </header>

          {pending.length > 0 && <div className="team-top-approvals" style={{ padding: "12px 0" }}>{Approvals}</div>}

          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, padding: "18px 0" }}>
            {msgs.length === 0 && <div style={{ color: "#8C8479", fontSize: 14 }}>No messages yet. Say hello.</div>}
            {msgs.map(m => {
              if (m.kind === "ship" || m.kind === "reject") {
                return (
                  <div key={m.id} style={{ alignSelf: "center", fontSize: 13, color: m.kind === "ship" ? "#1E7A5A" : "#A33A2E", background: "#fff", border: "1px solid #E2DED6", borderRadius: 999, padding: "6px 14px" }}>
                    {m.kind === "ship" ? "🚀 Ib shipped" : "✕ Ib rejected"} #{m.ref} · {time(m.at)}
                  </div>
                );
              }
              if (m.kind === "approve" || m.kind === "decline") {
                const ref = m.ref ? byId.get(m.ref) : null;
                return (
                  <div key={m.id} style={{ alignSelf: "center", fontSize: 13, color: m.kind === "approve" ? "#1E7A5A" : "#A33A2E", background: "#fff", border: "1px solid #E2DED6", borderRadius: 999, padding: "6px 14px", maxWidth: "100%" }}>
                    {m.kind === "approve" ? "✓ Ib approved" : "✕ Ib declined"} #{m.ref}{ref ? `: ${ref.text.slice(0, 70)}${ref.text.length > 70 ? "…" : ""}` : ""} · {time(m.at)}
                  </div>
                );
              }
              const st = m.kind === "request" ? reqStatus.get(m.id) : null;
              return (
                <div key={m.id} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <Avatar m={m.from} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, color: "#8C8479" }}><b style={{ color: WHO[m.from].color }}>{WHO[m.from].name}</b> {WHO[m.from].role} · {time(m.at)} · #{m.id}</div>
                    <div style={{
                      marginTop: 4, fontSize: 15.5, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere",
                      ...(m.kind === "request" ? { background: "#FFF8EC", border: "1px solid #EBD9B4", borderRadius: 12, padding: "10px 12px" } : {}),
                    }}>
                      {m.kind === "request" && <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: st === "approved" ? "#1E7A5A" : st === "declined" ? "#A33A2E" : "#8C6A2A", marginBottom: 4 }}>{st === "approved" ? "Approved" : st === "declined" ? "Declined" : "Asking Ib to approve"}</div>}
                      <Linked text={m.text} />
                      {m.kind === "build" && m.ref && (() => {
                        const b = builds[m.ref];
                        const latest = [...msgs].reverse().find(x => x.kind === "build" && x.ref === m.ref)?.id === m.id;
                        if (!b || !latest) return null;
                        const label: Record<Build["status"], [string, string]> = { queued: ["Starting build", "#8C6A2A"], building: ["Building…", "#8C6A2A"], ready: ["Ready for Ib", "#2F6FB0"], failed: ["Build failed", "#A33A2E"], shipped: ["Live", "#1E7A5A"], rejected: ["Rejected", "#A33A2E"] };
                        return (
                          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: label[b.status][1] }}>{label[b.status][0]}</span>
                            {b.preview && b.status === "ready" && <a href={b.preview} target="_blank" rel="noreferrer" style={{ fontSize: 13.5, padding: "7px 12px", borderRadius: 9, border: "1px solid #D8D2C8", background: "#fff", color: "#14110E", textDecoration: "none" }}>Open preview ↗</a>}
                            {me === "ib" && b.status === "ready" && <>
                              <button disabled={busy} onClick={() => send({ kind: "ship", ref: m.ref, text: "" })} style={{ padding: "8px 16px", borderRadius: 9, border: 0, background: "#1E7A5A", color: "#fff", fontWeight: 600, cursor: "pointer" }}>Ship it</button>
                              <button disabled={busy} onClick={() => send({ kind: "reject", ref: m.ref, text: "" })} style={{ padding: "8px 16px", borderRadius: 9, border: "1px solid #D8D2C8", background: "#fff", fontWeight: 600, cursor: "pointer" }}>Reject</button>
                            </>}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              );
            })}
            {typing.map(m => (
              <div key={m} style={{ display: "flex", gap: 12, alignItems: "center", color: "#8C8479", fontSize: 14 }}>
                <Avatar m={m} size={28} /> <span><b style={{ color: WHO[m].color }}>{WHO[m].name}</b> is typing<span className="team-dots">…</span></span>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <div style={{ position: "sticky", bottom: 0, background: "#F8F5F0", padding: "10px 0 14px", borderTop: "1px solid #E2DED6" }}>
            {err && <div style={{ color: "#C0392B", fontSize: 13, marginBottom: 6 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                placeholder={me === "ib" ? "Message Claude and Sam…" : me === "claude" ? "Message Ib and Sam…" : "Message Ib and Claude…"}
                style={{ flex: 1, resize: "vertical", minHeight: 48, maxHeight: 240, padding: "12px 14px", borderRadius: 12, border: "1px solid #D8D2C8", fontSize: 16, fontFamily: "inherit", background: "#fff" }} />
              <button onClick={submit} disabled={busy || !draft.trim()} style={{ padding: "13px 18px", borderRadius: 12, border: 0, background: draft.trim() ? "#14110E" : "#BDB6AB", color: "#fff", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>Send</button>
            </div>
            {me !== "ib" && (
              <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, color: "#5F5850", marginTop: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={asRequest} onChange={e => setAsRequest(e.target.checked)} /> Ask Ib to approve this
              </label>
            )}
          </div>
        </main>

        <aside className="team-side">
          {Approvals}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13.5, color: "#5F5850", lineHeight: 1.5 }}>
            <div style={{ fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "#8C8479" }}>How it works</div>
            <div><b style={{ color: WHO.ib.color }}>Ib</b> (CEO) sees everything, can jump in anytime and give either of us a task. Anything that changes the live site needs Ib's approval.</div>
            <div><b style={{ color: WHO.claude.color }}>Claude</b> answers instantly. When Ib approves a request, Claude builds it and posts a preview; Ib clicks Ship to put it live.</div>
            <div><b style={{ color: WHO.sam.color }}>Sam</b> posts from the share kit and asks for what social needs.</div>
            <div>Every change gets a preview first. Nothing goes live until Ib ships it.</div>
            <div style={{ color: "#8C8479" }}>Live: new messages appear within seconds.</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
