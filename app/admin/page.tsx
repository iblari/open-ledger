"use client";
import { useState } from "react";

/**
 * /admin — private stats page (not linked anywhere on the site).
 * Paste your ADMIN_KEY; it stays in this browser tab only (in-memory) and
 * is sent as a Bearer header to /api/admin/subscribers. Shows:
 *   - email subscribers (who, when, source) + CSV download
 *   - calendar-feed subscriber estimates (anonymous by nature)
 */

const T = {
  bg: "#f8f5f0", card: "#ffffff", ink: "#1a1a1a", sub: "#5c5856",
  mute: "#9a9490", rule: "#e2ded6", accent: "#b8372d",
};
const SANS = "'DM Sans', system-ui, sans-serif";

interface Subscriber { email: string; feedback: string; source: string; signed_up_at: string }
interface CalStats { uniqueClients30d: number; byClient: Record<string, number>; googleFetcherActive: boolean }

export default function AdminPage() {
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<{ count: number; subscribers: Subscriber[]; calendar?: CalStats } | null>(null);

  const load = async () => {
    setLoading(true); setError(""); setData(null);
    try {
      const r = await fetch("/api/admin/subscribers", {
        headers: { Authorization: `Bearer ${key.trim()}` },
      });
      if (r.status === 401) { setError("Wrong key."); return; }
      if (!r.ok) { setError(`Error ${r.status}`); return; }
      setData(await r.json());
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  };

  const CLIENT_NOTES: Record<string, string> = {
    apple: "Apple devices subscribed (each iPhone/Mac counts once)",
    google: "Google fetcher active — ≥1 Google Calendar subscriber (Google fetches once for ALL its users; exact count unknowable)",
    outlook: "Outlook clients",
    browser: "Browser clicks on the .ics link (not subscriptions)",
    other: "Other clients / probes",
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: SANS, padding: "40px 16px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, color: T.ink, marginBottom: 4 }}>Vote Unbiased — Admin</h1>
        <p style={{ fontSize: 12, color: T.mute, marginBottom: 20 }}>
          Private stats. Your key is only held in this tab and sent directly to your own API.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <input
            type="password"
            value={key}
            onChange={e => setKey(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && key.trim()) load(); }}
            placeholder="Paste ADMIN_KEY…"
            style={{
              flex: 1, padding: "10px 14px", borderRadius: 8, border: `1px solid ${T.rule}`,
              fontSize: 16, background: T.card, color: T.ink, outline: "none",
            }}
          />
          <button
            onClick={load}
            disabled={loading || !key.trim()}
            style={{
              background: T.ink, color: "#fff", border: "none", borderRadius: 8,
              padding: "10px 22px", fontSize: 13, fontWeight: 700,
              cursor: loading || !key.trim() ? "default" : "pointer",
              opacity: loading || !key.trim() ? 0.6 : 1,
            }}
          >
            {loading ? "Loading…" : "View stats"}
          </button>
        </div>

        {error && (
          <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#991b1b", marginBottom: 16 }}>
            {error}
          </div>
        )}

        {data && (
          <>
            {/* Calendar subscribers */}
            <div style={{ background: T.card, border: `1px solid ${T.rule}`, borderRadius: 10, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: T.mute, marginBottom: 10 }}>
                Broadcast calendar subscribers <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(anonymous by nature — counts, not names)</span>
              </div>
              <div style={{ fontSize: 30, fontWeight: 800, color: T.ink, marginBottom: 10 }}>
                {data.calendar?.uniqueClients30d ?? 0}
                <span style={{ fontSize: 12, fontWeight: 400, color: T.mute }}> distinct clients · 30 days</span>
              </div>
              {data.calendar && Object.entries(data.calendar.byClient).map(([cls, n]) => (
                <div key={cls} style={{ fontSize: 12.5, color: T.sub, marginBottom: 4 }}>
                  <strong style={{ color: T.ink }}>{cls}: {n}</strong>
                  <span style={{ color: T.mute }}> — {CLIENT_NOTES[cls] || ""}</span>
                </div>
              ))}
            </div>

            {/* Email subscribers */}
            <div style={{ background: T.card, border: `1px solid ${T.rule}`, borderRadius: 10, padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: T.mute }}>
                  Email subscribers — {data.count}
                </div>
                <button
                  onClick={async () => {
                    const r = await fetch("/api/admin/subscribers?format=csv", { headers: { Authorization: `Bearer ${key.trim()}` } });
                    const blob = await r.blob();
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = "voteunbiased-subscribers.csv";
                    a.click();
                  }}
                  style={{ background: "none", border: `1px solid ${T.rule}`, borderRadius: 6, padding: "4px 12px", fontSize: 11, fontWeight: 600, color: T.sub, cursor: "pointer" }}
                >
                  Download CSV
                </button>
              </div>
              {data.subscribers.length === 0 && <div style={{ fontSize: 13, color: T.mute }}>No subscribers yet.</div>}
              {data.subscribers.map((s, i) => (
                <div key={i} style={{ padding: "8px 0", borderTop: i > 0 ? `1px solid ${T.rule}` : "none", fontSize: 13 }}>
                  <strong style={{ color: T.ink }}>{s.email}</strong>
                  <span style={{ color: T.mute }}> · {new Date(s.signed_up_at).toLocaleDateString()} · {s.source}</span>
                  {s.feedback && <div style={{ fontSize: 12, color: T.sub }}>feedback: {s.feedback}</div>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
