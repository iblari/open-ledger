"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

/* ── Design Tokens (matching dashboard) ───────────────────────── */
const T = {
  bg: "#f8f5f0", card: "#ffffff", ink: "#1a1a1a", sub: "#5c5856",
  mute: "#9a9490", rule: "#e2ded6", accent: "#b8372d", gold: "#a67c00",
  blue: "#1d4ed8", paper: "#f3ede5", highlight: "#fef9e7",
};

const RATING_COLORS: Record<string, { bg: string; text: string }> = {
  TRUE:         { bg: "#0d7377", text: "#fff" },
  "MOSTLY TRUE":{ bg: "#16a34a", text: "#fff" },
  MISLEADING:   { bg: "#ca8a04", text: "#fff" },
  FALSE:        { bg: "#c2410c", text: "#fff" },
  UNVERIFIABLE: { bg: "#9a9490", text: "#fff" },
};

/* ── Source URL map — where users can verify data ─────────────── */
const SOURCE_URLS: Record<string, { label: string; url: string }> = {
  BLS:      { label: "Bureau of Labor Statistics", url: "https://www.bls.gov/data/" },
  BEA:      { label: "Bureau of Economic Analysis", url: "https://www.bea.gov/data" },
  Treasury: { label: "U.S. Treasury", url: "https://fiscaldata.treasury.gov/" },
  CBO:      { label: "Congressional Budget Office", url: "https://www.cbo.gov/data/budget-economic-data" },
  FRED:     { label: "Federal Reserve (FRED)", url: "https://fred.stlouisfed.org/" },
  Census:   { label: "U.S. Census Bureau", url: "https://www.census.gov/data.html" },
  CMS:      { label: "Centers for Medicare & Medicaid", url: "https://data.cms.gov/" },
  IMF:      { label: "International Monetary Fund", url: "https://www.imf.org/en/Data" },
};

function detectSources(text: string): { label: string; url: string }[] {
  const found: { label: string; url: string }[] = [];
  for (const [key, val] of Object.entries(SOURCE_URLS)) {
    if (text.includes(key)) found.push(val);
  }
  return found;
}

/* ── Types ────────────────────────────────────────────────────── */
interface Claim {
  id: string;
  quote: string;
  rating: string;
  actual: string;
  explanation: string;
  timestamp: string;
  videoTime?: number; // seconds into the video
}

interface LiveConfig {
  status: "live" | "off";
  title: string;
  source: string;
  videoId: string;
  startedAt: string;
  upcoming: { title: string; date: string; source: string }[];
  recent: {
    title: string; videoId: string; duration: string;
    claims: number; date: string; isDemo?: boolean;
    scores: Record<string, number>;
  }[];
}

interface DemoSegment {
  time: number; text: string;
  claims?: { quote: string; rating: string; actual: string; explanation: string }[];
}

interface DemoSpeech {
  title: string; speaker: string; date: string;
  videoId: string; duration: string;
  segments: DemoSegment[];
}

