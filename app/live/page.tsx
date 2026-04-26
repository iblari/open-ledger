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
  demos?: {
    title: string; speaker: string; file: string; duration: string;
    claims: number; date: string;
    scores: Record<string, number>;
  }[];
  recent: {
    title: string; videoId: string; duration: string;
    claims: number; date: string; isDemo?: boolean;
    demoFile?: string;
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
  const [isManualChecking, setIsManualChecking] = useState(false);
  const [manualResult, setManualResult] = useState<Claim[] | null>(null);
  const [newClaimIds, setNewClaimIds] = useState<Set<string>>(new Set());
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState("");

  const [demoSpeech, setDemoSpeech] = useState<DemoSpeech | null>(null);

  const bufferRef = useRef("");
  const contextRef = useRef("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const demoAbortRef = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const demoStartTime = useRef(0);
  const shownSegmentsRef = useRef<Set<number>>(new Set());
  const lastAutoCheckTime = useRef(0);
  const autoCheckBuffer = useRef("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ytPlayerRef = useRef<any>(null);

  /* ── Load YouTube IFrame API once ── */
  useEffect(() => {
    if (typeof window !== "undefined" && !(window as Record<string, unknown>).YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
  }, []);

  /* ── YouTube seek — prefer YT API, fallback to postMessage ── */
  const seekVideo = useCallback((seconds: number) => {
    if (ytPlayerRef.current?.seekTo) {
      ytPlayerRef.current.seekTo(seconds, true);
    } else if (iframeRef.current?.contentWindow) {
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

  /* ── Initialize YT Player when demo video loads ── */
  useEffect(() => {
    if (!isDemo || !isPlaying || !videoId) return;

    const initPlayer = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const YT = (window as any).YT;
      if (!YT?.Player) {
        setTimeout(initPlayer, 500);
        return;
      }
      if (ytPlayerRef.current?.destroy) {
        try { ytPlayerRef.current.destroy(); } catch {}
      }
      ytPlayerRef.current = new YT.Player("yt-player-div", {
        videoId,
        playerVars: { autoplay: 1, rel: 0 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        events: { onReady: (e: any) => { e.target.playVideo(); } },
      });
    };

    setTimeout(initPlayer, 300);
    return () => {
      if (ytPlayerRef.current?.destroy) {
        try { ytPlayerRef.current.destroy(); } catch {}
        ytPlayerRef.current = null;
      }
    };
  }, [isDemo, isPlaying, videoId]);

  /* ── Poll video time → drive transcript + claims ── */
  useEffect(() => {
    if (!isDemo || !isPlaying || !demoSpeech) return;

    const CLAIM_DELAY = 4;
    const AUTO_CHECK_INTERVAL = 15; // seconds between AI fact-checks for URL videos

    // Detect if this is a URL-pasted video (no pre-loaded claims on any segment)
    const hasPreloadedClaims = demoSpeech.segments.some(
      s => s.claims && s.claims.length > 0
    );

    // Reset auto-check state on start
    lastAutoCheckTime.current = 0;
    autoCheckBuffer.current = "";

    const interval = setInterval(() => {
      if (demoAbortRef.current) return;

      // Get current video time — YT API preferred, wall-clock fallback
      let vt = (Date.now() - demoStartTime.current) / 1000;
      if (ytPlayerRef.current?.getCurrentTime) {
        try { vt = ytPlayerRef.current.getCurrentTime(); } catch {}
      }

      // Update transcript with recent segments
      let latestIdx = -1;
      for (let i = demoSpeech.segments.length - 1; i >= 0; i--) {
        if (vt >= demoSpeech.segments[i].time) { latestIdx = i; break; }
      }
      if (latestIdx >= 0) {
        const recent = demoSpeech.segments
          .filter((_, i) => i <= latestIdx)
          .slice(-3)
          .map(s => s.text);
        setLiveTranscript(recent.join(" "));
      }

      // Show claims when video reaches each segment + delay
      for (let si = 0; si < demoSpeech.segments.length; si++) {
        const seg = demoSpeech.segments[si];
        if (shownSegmentsRef.current.has(si)) continue;
        if (vt < seg.time) continue;

        if (hasPreloadedClaims) {
          // Pre-loaded demo: show claims from the JSON data
          if (!seg.claims || seg.claims.length === 0) {
            shownSegmentsRef.current.add(si);
            continue;
          }
          if (vt >= seg.time + CLAIM_DELAY) {
            shownSegmentsRef.current.add(si);
            const newClaims: Claim[] = seg.claims.map((c, ci) => ({
              ...c,
              timestamp: new Date().toISOString(),
              id: `claim-${si}-${ci}-${Date.now()}`,
              videoTime: seg.time,
            }));
            setNewClaimIds(new Set(newClaims.map(c => c.id)));
            setClaims(prev => [...newClaims, ...prev]);
          }
        } else {
          // URL-pasted video: buffer text for AI fact-checking
          shownSegmentsRef.current.add(si);
          autoCheckBuffer.current += " " + seg.text;
        }
      }

      // Auto fact-check: send buffered text to Claude every ~15 seconds
      if (!hasPreloadedClaims && vt - lastAutoCheckTime.current >= AUTO_CHECK_INTERVAL) {
        const textToCheck = autoCheckBuffer.current.trim();
        if (textToCheck.length >= 30) {
          lastAutoCheckTime.current = vt;
          const capturedText = textToCheck;
          const capturedTime = Math.floor(vt);
          autoCheckBuffer.current = "";

          // Fire-and-forget async call to Claude
          fetch("/api/live-fact-check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: capturedText,
              context: contextRef.current,
            }),
          })
            .then(r => r.json())
            .then(data => {
              contextRef.current = (contextRef.current + " " + capturedText).slice(-500);
              if (data.claims?.length > 0) {
                const enriched: Claim[] = data.claims.map((c: Claim) => ({
                  ...c,
                  videoTime: capturedTime,
                  timestamp: new Date().toISOString(),
                  id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                }));
                setNewClaimIds(new Set(enriched.map(c => c.id)));
                setClaims(prev => [...enriched, ...prev]);
              }
            })
            .catch(e => console.error("Auto fact-check error:", e));
        }
      }

      // End check
      const last = demoSpeech.segments[demoSpeech.segments.length - 1];
      if (shownSegmentsRef.current.size === demoSpeech.segments.length && vt >= last.time + 10) {
        setShowSummary(true);
      }
    }, 800);

    return () => clearInterval(interval);
  }, [isDemo, isPlaying, demoSpeech]);

  /* ── Start demo — loads speech data into state ── */
  const startDemo = useCallback(async (speechFile?: string) => {
    demoAbortRef.current = false;
    shownSegmentsRef.current = new Set();
    setIsDemo(true);
    setIsPlaying(true);
    setClaims([]);
    setLiveTranscript("");
    setShowSummary(false);
    setDemoSpeech(null);
    bufferRef.current = "";
    contextRef.current = "";

    const file = speechFile || "sotu-2024.json";
    try {
      const res = await fetch(`/speeches/${file}`);
      const speech: DemoSpeech = await res.json();
      setVideoId(speech.videoId);
      setTitle(`DEMO — ${speech.title}, ${speech.date}`);
      demoStartTime.current = Date.now();
      // Setting state triggers the polling effect above
      setDemoSpeech(speech);
    } catch (e) {
      console.error("Demo error:", e);
    }
  }, []);

  /* ── Client-side XML transcript parser (mirrors server logic) ── */
  const parseTranscriptXml = useCallback((xml: string): { time: number; text: string }[] => {
    const items: { startSec: number; text: string }[] = [];
    const decode = (s: string) => s
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
      .replace(/\n/g, " ").trim();

    // srv3 format: <p t="ms" d="ms"><s>word</s>...</p>
    const pRe = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
    let m;
    while ((m = pRe.exec(xml)) !== null) {
      const inner = m[3];
      let text = "";
      const sRe = /<s[^>]*>([^<]*)<\/s>/g;
      let s;
      while ((s = sRe.exec(inner)) !== null) text += s[1];
      if (!text) text = inner.replace(/<[^>]+>/g, "");
      text = decode(text).trim();
      if (text) items.push({ startSec: parseInt(m[1], 10) / 1000, text });
    }
    if (items.length === 0) {
      // Classic format: <text start="s" dur="s">content</text>
      const tRe = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
      while ((m = tRe.exec(xml)) !== null) {
        const text = decode(m[3]);
        if (text) items.push({ startSec: parseFloat(m[1]), text });
      }
    }

    // Group into 15-second segments
    if (items.length === 0) return [];
    const segments: { time: number; text: string }[] = [];
    let winStart = Math.floor(items[0].startSec);
    let buf: string[] = [];
    for (const item of items) {
      const sec = Math.floor(item.startSec);
      if (sec - winStart >= 15 && buf.length > 0) {
        segments.push({ time: winStart, text: buf.join(" ") });
        buf = [];
        winStart = sec;
      }
      if (item.text.trim()) buf.push(item.text.trim());
    }
    if (buf.length > 0) segments.push({ time: winStart, text: buf.join(" ") });
    return segments;
  }, []);

  /* ── Start from URL — fetch transcript then reuse demo machinery ── */
  const startFromUrl = useCallback(async (url: string) => {
    setUrlError("");
    setUrlLoading(true);
    try {
      const res = await fetch("/api/fetch-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();

      let segments: { time: number; text: string }[] = [];
      let videoTitle = data.title || "YouTube Video";
      let vid = data.videoId || "";
      let duration = data.duration || "?";

      if (data.segments && data.segments.length > 0) {
        // Server returned full transcript
        segments = data.segments;
      } else if (data.clientFetch && data.captionUrl) {
        // Server returned a signed timedtext URL — fetch from browser (CORS supported!)
        console.log("[clientFetch] Fetching timedtext from browser...");
        try {
          const txRes = await fetch(data.captionUrl);
          if (txRes.ok) {
            const xml = await txRes.text();
            if (xml && xml.length > 50) {
              segments = parseTranscriptXml(xml);
              console.log(`[clientFetch] Parsed ${segments.length} segments from browser`);
            }
          }
        } catch (e) {
          console.warn("[clientFetch] Browser timedtext fetch failed:", e);
        }
      } else if (data.error && !data.clientFetch) {
        setUrlError(data.error);
        setUrlLoading(false);
        return;
      }

      // If we still don't have segments, try client-side InnerTube as last resort
      if (segments.length === 0 && vid) {
        console.log("[clientFetch] Trying client-side InnerTube...");
        try {
          // InnerTube accepts text/plain Content-Type (avoids CORS preflight)
          // Note: YouTube may block this via Origin header, but worth trying
          const itRes = await fetch(
            "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
            {
              method: "POST",
              headers: { "Content-Type": "text/plain" },
              body: JSON.stringify({
                context: { client: { clientName: "ANDROID", clientVersion: "20.10.38" } },
                videoId: vid,
              }),
            }
          );
          if (itRes.ok) {
            const itData = await itRes.json();
            videoTitle = itData?.videoDetails?.title || videoTitle;
            const tracks = itData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            if (Array.isArray(tracks) && tracks.length > 0) {
              const track =
                tracks.find((t: { languageCode: string; kind?: string }) =>
                  t.languageCode.startsWith("en") && t.kind !== "asr") ||
                tracks.find((t: { languageCode: string }) =>
                  t.languageCode.startsWith("en")) ||
                tracks[0];
              const txRes2 = await fetch(track.baseUrl);
              if (txRes2.ok) {
                const xml2 = await txRes2.text();
                if (xml2 && xml2.length > 50) {
                  segments = parseTranscriptXml(xml2);
                  console.log(`[clientFetch] Client InnerTube success: ${segments.length} segments`);
                }
              }
            }
          }
        } catch (e) {
          console.warn("[clientFetch] Client InnerTube failed (expected):", e);
        }
      }

      if (segments.length === 0) {
        setUrlError(
          "Could not load transcript. YouTube may be blocking automated access. " +
          "Try a different video, or open the video on YouTube → click '...' → 'Show transcript' to verify captions exist."
        );
        setUrlLoading(false);
        return;
      }

      // Calculate duration from segments
      const lastSeg = segments[segments.length - 1];
      if (lastSeg) {
        duration = `${Math.ceil(lastSeg.time / 60)}m`;
      }

      // Build a DemoSpeech with empty claims — AI will fact-check in real-time
      const speech: DemoSpeech = {
        title: videoTitle,
        speaker: data.speaker || "Unknown",
        date: data.date || new Date().toISOString().slice(0, 10),
        videoId: vid,
        duration,
        segments: segments.map((s: { time: number; text: string }) => ({
          time: s.time,
          text: s.text,
          claims: [], // no pre-loaded claims — Claude will analyze in real-time
        })),
      };

      // Start in demo mode (transcript-driven, not mic-driven)
      demoAbortRef.current = false;
      shownSegmentsRef.current = new Set();
      setIsDemo(true);
      setIsPlaying(true);
      setClaims([]);
      setLiveTranscript("");
      setShowSummary(false);
      setDemoSpeech(null);
      bufferRef.current = "";
      contextRef.current = "";
      setVideoId(speech.videoId);
      setTitle(speech.title);
      demoStartTime.current = Date.now();
      setDemoSpeech(speech);
      setUrlInput("");
    } catch (e) {
      console.error("URL fetch error:", e);
      setUrlError("Network error — could not reach the server.");
    } finally {
      setUrlLoading(false);
    }
  }, [parseTranscriptXml]);

  /* ── Stop ── */
  const stopSession = useCallback(() => {
    demoAbortRef.current = true;
    setIsPlaying(false);
    setIsDemo(false);
    setDemoSpeech(null);
    setManualResult(null);
    shownSegmentsRef.current = new Set();
    stopMicListening();
    if (ytPlayerRef.current?.destroy) {
      try { ytPlayerRef.current.destroy(); } catch {}
      ytPlayerRef.current = null;
    }
    if (claims.length > 0) setShowSummary(true);
  }, [claims.length, stopMicListening]);

  /* ── Manual "Fact Check This" — grabs recent transcript ── */
  const manualFactCheck = useCallback(async () => {
    setIsManualChecking(true);
    setManualResult(null);

    const recentText = liveTranscript.split(" ").slice(-80).join(" ").trim();

    let videoTime = Math.floor((Date.now() - demoStartTime.current) / 1000);
    if (ytPlayerRef.current?.getCurrentTime) {
      try { videoTime = Math.floor(ytPlayerRef.current.getCurrentTime()); } catch {}
    }

    if (recentText.length < 20) {
      setManualResult([{
        quote: "No transcript available yet",
        rating: "UNVERIFIABLE",
        actual: "Wait for the transcript to build up, then try again.",
        explanation: "The fact-checker needs at least a few sentences of speech to analyze.",
        videoTime, timestamp: new Date().toISOString(), id: `manual-hint-${Date.now()}`,
      }]);
      setIsManualChecking(false);
      return;
    }

    try {
      const res = await fetch("/api/live-fact-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: recentText, context: "User manually requested fact-check." }),
      });
      const data = await res.json();

      if (data.claims?.length > 0) {
        const results: Claim[] = data.claims.map((c: Claim) => ({
          ...c, videoTime, timestamp: new Date().toISOString(),
          id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        }));
        setManualResult(results);
        // Also add to the side panel
        setNewClaimIds(new Set(results.map(c => c.id)));
        setClaims(prev => [...results, ...prev]);
      } else {
        // API returned no claims or returned an error
        const msg = data.error
          ? (data.error === "ANTHROPIC_API_KEY not configured"
            ? "API key not configured — add ANTHROPIC_API_KEY to Vercel env vars."
            : data.error)
          : "No verifiable economic claims detected in this section of the speech.";
        setManualResult([{
          quote: recentText.slice(0, 100) + (recentText.length > 100 ? "..." : ""),
          rating: "UNVERIFIABLE",
          actual: msg,
          explanation: "Try clicking during a section where specific numbers, percentages, or dollar figures are mentioned.",
          videoTime, timestamp: new Date().toISOString(), id: `manual-${Date.now()}`,
        }]);
      }
    } catch (e) {
      console.error("Manual fact-check error:", e);
      setManualResult([{
        quote: "Error",
        rating: "UNVERIFIABLE",
        actual: "Something went wrong. Please try again.",
        explanation: "",
        videoTime, timestamp: new Date().toISOString(), id: `manual-err-${Date.now()}`,
      }]);
    }

    setIsManualChecking(false);
  }, [liveTranscript]);

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

            {/* ── Paste a YouTube URL ── */}
            <div style={{
              maxWidth: 600, margin: "0 auto 24px", padding: mob ? "16px" : "20px 24px",
              background: T.card, border: `1px solid ${T.rule}`, borderRadius: 12,
            }}>
              <div style={{
                fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: 1.2, color: T.sub, marginBottom: 10,
              }}>
                Fact-Check Any YouTube Video
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                <input
                  type="text"
                  value={urlInput}
                  onChange={e => { setUrlInput(e.target.value); setUrlError(""); }}
                  onKeyDown={e => { if (e.key === "Enter" && urlInput.trim()) startFromUrl(urlInput.trim()); }}
                  placeholder="Paste a YouTube URL…"
                  style={{
                    flex: 1, padding: "10px 14px", borderRadius: 8,
                    border: `1px solid ${urlError ? "#dc2626" : T.rule}`,
                    fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: T.ink,
                    background: T.paper, outline: "none",
                  }}
                />
                <button
                  onClick={() => urlInput.trim() && startFromUrl(urlInput.trim())}
                  disabled={urlLoading || !urlInput.trim()}
                  style={{
                    background: urlLoading ? T.rule : T.accent, color: "#fff",
                    border: "none", borderRadius: 8, padding: "10px 20px",
                    fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 700,
                    cursor: urlLoading || !urlInput.trim() ? "default" : "pointer",
                    opacity: urlLoading || !urlInput.trim() ? 0.6 : 1,
                    whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  {urlLoading ? (
                    <><span style={{ animation: "pulse 1s infinite" }}>⏳</span> Fetching transcript…</>
                  ) : (
                    <>▶ Watch &amp; Fact-Check</>
                  )}
                </button>
              </div>
              {urlError && (
                <div style={{
                  marginTop: 8, padding: "8px 12px", background: "#fef2f2",
                  border: "1px solid #fecaca", borderRadius: 6,
                  fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#991b1b",
                }}>
                  {urlError}
                </div>
              )}
              <div style={{
                fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: T.mute, marginTop: 8,
                lineHeight: 1.5,
              }}>
                Paste any YouTube video with captions. The AI reads the transcript and fact-checks economic claims in real-time using Claude — no microphone needed.
              </div>
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
              {/* Demo Cards — one per speech */}
              {(config?.demos || [
                { title: "Trump Address to Congress 2025", speaker: "Donald Trump", file: "trump-congress-2025.json", duration: "99m", claims: 20, scores: { true: 0, mostly_true: 4, misleading: 7, false: 6, unverifiable: 1 }, date: "2025-03-04" },
                { title: "State of the Union 2024", speaker: "Joe Biden", file: "sotu-2024.json", duration: "72m", claims: 27, scores: { true: 10, mostly_true: 10, misleading: 4, false: 1, unverifiable: 2 }, date: "2024-03-07" },
              ]).map((demo, i) => {
                const trueish = (demo.scores.true || 0) + (demo.scores.mostly_true || 0);
                const accuracy = demo.claims > 0 ? Math.round((trueish / demo.claims) * 100) : 0;
                return (
                  <div key={i} style={{
                    background: T.card, border: `1px solid ${T.rule}`, borderRadius: 12,
                    padding: mob ? 16 : 20,
                  }}>
                    <div style={{
                      fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700,
                      textTransform: "uppercase", letterSpacing: 1.5, color: T.gold, marginBottom: 10,
                    }}>Demo — {demo.speaker}</div>
                    <div style={{
                      fontFamily: "'Source Serif 4',serif", fontSize: mob ? 15 : 17, fontWeight: 700,
                      color: T.ink, marginBottom: 4,
                    }}>{demo.title}</div>
                    <div style={{
                      fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: T.mute, marginBottom: 10,
                    }}>{demo.duration} · {demo.claims} claims · {accuracy}% accuracy</div>
                    <div style={{
                      display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12,
                    }}>
                      {Object.entries(RATING_COLORS).map(([rating, colors]) => {
                        const key = rating.toLowerCase().replace(/ /g, "_");
                        const count = (demo.scores as Record<string, number>)[key] || 0;
                        if (count === 0) return null;
                        return (
                          <span key={rating} style={{
                            fontSize: 9, fontWeight: 600, display: "flex", alignItems: "center", gap: 3,
                          }}>
                            <span style={{ width: 6, height: 6, borderRadius: 2, background: colors.bg }} />
                            <span style={{ color: T.mute }}>{count}</span>
                          </span>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => startDemo(demo.file)}
                      style={{
                        background: T.ink, color: "#fff", border: "none", borderRadius: 8,
                        padding: "10px 22px", fontFamily: "'DM Sans',sans-serif", fontSize: 13,
                        fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                      }}
                    >
                      ▶ Watch Demo
                    </button>
                  </div>
                );
              })}

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
                          if (r.isDemo) { startDemo(r.demoFile); }
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
                {videoId && isDemo ? (
                  <div
                    id="yt-player-div"
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
                  />
                ) : videoId ? (
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

                <button
                  onClick={manualFactCheck}
                  disabled={isManualChecking}
                  style={{
                    background: isManualChecking ? T.rule : T.blue,
                    color: "#fff", border: "none", borderRadius: 6,
                    padding: "6px 16px", fontFamily: "'DM Sans',sans-serif", fontSize: 12,
                    fontWeight: 700, cursor: isManualChecking ? "default" : "pointer",
                    opacity: isManualChecking ? 0.7 : 1,
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  {isManualChecking ? (
                    <>
                      <span style={{ animation: "pulse 1s infinite" }}>⏳</span>
                      Checking...
                    </>
                  ) : (
                    <>🔍 Fact Check This</>
                  )}
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

              {/* Manual Fact-Check Results */}
              {manualResult && (
                <div style={{
                  marginTop: 10, padding: "14px 16px",
                  background: "linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)",
                  border: `1px solid ${T.blue}33`,
                  borderRadius: 10,
                  position: "relative",
                }}>
                  {/* Close button */}
                  <button
                    onClick={() => setManualResult(null)}
                    style={{
                      position: "absolute", top: 8, right: 10,
                      background: "none", border: "none", cursor: "pointer",
                      fontSize: 16, color: T.mute, lineHeight: 1,
                    }}
                    title="Dismiss"
                  >×</button>

                  <div style={{
                    fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700,
                    color: T.blue, textTransform: "uppercase", letterSpacing: 0.8,
                    marginBottom: 10, display: "flex", alignItems: "center", gap: 6,
                  }}>
                    🔍 AI Fact-Check Result
                  </div>

                  {manualResult.map((r, i) => {
                    const rc = RATING_COLORS[r.rating] || RATING_COLORS.UNVERIFIABLE;
                    return (
                      <div key={r.id || i} style={{
                        background: T.card, border: `1px solid ${T.rule}`,
                        borderLeft: `4px solid ${rc.bg}`,
                        borderRadius: 8, padding: "10px 12px",
                        marginBottom: i < manualResult.length - 1 ? 8 : 0,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{
                            padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                            background: rc.bg, color: rc.text, letterSpacing: 0.5,
                          }}>{r.rating}</span>
                        </div>
                        <div style={{
                          fontSize: 13, fontWeight: 600, color: T.ink,
                          fontStyle: "italic", fontFamily: "'Source Serif 4',serif",
                          lineHeight: 1.4, marginBottom: 6,
                        }}>
                          &ldquo;{r.quote}&rdquo;
                        </div>
                        {r.actual && r.actual !== "N/A" && (
                          <div style={{
                            fontSize: 11, color: T.sub, lineHeight: 1.5,
                            fontFamily: "'DM Sans',sans-serif",
                          }}>
                            <strong style={{ color: T.ink }}>Data:</strong> {r.actual}
                          </div>
                        )}
                        {r.explanation && (
                          <div style={{
                            fontSize: 11, color: T.mute, marginTop: 4,
                            fontFamily: "'DM Sans',sans-serif", lineHeight: 1.4,
                          }}>
                            {r.explanation}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

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
