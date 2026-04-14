"use client";
import { useEffect, useState } from "react";

// ── Design tokens (matching main site) ──
const T = {
  bg: "#f8f5f0",
  card: "#ffffff",
  ink: "#1a1a1a",
  sub: "#5c5856",
  mute: "#9a9490",
  rule: "#e2ded6",
  accent: "#b8372d",
  paper: "#f3ede5",
};

type Feedback = "yes" | "somewhat" | "no" | null;

export default function EmailCapturePopup() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Only show once per visitor — check localStorage safely
  useEffect(() => {
    setMounted(true);
    try {
      if (typeof window !== "undefined" && window.localStorage.getItem("vu_popup_seen") === "1") {
        setDismissed(true);
        return;
      }
    } catch {}
    const t = setTimeout(() => setShow(true), 20000);
    return () => clearTimeout(t);
  }, []);

  const markSeen = () => {
    try {
      if (typeof window !== "undefined") window.localStorage.setItem("vu_popup_seen", "1");
    } catch {}
  };

  const close = () => {
    setDismissed(true);
    setShow(false);
    markSeen();
  };

  // Auto-save feedback when user taps a button — no email required
  const saveFeedback = async (val: Feedback) => {
    if (!val) return;
    try {
      await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "", feedback: val, source: "popup-feedback" }),
      });
      setFeedbackSaved(true);
    } catch {
      // Silently fail — feedback is optional and we don't want to block UX
    }
  };

  const submit = async () => {
    setErr(null);
    // Email is required for the subscribe action (feedback has its own save path)
    if (!email.trim()) {
      setErr("Please enter your email.");
      return;
    }
    if (!email.includes("@") || !email.includes(".")) {
      setErr("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          // Include feedback only if it wasn't already auto-saved
          feedback: feedbackSaved ? null : feedback,
          source: "popup",
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setErr(data.error || "Something went wrong. Try again?");
        setLoading(false);
        return;
      }
      setSubmitted(true);
      setLoading(false);
      markSeen();
    } catch {
      setErr("Network error. Please try again.");
      setLoading(false);
    }
  };

  if (!mounted || !show || dismissed) return null;

  return (
    <>
      <style>{`
        @keyframes vuPopupFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes vuPopupSlide {
          from { opacity: 0; transform: translateY(20px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .vu-popup-overlay {
          animation: vuPopupFade 0.3s ease forwards;
        }
        .vu-popup-card {
          animation: vuPopupSlide 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @media (max-width: 600px) {
          .vu-popup-card { max-width: calc(100vw - 24px) !important; }
          .vu-popup-inner { padding: 28px 20px !important; }
          .vu-popup-fb-grid { grid-template-columns: 1fr !important; }
          .vu-popup-email-row { flex-direction: column !important; }
          .vu-popup-email-row input, .vu-popup-email-row button { width: 100% !important; }
        }
      `}</style>
      <div
        className="vu-popup-overlay"
        onClick={close}
        style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(26,26,26,0.55)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20,
        }}
      >
        <div
          className="vu-popup-card"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: T.card,
            borderRadius: 16,
            maxWidth: 480,
            width: "100%",
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
          }}
        >
          {/* Accent gradient bar at top */}
          <div style={{
            height: 4,
            background: `linear-gradient(90deg, ${T.accent} 0%, #d4583f 50%, ${T.accent} 100%)`,
          }} />

          {/* Close button */}
          <button
            onClick={close}
            aria-label="Close"
            style={{
              position: "absolute", top: 16, right: 16, zIndex: 2,
              width: 32, height: 32, borderRadius: "50%",
              background: T.paper, border: `1px solid ${T.rule}`,
              color: T.sub, fontSize: 16, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'DM Sans',sans-serif", fontWeight: 400, lineHeight: 1,
            }}
          >×</button>

          <div className="vu-popup-inner" style={{ padding: "32px 32px 28px" }}>
            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              <div style={{ display: "flex", gap: 2 }}>
                <div style={{ width: 3, height: 14, background: T.accent, borderRadius: 1 }} />
                <div style={{ width: 3, height: 14, background: T.accent, borderRadius: 1, opacity: 0.65 }} />
                <div style={{ width: 3, height: 14, background: T.accent, borderRadius: 1, opacity: 0.35 }} />
              </div>
              <span style={{
                fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 800,
                letterSpacing: 2, textTransform: "uppercase", color: T.sub,
              }}>Vote Unbiased</span>
            </div>

            {submitted ? (
              // ── Success state ──
              <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
                <div style={{ fontSize: 44, marginBottom: 14 }}>🎉</div>
                <h2 style={{
                  fontFamily: "'Source Serif 4', Georgia, serif",
                  fontSize: 22, fontWeight: 900,
                  color: T.ink, margin: "0 0 10px", lineHeight: 1.2,
                }}>You're in.</h2>
                <p style={{
                  fontFamily: "'DM Sans',sans-serif", fontSize: 13,
                  color: T.sub, lineHeight: 1.6, margin: "0 0 20px",
                }}>
                  We'll send you updates when new data drops. No noise, just numbers.
                </p>
                {feedback && (
                  <div style={{
                    background: T.paper, border: `1px solid ${T.rule}`,
                    borderRadius: 8, padding: "10px 14px", marginBottom: 20,
                    fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: T.sub,
                  }}>
                    Thanks for the feedback: <strong style={{ color: T.ink }}>
                      {feedback === "yes" ? "👍 Yes!" : feedback === "somewhat" ? "🤔 Somewhat" : "👎 Not really"}
                    </strong>
                  </div>
                )}
                <button
                  onClick={close}
                  style={{
                    background: T.ink, color: "#fff", border: "none",
                    padding: "11px 22px", borderRadius: 8, cursor: "pointer",
                    fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600,
                  }}
                >Back to the data</button>
              </div>
            ) : (
              <>
                {/* Headline */}
                <h2 style={{
                  fontFamily: "'Source Serif 4', Georgia, serif",
                  fontSize: 22, fontWeight: 900,
                  color: T.ink, margin: "0 0 22px", lineHeight: 1.25,
                }}>
                  Did you find this <span style={{ color: T.accent }}>useful?</span>
                </h2>

                {/* ── Feedback section ── */}
                <div style={{ marginBottom: 22 }}>
                  <div style={{
                    fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700,
                    letterSpacing: 1, textTransform: "uppercase", color: T.mute,
                    marginBottom: 10,
                  }}>Was this helpful?</div>
                  <div className="vu-popup-fb-grid" style={{
                    display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8,
                  }}>
                    {(([
                      ["yes", "👍", "Yes!"],
                      ["somewhat", "🤔", "Somewhat"],
                      ["no", "👎", "Not really"],
                    ] as const)).map(([val, emoji, label]) => {
                      const selected = feedback === val;
                      return (
                        <button
                          key={val}
                          onClick={() => {
                            if (selected) {
                              setFeedback(null);
                            } else {
                              setFeedback(val);
                              saveFeedback(val);
                            }
                          }}
                          style={{
                            background: selected ? `${T.accent}0D` : T.paper,
                            border: `1.5px solid ${selected ? T.accent : T.rule}`,
                            borderRadius: 20,
                            padding: "10px 8px",
                            cursor: "pointer",
                            fontFamily: "'DM Sans',sans-serif",
                            fontSize: 12, fontWeight: 600,
                            color: selected ? T.accent : T.ink,
                            transition: "all 0.15s ease",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                          }}
                        >
                          <span style={{ fontSize: 14 }}>{emoji}</span>
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {feedbackSaved && (
                    <div style={{
                      fontFamily: "'DM Sans',sans-serif", fontSize: 11,
                      color: "#1D9E75", marginTop: 10, textAlign: "center",
                      fontWeight: 600,
                    }}>✓ Thanks — feedback saved</div>
                  )}
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: T.rule, margin: "22px 0" }} />

                {/* ── Email section ── */}
                <div>
                  <div style={{
                    fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700,
                    letterSpacing: 1, textTransform: "uppercase", color: T.mute,
                    marginBottom: 10,
                  }}>Stay informed</div>
                  <p style={{
                    fontFamily: "'DM Sans',sans-serif", fontSize: 12.5,
                    color: T.sub, lineHeight: 1.6, margin: "0 0 14px",
                  }}>
                    Get notified when we add new metrics, presidents, or features. No spam — data updates only.
                  </p>
                  <div className="vu-popup-email-row" style={{ display: "flex", gap: 8 }}>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); if (err) setErr(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                      placeholder="you@example.com"
                      disabled={loading}
                      style={{
                        flex: 1,
                        background: T.paper,
                        border: `1.5px solid ${err ? T.accent : T.rule}`,
                        borderRadius: 8,
                        padding: "10px 14px",
                        fontFamily: "'DM Sans',sans-serif",
                        fontSize: 13,
                        color: T.ink,
                        outline: "none",
                        transition: "border-color 0.15s",
                      }}
                    />
                    <button
                      onClick={submit}
                      disabled={loading}
                      style={{
                        background: T.accent,
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        padding: "10px 20px",
                        cursor: loading ? "default" : "pointer",
                        fontFamily: "'DM Sans',sans-serif",
                        fontSize: 13,
                        fontWeight: 700,
                        opacity: loading ? 0.7 : 1,
                        whiteSpace: "nowrap",
                      }}
                    >{loading ? "…" : "Subscribe"}</button>
                  </div>
                  {err && (
                    <div style={{
                      fontFamily: "'DM Sans',sans-serif", fontSize: 11,
                      color: T.accent, marginTop: 8,
                    }}>{err}</div>
                  )}
                  <div style={{
                    fontFamily: "'DM Sans',sans-serif", fontSize: 10,
                    color: T.mute, marginTop: 14, textAlign: "center",
                  }}>
                    No spam. Unsubscribe anytime. We respect your data.
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