/* ── Responsive hook ──────────────────────────────────────────── */
function useIsMobile() {
  const [mob, setMob] = useState(false);
  useEffect(() => {
    const check = () => setMob(window.innerWidth < 768);
    check(); window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mob;
}

/* ── Format seconds as mm:ss ──────────────────────────────────── */
function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ── Fact-Check Card ──────────────────────────────────────────── */
function FactCard({ claim, isNew, onSeek }: { claim: Claim; isNew: boolean; onSeek?: (t: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const rc = RATING_COLORS[claim.rating] || RATING_COLORS.UNVERIFIABLE;
  const sources = detectSources(claim.actual);

  return (
    <div
      style={{
        background: T.card, border: `1px solid ${T.rule}`, borderRadius: 10,
        padding: "12px 14px", marginBottom: 8,
        borderLeft: `4px solid ${rc.bg}`,
        animation: isNew ? "cardSlideIn 0.3s ease" : "none",
        cursor: "pointer",
      }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header: rating badge + video timestamp */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{
          padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
          background: rc.bg, color: rc.text, letterSpacing: 0.5,
        }}>{claim.rating}</span>
        {claim.videoTime != null && claim.videoTime > 0 ? (
          <button
            onClick={(e) => { e.stopPropagation(); onSeek?.(claim.videoTime!); }}
            style={{
              fontSize: 10, color: T.blue, background: "none", border: "none",
              cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 600,
              padding: "2px 6px", borderRadius: 4,
              display: "flex", alignItems: "center", gap: 3,
            }}
            title="Jump to this moment in the video"
          >
            ▶ {fmtTime(claim.videoTime)}
          </button>
        ) : (
          <span style={{ fontSize: 10, color: T.mute }}>
            {new Date(claim.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      {/* Quote */}
      <div style={{
        fontSize: 13, fontWeight: 600, color: T.ink, marginBottom: 6,
        fontStyle: "italic", fontFamily: "'Source Serif 4',serif", lineHeight: 1.4,
      }}>
        &ldquo;{claim.quote}&rdquo;
      </div>

      {/* Actual data */}
      <div style={{ fontSize: 11, color: T.sub, marginBottom: 4, lineHeight: 1.5 }}>
        <strong>Actual:</strong> {claim.actual}
      </div>

      {/* Explanation */}
      <div style={{ fontSize: 11, color: T.mute, lineHeight: 1.4 }}>
        {claim.explanation}
      </div>

      {/* Expanded: source links */}
      {expanded && sources.length > 0 && (
        <div style={{
          marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.rule}`,
          display: "flex", flexWrap: "wrap", gap: 6,
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: T.mute, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Verify:
          </span>
          {sources.map((src, i) => (
            <a
              key={i}
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                fontSize: 10, color: T.blue, textDecoration: "none", fontWeight: 600,
                fontFamily: "'DM Sans',sans-serif",
                padding: "2px 8px", background: T.blue + "0a", borderRadius: 4,
                border: `1px solid ${T.blue}20`,
              }}
            >
              {src.label} ↗
            </a>
          ))}
        </div>
      )}

      {/* "tap to expand" hint */}
      {!expanded && sources.length > 0 && (
        <div style={{ fontSize: 9, color: T.mute, marginTop: 6, opacity: 0.6 }}>
          Tap to see sources
        </div>
      )}
    </div>
  );
}

/* ── Summary Bar ──────────────────────────────────────────────── */
function SummaryBar({ claims }: { claims: Claim[] }) {
  const counts: Record<string, number> = {};
  claims.forEach(c => { counts[c.rating] = (counts[c.rating] || 0) + 1; });
  const total = claims.length;
  const trueish = (counts["TRUE"] || 0) + (counts["MOSTLY TRUE"] || 0);
  const accuracy = total > 0 ? Math.round((trueish / total) * 100) : 0;

  return (
    <div style={{
      background: T.card, border: `1px solid ${T.rule}`, borderRadius: 8,
      padding: "10px 14px", fontFamily: "'DM Sans',sans-serif",
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: T.mute, marginBottom: 6 }}>
        Session Summary
      </div>
      {total > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{
              flex: 1, height: 6, background: T.rule, borderRadius: 3, overflow: "hidden",
            }}>
              <div style={{
                width: `${accuracy}%`, height: "100%", borderRadius: 3,
                background: accuracy >= 70 ? "#0d7377" : accuracy >= 40 ? "#ca8a04" : "#c2410c",
              }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{accuracy}%</span>
          </div>
          <div style={{ fontSize: 9, color: T.mute }}>Accuracy Score</div>
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {Object.entries(RATING_COLORS).map(([rating, colors]) => {
          const count = counts[rating] || 0;
          if (count === 0) return null;
          return (
            <span key={rating} style={{
              fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 4,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: 2, background: colors.bg, flexShrink: 0,
              }} />
              <span style={{ color: T.sub }}>{rating}:</span>
              <span style={{ color: T.ink }}>{count}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────── */
export default function LiveFactCheckPage() {
  const mob = useIsMobile();

  /* ── State ── */
  const [config, setConfig] = useState<LiveConfig | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [videoId, setVideoId] = useState("");
  const [title, setTitle] = useState("");
  const [claims, setClaims] = useState<Claim[]>([]);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [micError, setMicError] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [newClaimIds, setNewClaimIds] = useState<Set<string>>(new Set());

  const bufferRef = useRef("");
  const contextRef = useRef("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const demoAbortRef = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const demoStartTime = useRef(0);
  const shownSegmentsRef = useRef<Set<number>>(new Set());
  const demoSpeechRef = useRef<DemoSpeech | null>(null);
  const videoTimeRef = useRef(0);

  /* ── YouTube seek via postMessage ── */
  const seekVideo = useCallback((seconds: number) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: "command", func: "seekTo", args: [seconds, true] }),
        "*"
      );
    }
  }, []);

  /* ── Load config on mount ── */
  useEffect(() => {
    fetch("/live-config.json")
      .then(r => r.json())
      .then(setConfig)
      .catch(() => {});
  }, []);

  /* ── Animate new claims ── */
  useEffect(() => {
    if (newClaimIds.size === 0) return;
    const timer = setTimeout(() => setNewClaimIds(new Set()), 500);
    return () => clearTimeout(timer);
  }, [newClaimIds]);

  /* ── Fact-check buffer processor ── */
  const processBuffer = useCallback(async () => {
    const text = bufferRef.current.trim();
    if (text.length < 30) return;
    bufferRef.current = "";

    try {
      const res = await fetch("/api/live-fact-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, context: contextRef.current }),
      });
      const data = await res.json();
      contextRef.current = (contextRef.current + " " + text).slice(-500);

      if (data.claims?.length > 0) {
        const elapsed = Math.floor((Date.now() - demoStartTime.current) / 1000);
        const enriched = data.claims.map((c: Claim) => ({ ...c, videoTime: elapsed }));
        const ids = new Set(enriched.map((c: Claim) => c.id));
        setNewClaimIds(ids);
        setClaims(prev => [...enriched, ...prev]);
      }
    } catch (e) {
      console.error("Fact-check error:", e);
    }
  }, []);

  /* ── 15-second buffer interval ── */
  useEffect(() => {
    if (!isPlaying || isDemo) return;
    const interval = setInterval(processBuffer, 15000);
    return () => clearInterval(interval);
  }, [isPlaying, isDemo, processBuffer]);

  /* ── Web Speech API ── */
  const startMicListening = useCallback(() => {
    const SR = (window as unknown as { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition
      || (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    if (!SR) {
      setMicError("Your browser does not support speech recognition. Try Chrome.");
      return;
    }

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript;
        }
      }
      if (finalText) {
        bufferRef.current += " " + finalText;
        setLiveTranscript(prev => prev + " " + finalText);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "not-allowed") {
        setMicError("Microphone access denied. Please allow mic access and try again.");
      }
    };

    recognition.onend = () => {
      if (isPlaying) {
        try { recognition.start(); } catch {}
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
      setMicError("");
    } catch {
      setMicError("Could not start speech recognition.");
    }
  }, [isPlaying]);

  const stopMicListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  /* ── Start live broadcast ── */
  const startLive = useCallback((vid: string, broadcastTitle: string) => {
    setVideoId(vid);
    setTitle(broadcastTitle);
    setIsPlaying(true);
    setIsDemo(false);
    setClaims([]);
    setLiveTranscript("");
    setShowSummary(false);
    bufferRef.current = "";
    contextRef.current = "";
    demoStartTime.current = Date.now();
    setTimeout(() => startMicListening(), 1000);
  }, [startMicListening]);

  /* ── Listen for YouTube player time updates via postMessage ── */
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (typeof event.data !== "string") return;
      try {
        const data = JSON.parse(event.data);
        if (data.event === "infoDelivery" && data.info?.currentTime != null) {
          videoTimeRef.current = data.info.currentTime;
        }
      } catch {}
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  /* ── Trigger claims based on video playback position ── */
  useEffect(() => {
    if (!isDemo || !isPlaying) return;
    const speech = demoSpeechRef.current;
    if (!speech) return;

    const CLAIM_DELAY = 4; // seconds after segment timestamp to show claim

    const interval = setInterval(() => {
      if (demoAbortRef.current) return;
      const vt = videoTimeRef.current;

      // Update transcript — show text for the latest segment we've reached
      let latestSegIdx = -1;
      for (let i = speech.segments.length - 1; i >= 0; i--) {
        if (vt >= speech.segments[i].time) { latestSegIdx = i; break; }
      }
      if (latestSegIdx >= 0) {
        const recentSegs = speech.segments
          .filter((_, i) => i <= latestSegIdx)
          .slice(-3)
          .map(s => s.text);
        setLiveTranscript(recentSegs.join(" "));
      }

      // Check each segment — show claims CLAIM_DELAY seconds after the segment time
      for (let si = 0; si < speech.segments.length; si++) {
        const segment = speech.segments[si];
        if (shownSegmentsRef.current.has(si)) continue;
        if (!segment.claims || segment.claims.length === 0) {
          // Mark no-claim segments as shown when we pass them
          if (vt >= segment.time) shownSegmentsRef.current.add(si);
          continue;
        }
        // Show claims CLAIM_DELAY seconds after the claim was spoken
        if (vt >= segment.time + CLAIM_DELAY) {
          shownSegmentsRef.current.add(si);
          // Add all claims from this segment
          const newClaims: Claim[] = segment.claims.map((c, ci) => ({
            ...c,
            timestamp: new Date().toISOString(),
            id: `claim-${si}-${ci}-${Date.now()}`,
            videoTime: segment.time,
          }));
          const ids = new Set(newClaims.map(c => c.id));
          setNewClaimIds(ids);
          setClaims(prev => [...newClaims, ...prev]);
        }
      }

      // If all segments shown, trigger summary
      const allShown = speech.segments.every((_, i) => shownSegmentsRef.current.has(i));
      if (allShown && vt >= speech.segments[speech.segments.length - 1].time) {
        setShowSummary(true);
      }
    }, 500); // poll every 500ms

    return () => clearInterval(interval);
  }, [isDemo, isPlaying]);

  /* ── Demo mode — video-time-synced ── */
  const startDemo = useCallback(async () => {
    demoAbortRef.current = false;
    shownSegmentsRef.current = new Set();
    setIsDemo(true);
    setIsPlaying(true);
    setClaims([]);
    setLiveTranscript("");
    setShowSummary(false);
    bufferRef.current = "";
    contextRef.current = "";
    videoTimeRef.current = 0;

    try {
      const res = await fetch("/speeches/sotu-2024.json");
      const speech: DemoSpeech = await res.json();
      demoSpeechRef.current = speech;
      setVideoId(speech.videoId);
      setTitle(`DEMO — ${speech.title}, ${speech.date}`);
      demoStartTime.current = Date.now();

      // Start listening to YouTube player time updates
      // The iframe will send infoDelivery events once we post "listening"
      const waitForIframe = () => {
        setTimeout(() => {
          if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage(
              JSON.stringify({ event: "listening" }),
              "*"
            );
          }
        }, 2000);
      };
      waitForIframe();
    } catch (e) {
      console.error("Demo error:", e);
    }
  }, []);

  /* ── Stop ── */
  const stopSession = useCallback(() => {
    demoAbortRef.current = true;
    setIsPlaying(false);
    setIsDemo(false);
    stopMicListening();
    shownSegmentsRef.current = new Set();
    demoSpeechRef.current = null;
    if (claims.length > 0) setShowSummary(true);
  }, [claims.length, stopMicListening]);

  /* ── Share ── */
  const shareResults = useCallback(() => {
    const total = claims.length;
    const counts: Record<string, number> = {};
    claims.forEach(c => { counts[c.rating] = (counts[c.rating] || 0) + 1; });
    const trueish = (counts["TRUE"] || 0) + (counts["MOSTLY TRUE"] || 0);
    const accuracy = total > 0 ? Math.round((trueish / total) * 100) : 0;

    const text = `Live Fact-Check: ${accuracy}% accuracy on economic claims. ${counts["TRUE"] || 0} True, ${counts["MOSTLY TRUE"] || 0} Mostly True, ${counts["MISLEADING"] || 0} Misleading, ${counts["FALSE"] || 0} False. Watch → voteunbiased.org/live`;

    if (navigator.share) {
      navigator.share({ title: "Vote Unbiased — Live Fact-Check", text, url: "https://voteunbiased.org/live" });
    } else {
      navigator.clipboard.writeText(text);
    }
  }, [claims]);

  /* ── Time helpers ── */
  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just started";
    if (mins < 60) return `Started ${mins} min ago`;
    return `Started ${Math.floor(mins / 60)}h ago`;
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  };

  /* ── Render ── */
  return (
    <div style={{ minHeight: "100vh", background: T.bg }}>
      {/* CSS Animations */}
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes cardSlideIn { from{transform:translateX(20px);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;600;700;900&family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
      `}</style>

      {/* ── Nav Bar ── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 50, background: T.card + "ee",
        backdropFilter: "blur(12px)", borderBottom: `1px solid ${T.rule}`,
        padding: mob ? "10px 16px" : "12px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <Link href="/" style={{
          fontFamily: "'Source Serif 4',serif", fontSize: mob ? 14 : 16,
          fontWeight: 900, color: T.ink, textDecoration: "none",
        }}>
          Vote Unbiased
        </Link>
        <div style={{ display: "flex", gap: mob ? 12 : 20, fontFamily: "'DM Sans',sans-serif", fontSize: mob ? 11 : 13 }}>
          <Link href="/dashboard" style={{ color: T.sub, textDecoration: "none", fontWeight: 500 }}>Data</Link>
          <Link href="/dashboard?tab=scenarios" style={{ color: T.sub, textDecoration: "none", fontWeight: 500 }}>Scenarios</Link>
          <Link href="/live" style={{
            color: T.accent, textDecoration: "none", fontWeight: 700,
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%", background: "#dc2626",
              animation: config?.status === "live" ? "pulse 2s infinite" : "none",
            }} />
            Live
          </Link>
        </div>
      </nav>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: mob ? "16px" : "24px 32px" }}>

        {/* ── Idle State: not playing ── */}
        {!isPlaying && !showSummary && (
          <div>
            {/* Hero */}
            <div style={{ textAlign: "center", marginBottom: mob ? 24 : 40, padding: mob ? "16px 0" : "32px 0" }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 12,
                background: T.accent + "12", padding: "6px 16px", borderRadius: 20,
                fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700, color: T.accent,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#dc2626" }} />
                LIVE FACT-CHECK
              </div>
              <h1 style={{
                fontFamily: "'Source Serif 4',serif", fontSize: mob ? 28 : 44, fontWeight: 900,
                color: T.ink, marginBottom: 12, lineHeight: 1.15,
              }}>
                Watch. Listen. Verify.
              </h1>
              <p style={{
                fontFamily: "'DM Sans',sans-serif", fontSize: mob ? 14 : 16, color: T.sub,
                maxWidth: 520, margin: "0 auto", lineHeight: 1.6,
              }}>
                Watch political speeches with real-time AI fact-checking. Every economic claim verified against official data from BLS, BEA, Treasury, and FRED.
              </p>
            </div>

            {/* Live Now Card */}
            {config?.status === "live" && config.videoId && (
              <div style={{
                background: T.card, border: `2px solid ${T.accent}`, borderRadius: 12,
                padding: mob ? 16 : 24, marginBottom: 20, maxWidth: 600, margin: "0 auto 20px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%", background: "#dc2626",
                    animation: "pulse 2s infinite",
                  }} />
                  <span style={{
                    fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: 1.2, color: "#dc2626",
                  }}>LIVE NOW</span>
                </div>
                <div style={{
                  fontFamily: "'Source Serif 4',serif", fontSize: mob ? 18 : 22, fontWeight: 700,
                  color: T.ink, marginBottom: 6,
                }}>{config.title}</div>
                <div style={{
                  fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: T.mute, marginBottom: 16,
                }}>{config.startedAt ? timeAgo(config.startedAt) : ""}</div>
                <button
                  onClick={() => startLive(config.videoId, config.title)}
                  style={{
                    background: T.accent, color: "#fff", border: "none", borderRadius: 8,
                    padding: "12px 28px", fontFamily: "'DM Sans',sans-serif", fontSize: 14,
                    fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                  }}
                >
                  ▶ Watch &amp; Fact-Check
                </button>
              </div>
            )}

            {/* Recent + Upcoming + Demo */}
            <div style={{
              display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 16,
              maxWidth: 800, margin: "0 auto",
            }}>
              {/* Demo Card */}
              <div style={{
                background: T.card, border: `1px solid ${T.rule}`, borderRadius: 12,
                padding: mob ? 16 : 20, gridColumn: mob ? "1" : "1 / -1",
              }}>
                <div style={{
                  fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: 1.5, color: T.gold, marginBottom: 10,
                }}>Try Demo Mode</div>
                <div style={{
                  fontFamily: "'Source Serif 4',serif", fontSize: mob ? 16 : 18, fontWeight: 700,
                  color: T.ink, marginBottom: 6,
                }}>State of the Union 2024</div>
                <p style={{
                  fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: T.sub, marginBottom: 14, lineHeight: 1.5,
                }}>
                  Experience the fact-checker with a recorded speech. Economic claims are verified in real-time as the transcript plays.
                </p>
                <button
                  onClick={startDemo}
                  style={{
                    background: T.ink, color: "#fff", border: "none", borderRadius: 8,
                    padding: "10px 22px", fontFamily: "'DM Sans',sans-serif", fontSize: 13,
                    fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                  }}
                >
                  ▶ Watch Demo
                </button>
              </div>

              {/* Recent */}
              {config?.recent && config.recent.length > 0 && (
                <div style={{
                  background: T.card, border: `1px solid ${T.rule}`, borderRadius: 12,
                  padding: mob ? 16 : 20,
                }}>
                  <div style={{
                    fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: 1.5, color: T.mute, marginBottom: 10,
                  }}>Recent Broadcasts</div>
                  {config.recent.map((r, i) => (
                    <div key={i} style={{
                      padding: "8px 0", borderBottom: i < config.recent.length - 1 ? `1px solid ${T.rule}22` : "none",
                    }}>
                      <button
                        onClick={() => {
                          if (r.isDemo) { startDemo(); }
                          else { startLive(r.videoId, r.title); }
                        }}
                        style={{
                          background: "none", border: "none", cursor: "pointer", textAlign: "left",
                          display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0,
                        }}
                      >
                        <span style={{ fontSize: 14, color: T.accent }}>▶</span>
                        <div>
                          <div style={{
                            fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, color: T.ink,
                          }}>{r.title} <span style={{ fontWeight: 400, color: T.mute }}>({r.duration})</span></div>
                          <div style={{
                            fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: T.mute, marginTop: 2,
                          }}>
                            {r.claims} claims checked · {r.scores.true || 0} True · {r.scores.false || 0} False
                          </div>
                        </div>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upcoming */}
              {config?.upcoming && config.upcoming.length > 0 && (
                <div style={{
                  background: T.card, border: `1px solid ${T.rule}`, borderRadius: 12,
                  padding: mob ? 16 : 20,
                }}>
                  <div style={{
                    fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: 1.5, color: T.mute, marginBottom: 10,
                  }}>Upcoming</div>
                  {config.upcoming.map((u, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "8px 0",
                      borderBottom: i < config.upcoming.length - 1 ? `1px solid ${T.rule}22` : "none",
                    }}>
                      <span style={{ fontSize: 12, color: T.mute }}>🕐</span>
                      <div>
                        <div style={{
                          fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, color: T.ink,
                        }}>{u.title}</div>
                        <div style={{
                          fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: T.mute, marginTop: 2,
                        }}>{formatTime(u.date)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* How It Works */}
            <div style={{
              maxWidth: 600, margin: "32px auto 0", textAlign: "center",
              fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: T.mute, lineHeight: 1.8,
            }}>
              <div style={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, color: T.sub }}>
                How It Works
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: mob ? 16 : 32, flexWrap: "wrap" }}>
                {[
                  ["📺", "Watch any broadcast"],
                  ["🎙️", "AI listens in real-time"],
                  ["📊", "Claims checked vs. official data"],
                ].map(([icon, label], i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 24 }}>{icon}</span>
                    <span style={{ fontSize: 11 }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Playing State ── */}
        {isPlaying && (
          <div style={{
            display: "grid",
            gridTemplateColumns: mob ? "1fr" : "1fr 380px",
            gap: mob ? 0 : 20,
          }}>
            {/* LEFT: Video + Controls */}
            <div>
              {/* Status bar */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
                background: T.ink, borderRadius: "8px 8px 0 0", color: "#fff",
                fontFamily: "'DM Sans',sans-serif", fontSize: 12,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: isDemo ? T.gold : "#dc2626",
                  animation: isDemo ? "none" : "pulse 2s infinite",
                }} />
                <span style={{ fontWeight: 700 }}>{isDemo ? "DEMO" : "LIVE"}</span>
                <span style={{ color: "#9a9490" }}>|</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
                <span style={{ color: "#9a9490", flexShrink: 0 }}>{claims.length} claims</span>
              </div>

              {/* Video Player */}
              <div style={{
                position: "relative", width: "100%", aspectRatio: "16/9",
                background: "#000",
              }}>
                {videoId ? (
                  <iframe
                    ref={iframeRef}
                    id="yt-player"
                    width="100%"
                    height="100%"
                    src={`https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1&origin=${typeof window !== "undefined" ? window.location.origin : ""}`}
                    allow="autoplay; encrypted-media"
                    allowFullScreen
                    style={{ border: "none", position: "absolute", top: 0, left: 0 }}
                  />
                ) : (
                  <div style={{
                    position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#666", fontFamily: "'DM Sans',sans-serif", fontSize: 14,
                  }}>
                    No video source
                  </div>
                )}
              </div>

              {/* Transcript Strip */}
              {liveTranscript && (
                <div style={{
                  background: T.paper, padding: "8px 14px", fontSize: 12,
                  fontFamily: "'DM Sans',sans-serif", color: T.sub,
                  maxHeight: 60, overflow: "hidden", borderBottom: `1px solid ${T.rule}`,
                  lineHeight: 1.6,
                }}>
                  <span style={{ opacity: 0.5 }}>... </span>
                  {liveTranscript.split(" ").slice(-40).join(" ")}
                  <span style={{ animation: "blink 1s infinite" }}>|</span>
                </div>
              )}

              {/* Controls */}
              <div style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                background: T.card, border: `1px solid ${T.rule}`,
                borderRadius: "0 0 8px 8px", flexWrap: "wrap",
              }}>
                <button
                  onClick={stopSession}
                  style={{
                    background: T.accent, color: "#fff", border: "none", borderRadius: 6,
                    padding: "6px 16px", fontFamily: "'DM Sans',sans-serif", fontSize: 12,
                    fontWeight: 700, cursor: "pointer",
                  }}
                >
                  ■ Stop
                </button>

                {!isDemo && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: T.mute,
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: isListening ? "#16a34a" : T.rule,
                      animation: isListening ? "pulse 2s infinite" : "none",
                    }} />
                    {isListening ? "Mic active — listening" : "Mic off"}
                    {!isListening && (
                      <button
                        onClick={startMicListening}
                        style={{
                          background: "none", border: `1px solid ${T.rule}`, borderRadius: 4,
                          padding: "3px 8px", fontSize: 10, fontWeight: 600, color: T.sub,
                          cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                        }}
                      >
                        Enable Mic
                      </button>
                    )}
                  </div>
                )}

                {isDemo && (
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: T.gold, fontWeight: 600 }}>
                    Playing pre-loaded transcript...
                  </span>
                )}
              </div>

              {/* Mic hint for live (non-demo) */}
              {!isDemo && !isListening && !micError && (
                <div style={{
                  marginTop: 8, padding: "8px 14px", background: T.highlight,
                  border: "1px solid #f5deb3", borderRadius: 6,
                  fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#78716c", lineHeight: 1.5,
                }}>
                  💡 <strong>Tip:</strong> Turn up your speakers and click &ldquo;Enable Mic&rdquo; above. We use your microphone to hear what&apos;s being said — nothing is recorded or stored.
                </div>
              )}

              {micError && (
                <div style={{
                  marginTop: 8, padding: "8px 14px", background: "#fef2f2",
                  border: "1px solid #fecaca", borderRadius: 6,
                  fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#991b1b",
                }}>
                  {micError}
                </div>
              )}

              {/* Mobile summary */}
              {mob && claims.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <SummaryBar claims={claims} />
                </div>
              )}
            </div>

            {/* RIGHT: Fact-check panel */}
            <div style={{
              display: "flex", flexDirection: "column",
              maxHeight: mob ? "none" : "calc(100vh - 100px)",
              overflow: mob ? "visible" : "hidden",
            }}>
              {/* Panel header */}
              <div style={{
                padding: "12px 14px", background: T.card,
                border: `1px solid ${T.rule}`, borderRadius: "8px 8px 0 0",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginTop: mob ? 12 : 0,
              }}>
                <div style={{
                  fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700,
                  color: T.ink, display: "flex", alignItems: "center", gap: 6,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#dc2626", animation: "pulse 2s infinite" }} />
                  LIVE FACT-CHECK
                </div>
                <span style={{
                  fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: T.mute,
                }}>{claims.length} claims</span>
              </div>

              {/* Claims list */}
              <div style={{
                flex: 1, overflowY: "auto", padding: "8px 0",
                background: T.paper, border: `1px solid ${T.rule}`, borderTop: "none",
                borderRadius: "0 0 8px 8px",
              }}>
                <div style={{ padding: "0 8px" }}>
                  {claims.length === 0 && (
                    <div style={{
                      textAlign: "center", padding: "40px 16px",
                      fontFamily: "'DM Sans',sans-serif", color: T.mute,
                    }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>📡</div>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Listening for claims...</div>
                      <div style={{ fontSize: 11 }}>Fact-check cards will appear here as economic claims are detected.</div>
                    </div>
                  )}
                  {claims.map(c => (
                    <FactCard key={c.id} claim={c} isNew={newClaimIds.has(c.id)} onSeek={seekVideo} />
                  ))}
                </div>
              </div>

              {/* Desktop summary */}
              {!mob && claims.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <SummaryBar claims={claims} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Session Summary Overlay ── */}
        {showSummary && !isPlaying && (
          <div style={{
            maxWidth: 500, margin: "24px auto",
            background: T.card, border: `1px solid ${T.rule}`, borderRadius: 12,
            padding: mob ? 20 : 28, textAlign: "center",
          }}>
            <div style={{
              fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: 1.5, color: T.mute, marginBottom: 8,
            }}>Session Summary</div>
            <div style={{
              fontFamily: "'Source Serif 4',serif", fontSize: mob ? 16 : 20, fontWeight: 700,
              color: T.ink, marginBottom: 4,
            }}>{title}</div>
            <div style={{
              fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: T.mute, marginBottom: 16,
            }}>{claims.length} economic claims analyzed</div>

            <SummaryBar claims={claims} />

            <div style={{ marginTop: 16, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                onClick={shareResults}
                style={{
                  background: T.ink, color: "#fff", border: "none", borderRadius: 6,
                  padding: "8px 20px", fontFamily: "'DM Sans',sans-serif", fontSize: 12,
                  fontWeight: 700, cursor: "pointer",
                }}
              >
                Share Results
              </button>
              <button
                onClick={() => { setShowSummary(false); setClaims([]); }}
                style={{
                  background: "none", border: `1px solid ${T.rule}`, borderRadius: 6,
                  padding: "8px 20px", fontFamily: "'DM Sans',sans-serif", fontSize: 12,
                  fontWeight: 600, color: T.sub, cursor: "pointer",
                }}
              >
                Back
              </button>
            </div>

            {/* All claims list */}
            {claims.length > 0 && (
              <div style={{ marginTop: 20, textAlign: "left" }}>
                <div style={{
                  fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: 1, color: T.mute, marginBottom: 8,
                }}>All Claims</div>
                {claims.map(c => <FactCard key={c.id} claim={c} isNew={false} onSeek={seekVideo} />)}
              </div>
            )}
          </div>
        )}

        {/* ── Disclaimer ── */}
        <div style={{
          marginTop: 24, padding: "12px 16px", borderRadius: 6,
          background: T.highlight, border: "1px solid #f5deb3",
          fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#78716c",
          lineHeight: 1.6, textAlign: "center",
        }}>
          <strong>BETA</strong> — AI-generated fact-checks may contain errors. Sources are cited — verify independently.
          <br />Vote Unbiased provides data, not opinions. You interpret.
        </div>
      </div>
    </div>
  );
}
