"use client";
import { useEffect, useState } from "react";

// Design tokens
const T = {
  card: "#ffffff",
  ink: "#1a1a1a",
  sub: "#5c5856",
  mute: "#9a9490",
  rule: "#e2ded6",
  accent: "#b8372d",
  paper: "#f3ede5",
  success: "#16a34a",
};

type Feedback = "yes" | "meh" | "no" | null;

const DISMISS_KEY = "vu_banner_dismissed";

export default function FeedbackBanner() {
  const [mounted, setMounted] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [closing, setClosing] = useState(false);
  const [stage, setStage] = useState<1 | 2>(1);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [feedbackPopping, setFeedbackPopping] = useState(false);
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check dismissed-state on mount
  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
    } catch {}
  }, []);

  // Scroll trigger — show when past 60% of the page
  useEffect(() => {
    if (dismissed || submitted) return;
    const onScroll = () => {
      const denom = document.documentElement.scrollHeight - window.innerHeight;
      if (denom <= 0) return;
      const pct = window.scrollY / denom;
      if (pct > 0.6) {
        setShowBanner(true);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // Run once on mount — handle the case where the page is short enough to already be scrolled past 60%
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [dismissed, submitted]);

  const dismiss = () => {
    setClosing(true);
    try { window.localStorage.setItem(DISMISS_KEY, "1"); } catch {}
    setTimeout(() => {
      setDismissed(true);
      setShowBanner(false);
      setClosing(false);
    }, 280);
  };

  const saveFeedback = async (val: Feedback) => {
    if (!val || feedback) return; // don't double-submit
    setFeedback(val);
    setFeedbackPopping(true);
    // fire-and-forget; don't block UX on network
    fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "", feedback: val, source: "banner-feedback" }),
    }).catch(() => {});
    // After a short beat, advance to stage 2
    setTimeout(() => setStage(2), 1200);
  };

  const handleSubscribe = async () => {
    if (!email.includes("@") || loading) return;
    setLoading(true);
    try {
      await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, feedback: feedback || "", source: "banner" }),
      });
    } catch {}
    setSubmitted(true);
    setLoading(false);
    // Auto-hide after 3s
    setTimeout(() => {
      setClosing(true);
      try { window.localStorage.setItem(DISMISS_KEY, "1"); } catch {}
      setTimeout(() => {
        setShowBanner(false);
        setDismissed(true);
        setClosing(false);
      }, 280);
    }, 3000);
  };

  if (!mounted || !showBanner || dismissed) return null;

  const emailValid = email.includes("@");

  return (
    <>
      <style>{`
        @keyframes vuBannerSlideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes vuBannerFadeOut {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(20px); }
        }
        @keyframes vuCheckPop {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.4); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes vuExpandIn {
          from { opacity: 0; max-height: 0; margin-top: 0; }
          to { opacity: 1; max-height: 120px; margin-top: 12px; }
        }
        .vu-banner-wrap {
          animation: vuBannerSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .vu-banner-closing {
          animation: vuBannerFadeOut 0.28s ease forwards !important;
        }
        .vu-check-pop {
          animation: vuCheckPop 0.3s ease forwards;
        }
        .vu-expand-in {
          animation: vuExpandIn 0.35s ease forwards;
          overflow: hidden;
        }
        @media (max-width: 480px) {
          .vu-banner-card { max-width: 100% !important; border-radius: 12px 12px 0 0 !important; padding: 12px 14px !important; }
          .vu-banner-row1 { flex-wrap: wrap; gap: 8px !important; }
          .vu-banner-email-row { flex-direction: column !important; align-items: stretch !important; gap: 8px !important; }
          .vu-banner-email-row input, .vu-banner-email-row button { width: 100% !important; }
        }
      `}</style>
      <div
        className={`vu-banner-wrap${closing ? " vu-banner-closing" : ""}`}
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 999,
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <div
          className="vu-banner-card"
          style={{
            background: T.card,
            borderTop: `1px solid ${T.rule}`,
            boxShadow: "0 -4px 24px rgba(0,0,0,0.08)",
            borderRadius: "12px 12px 0 0",
            padding: stage === 1 ? "14px 20px" : "16px 20px",
            maxWidth: 520,
            width: "100%",
            pointerEvents: "auto",
            transition: "padding 0.3s ease",
          }}
        >
          {submitted ? (
            <div style={{
              textAlign: "center",
              fontFamily: "'DM Sans',sans-serif",
              fontSize: 13,
              fontWeight: 600,
              color: T.success,
              padding: "4px 0",
            }}>
              ✓ You're in — data updates only, no spam.
            </div>
          ) : (
            <>
              {/* Row 1: Feedback */}
              <div
                className="vu-banner-row1"
                style={{ display: "flex", alignItems: "center", gap: 12 }}
              >
                <span style={{
                  fontFamily: "'Source Serif 4', Georgia, serif",
                  fontSize: 14, fontWeight: 700, color: T.ink,
                  whiteSpace: "nowrap",
                }}>
                  {feedback ? "Thanks!" : "Useful?"}
                </span>

                <div style={{ display: "flex", gap: 5, flex: 1, flexWrap: "wrap" }}>
                  {(([
                    ["yes", "👍", "Yes"],
                    ["meh", "🤔", "Meh"],
                    ["no", "👎", "No"],
                  ] as const)).map(([val, emoji, label]) => {
                    const selected = feedback === val;
                    return (
                      <button
                        key={val}
                        onClick={() => saveFeedback(val)}
                        disabled={!!feedback}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 6,
                          border: `1.5px solid ${selected ? T.accent : T.rule}`,
                          background: selected ? `${T.accent}12` : T.paper,
                          color: selected ? T.accent : T.ink,
                          fontFamily: "'DM Sans',sans-serif",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: feedback ? "default" : "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          transition: "all 0.15s ease",
                        }}
                      >
                        <span style={{ fontSize: 13 }}>{emoji}</span>
                        <span>{label}</span>
                        {selected && feedbackPopping && (
                          <span
                            className="vu-check-pop"
                            style={{
                              marginLeft: 4,
                              color: T.success,
                              fontWeight: 700,
                              display: "inline-block",
                            }}
                          >✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={dismiss}
                  aria-label="Close"
                  style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: T.paper, border: "none", color: T.mute,
                    fontSize: 10, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, lineHeight: 1,
                  }}
                >×</button>
              </div>

              {/* Row 2: Email — only after feedback is tapped */}
              {stage === 2 && (
                <div className="vu-expand-in">
                  <div
                    className="vu-banner-email-row"
                    style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}
                  >
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSubscribe(); }}
                      placeholder="Get notified when we add new data — enter email"
                      disabled={loading}
                      style={{
                        flex: 1,
                        padding: "9px 12px",
                        borderRadius: 6,
                        border: `1.5px solid ${T.rule}`,
                        background: T.paper,
                        fontFamily: "'DM Sans',sans-serif",
                        fontSize: 12,
                        color: T.ink,
                        outline: "none",
                        minWidth: 0,
                      }}
                    />
                    <button
                      onClick={handleSubscribe}
                      disabled={!emailValid || loading}
                      style={{
                        padding: "9px 16px",
                        borderRadius: 6,
                        background: T.accent,
                        color: "#fff",
                        border: "none",
                        fontFamily: "'DM Sans',sans-serif",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: emailValid && !loading ? "pointer" : "default",
                        opacity: emailValid ? (loading ? 0.7 : 1) : 0.4,
                        whiteSpace: "nowrap",
                        transition: "opacity 0.2s ease",
                      }}
                    >{loading ? "…" : "Subscribe"}</button>
                  </div>
                  <div style={{
                    fontFamily: "'DM Sans',sans-serif",
                    fontSize: 9,
                    color: T.mute,
                    marginTop: 8,
                    textAlign: "center",
                  }}>
                    No spam ever. Just data updates. Skip this if you prefer.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
