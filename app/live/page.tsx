"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { isDuplicateQuote } from "@/lib/claim-utils";

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
  confidence?: number; // 0-100
  actual: string;
  explanation: string;
  timestamp: string;
  videoTime?: number; // seconds into the video
  // ── Data-layer integration (lib/live-verify) ──
  // When the claim mentions one of our 6 anchored metrics, these are
  // populated and the card renders a "See full data" link to the dashboard.
  metricKey?: string | null;
  year?: number | null;
  admin?: string | null;
  claimedValue?: number | null;
  verifiedFromSource?: boolean;
  groundTruth?: { value: number; year: number; metricKey: string; source: string };
}

// Display labels for the 6 anchored metrics, used on the "See full data" link.
// Kept in sync with lib/metrics-data.ts METRICS_DATA[key].label.
const METRIC_LABELS: Record<string, string> = {
  gdp: "GDP Growth",
  unemployment: "Unemployment",
  inflation: "Inflation (CPI)",
  sp500: "S&P 500",
  debt_gdp: "Debt-to-GDP",
  median_income: "Median Income",
};

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

/* ── Parse YouTube timedtext XML into 15-second segments ──────── */
// Module-level so server-side prerender doesn't TDZ when other useCallbacks
// (startDemo, startFromUrl) reference it.
function parseTranscriptXml(xml: string): { time: number; text: string }[] {
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
}

/* ── Fuzzy-match a quote against YouTube captions ─────────────── */
// Finds the time in captions where the quote most likely occurs.
// Approach: sliding window across captions (~20s wide), compute word-overlap
// (Jaccard) between window text and quote words; return window start time
// of the best-overlap window above a confidence threshold.
//
// Demo claims have human-written paraphrases of the speech ("Auto plants are
// opening up all over the place") while YouTube captions are verbatim and
// often broken across multiple short lines. Word-overlap is robust to both
// — we don't need exact substring match.
export function findCaptionTimeForQuote(
  quote: string,
  captions: { time: number; text: string }[],
  minOverlap = 0.5,
): number | null {
  if (!captions.length) return null;
  // Normalize: lowercase, drop punctuation, drop short stopwords. "Stop"
  // words filter raises signal because "the", "of", etc. appear everywhere
  // and would inflate overlap on unrelated windows.
  const STOPWORDS = new Set([
    "the", "and", "of", "to", "a", "in", "is", "it", "you", "that", "we",
    "for", "on", "are", "as", "with", "this", "be", "at", "have", "or", "not",
    "but", "by", "from", "they", "an", "i", "my", "your", "their",
  ]);
  const tokens = (s: string) => s.toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));

  const qWords = tokens(quote);
  if (qWords.length < 3) return null;
  const qSet = new Set(qWords);

  let best: { score: number; time: number | null } = { score: 0, time: null };
  for (let i = 0; i < captions.length; i++) {
    // Window: forward through captions until we cover ~20s of speech.
    let windowText = "";
    for (let j = i; j < captions.length && captions[j].time - captions[i].time < 20; j++) {
      windowText += " " + captions[j].text;
    }
    const wSet = new Set(tokens(windowText));
    let overlap = 0;
    for (const w of qSet) if (wSet.has(w)) overlap++;
    const score = overlap / qSet.size;
    if (score > best.score) best = { score, time: captions[i].time };
  }
  return best.score >= minOverlap ? best.time : null;
}

/* ── Format a "starts in" countdown for scheduled broadcasts ──── */
// Picks the right precision based on remaining time so the label feels right
// at every scale — "in 3 days", "in 4h 12m", "in 14:32", "Live now".
function fmtCountdown(secondsUntil: number): string {
  if (secondsUntil <= 0) return "Live now";
  const days = Math.floor(secondsUntil / 86400);
  if (days >= 2) return `in ${days} days`;
  const hours = Math.floor(secondsUntil / 3600);
  if (hours >= 2) {
    const m = Math.floor((secondsUntil % 3600) / 60);
    return `in ${hours}h ${m}m`;
  }
  const m = Math.floor(secondsUntil / 60);
  const s = secondsUntil % 60;
  return `in ${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/* ── Pretty event date for the schedule list — local time, contextual ─ */
function fmtEventDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return `Today, ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow, ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
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
      {/* Header: rating badge + confidence + video timestamp */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
            background: rc.bg, color: rc.text, letterSpacing: 0.5,
          }}>{claim.rating}</span>
          {claim.confidence != null && (
            <span style={{
              fontSize: 9, fontWeight: 600, color: T.mute,
              fontFamily: "'DM Sans',sans-serif",
            }} title="AI confidence in this rating">
              {claim.confidence}% conf.
            </span>
          )}
        </div>
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

      {/* Actual data + source citation */}
      <div style={{ fontSize: 11, color: T.sub, marginBottom: 4, lineHeight: 1.5 }}>
        <strong style={{ color: T.ink }}>Data:</strong> {claim.actual}
        {claim.verifiedFromSource && claim.groundTruth && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            marginLeft: 6, padding: "1px 6px", borderRadius: 3,
            background: "#0d737715", color: "#0d7377",
            fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase",
            fontFamily: "'DM Sans',sans-serif", verticalAlign: "middle",
          }} title={`Cross-checked against Vote Unbiased's ${claim.groundTruth.source} data — not LLM memory`}>
            ✓ Sourced
          </span>
        )}
      </div>

      {/* Explanation */}
      <div style={{ fontSize: 11, color: T.mute, lineHeight: 1.4 }}>
        {claim.explanation}
      </div>

      {/* Data-layer deep link — when the claim maps to one of our 6 anchored
          metrics, surface a link to the dashboard's detail view for that
          metric + admin. This is the unique loop: live claim → sourced data
          → full historical context on the dashboard. */}
      {claim.metricKey && METRIC_LABELS[claim.metricKey] && (
        <Link
          href={`/dashboard?metric=${claim.metricKey}${claim.admin ? `&admin=${claim.admin}` : ""}`}
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            marginTop: 8, padding: "5px 10px",
            background: T.paper, border: `1px solid ${T.rule}`, borderRadius: 4,
            fontSize: 10, fontWeight: 600, color: T.ink,
            fontFamily: "'DM Sans',sans-serif", textDecoration: "none",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = T.card; e.currentTarget.style.borderColor = T.blue; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = T.paper; e.currentTarget.style.borderColor = T.rule; }}
        >
          See full data: {METRIC_LABELS[claim.metricKey]} <span style={{ color: T.blue }}>→</span>
        </Link>
      )}

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
  // Public broadcast schedule (public/live-schedule.json via /api/live-schedule).
  // Refetched every 30s so adding an event to the JSON and redeploying
  // shows up without a hard reload, and so a freshly-started event appears
  // here within 30s without needing the user to refresh.
  const [schedule, setSchedule] = useState<{
    active: { id: string; title: string; speaker: string; source: string; youtubeUrl: string; scheduledStart: string; scheduledEnd: string } | null;
    next: { id: string; title: string; speaker: string; source: string; youtubeUrl: string; scheduledStart: string; scheduledEnd: string } | null;
    nextSecondsUntilStart: number | null;
    upcoming: { id: string; title: string; speaker: string; source: string; youtubeUrl: string; scheduledStart: string; scheduledEnd: string }[];
  } | null>(null);
  // Wall-clock tick used to drive the countdown re-render once per second.
  // We only use this for display — the source of truth is the scheduledStart
  // ISO strings so missing a tick doesn't drift the countdown.
  const [, setClockTick] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [videoId, setVideoId] = useState("");
  const [title, setTitle] = useState("");
  const [claims, setClaims] = useState<Claim[]>([]);
  const [liveTranscript, setLiveTranscript] = useState("");
  // Real YouTube captions for the currently-loaded demo speech.
  // Demo JSONs have paraphrased segment.text + approximate segment.time
  // (hand-curated, often on round-minute marks), which means:
  //   (a) the subtitle line below the video doesn't match what's spoken, and
  //   (b) fact-check timestamps are off from where the words actually occur.
  // When we have real captions we use them as the subtitle source AND we
  // fuzzy-match each demo claim's quote against the captions to derive an
  // accurate videoTime. If the fetch fails we fall back to the segment-
  // based behavior gracefully (the demo still works, just less synced).
  const [realCaptions, setRealCaptions] = useState<{ time: number; text: string }[] | null>(null);
  const [captionsLoading, setCaptionsLoading] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [isManualChecking, setIsManualChecking] = useState(false);
  const [manualResult, setManualResult] = useState<Claim[] | null>(null);
  const [newClaimIds, setNewClaimIds] = useState<Set<string>>(new Set());
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState("");

  const [demoSpeech, setDemoSpeech] = useState<DemoSpeech | null>(null);

  // Rating filter for the fact-check feed. null = show everything. Long
  // broadcasts accumulate dozens of cards; "show me just the FALSE ones"
  // is the most common way to read the feed.
  const [ratingFilter, setRatingFilter] = useState<string | null>(null);
  const filteredClaims = useMemo(
    () => (ratingFilter ? claims.filter(c => c.rating === ratingFilter) : claims),
    [claims, ratingFilter]
  );

  const contextRef = useRef("");
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

  /* ── Load config — check live-feed API first, fall back to static JSON ── */
  // Re-polled every 30s while idle: previously this ran once on mount, so a
  // broadcast going live while someone sat on the idle page never surfaced
  // without a hard refresh. Now the LIVE card appears within 30s.
  useEffect(() => {
    if (isPlaying) return; // the live-feed poll effect owns this while playing
    let cancelled = false;
    async function loadConfig() {
      try {
        // Check if there's a live broadcast via the API
        const feedResp = await fetch("/api/live-feed");
        if (feedResp.ok) {
          const feed = await feedResp.json();
          if (cancelled) return;
          if (feed.state?.status === "live" && feed.state.videoId) {
            // Live broadcast active — build config from API state
            setConfig({
              status: "live",
              title: feed.state.title,
              source: feed.state.source || "youtube",
              videoId: feed.state.videoId,
              startedAt: feed.state.startedAt,
              upcoming: [],
              recent: [],
            });
            return;
          }
        }
      } catch {
        // API not available — fall through to static config
      }
      // Fall back to static config file
      try {
        const resp = await fetch("/live-config.json");
        const data = await resp.json();
        if (!cancelled) setConfig(data);
      } catch {}
    }
    loadConfig();
    const id = setInterval(loadConfig, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isPlaying]);

  /* ── Keyless live-stream discovery (/api/live-discover) ── */
  // Covers the "unscheduled presser" gap: even with nothing in
  // live-schedule.json and no worker running, streams detected on watched
  // channels (public/live-channels.json) surface on the idle page within ~60s.
  const [discovered, setDiscovered] = useState<{
    channelId: string; channelLabel: string; videoId: string; title: string | null;
  }[]>([]);
  useEffect(() => {
    if (isPlaying) return;
    let cancelled = false;
    async function discover() {
      try {
        const resp = await fetch("/api/live-discover");
        if (!resp.ok) return;
        const data = await resp.json();
        if (!cancelled && Array.isArray(data.live)) setDiscovered(data.live);
      } catch { /* discovery is best-effort */ }
    }
    discover();
    const id = setInterval(discover, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isPlaying]);

  /* ── Fetch broadcast schedule + tick clock for countdown ── */
  // The schedule comes from /api/live-schedule, which reads public/live-schedule.json.
  // We refetch every 30s so newly-added events appear without a hard refresh
  // and so an event transitioning to "active" surfaces near-real-time.
  useEffect(() => {
    let cancelled = false;
    async function loadSchedule() {
      try {
        const resp = await fetch("/api/live-schedule");
        if (!resp.ok) return;
        const data = await resp.json();
        if (!cancelled) setSchedule(data);
      } catch { /* schedule is decorative — silent failure is OK */ }
    }
    loadSchedule();
    const id = setInterval(loadSchedule, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // 1-second tick to drive the countdown re-render. Cheap — only updates a
  // single state value, the actual time math reads from Date.now() each render.
  useEffect(() => {
    const id = setInterval(() => setClockTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  /* ── Poll live-feed API during live broadcasts (not demos) ── */
  // lastPollTime tracks the newest claim timestamp we've already seen, so we
  // can ask the feed for only claims newer than that. Previously this was
  // set from feed.claims[0].timestamp which assumed newest-first ordering —
  // if the server returns chronological order, that points to the OLDEST claim
  // and we re-fetch the same claims forever. Now we always take the max.
  const lastPollTime = useRef<string | null>(null);
  // Surfaces poll failures (network down, KV missing, etc.) to the user
  // instead of silently logging to console. Audit finding #2 + #5.
  const [pollError, setPollError] = useState<string | null>(null);
  // Set of claim IDs we've already rendered — defensive dedup in case
  // lastPollTime gets reset by a race condition (StrictMode etc).
  const seenClaimIds = useRef<Set<string>>(new Set());
  // Quotes of the most recent claims on screen, mirrored into a ref so the
  // poll/auto-check closures can (a) drop near-duplicate re-statements
  // client-side and (b) tell the server what we already have (recentQuotes).
  const recentQuotesRef = useRef<string[]>([]);
  useEffect(() => {
    recentQuotesRef.current = claims.slice(0, 30).map(c => c.quote);
  }, [claims]);

  useEffect(() => {
    if (!isPlaying || isDemo) return;

    const poll = async () => {
      try {
        const url = lastPollTime.current
          ? `/api/live-feed?since=${encodeURIComponent(lastPollTime.current)}`
          : "/api/live-feed";
        const resp = await fetch(url);
        if (!resp.ok) {
          setPollError(`Live feed error ${resp.status}`);
          return;
        }
        const feed = await resp.json();
        // Clear stale error on a successful poll.
        if (pollError) setPollError(null);

        // Update transcript
        if (feed.transcript) {
          setLiveTranscript(feed.transcript);
        }

        // Append new claims, deduped against both prior state and our
        // running seen-set (cheap second line of defense vs race conditions).
        if (feed.claims?.length > 0) {
          const brandNew: Claim[] = feed.claims.filter(
            (c: Claim) =>
              !seenClaimIds.current.has(c.id) &&
              // Near-duplicate re-statements (same line repeated later in the
              // speech, or a chunk-boundary overlap) — skip; the first card
              // already carries the verdict.
              !isDuplicateQuote(c.quote, recentQuotesRef.current)
          );
          if (brandNew.length > 0) {
            for (const c of brandNew) seenClaimIds.current.add(c.id);
            setNewClaimIds(new Set(brandNew.map(c => c.id)));
            setClaims(prev => [...brandNew, ...prev]);
          }
          // Take the MAX timestamp, not the first — server may return either order.
          for (const c of feed.claims as Claim[]) {
            if (!lastPollTime.current || c.timestamp > lastPollTime.current) {
              lastPollTime.current = c.timestamp;
            }
          }
        }

        // Check if broadcast ended
        if (feed.state?.status === "off") {
          setShowSummary(true);
          setIsPlaying(false);
        }
      } catch (e) {
        console.error("Live feed poll error:", e);
        setPollError(e instanceof Error ? e.message : "Live feed unreachable");
      }
    };

    const interval = setInterval(poll, 3000);
    // Initial poll immediately
    poll();
    return () => clearInterval(interval);
  }, [isPlaying, isDemo, pollError]);

  /* ── Animate new claims ── */
  useEffect(() => {
    if (newClaimIds.size === 0) return;
    const timer = setTimeout(() => setNewClaimIds(new Set()), 500);
    return () => clearTimeout(timer);
  }, [newClaimIds]);


  /* ── Start live broadcast (transcript-driven, no mic) ── */
  const startLive = useCallback((vid: string, broadcastTitle: string) => {
    setVideoId(vid);
    setTitle(broadcastTitle);
    setIsPlaying(true);
    setIsDemo(false);
    setClaims([]);
    setLiveTranscript("");
    setRatingFilter(null);
    setShowSummary(false);
    // Flush any stale claim IDs / poll cursor from a prior session — otherwise
    // claims persisted in Upstash from a previous broadcast would surface as
    // brand-new on the first poll (audit finding #4).
    seenClaimIds.current = new Set();
    // Set the poll cursor to "now" so we only pick up claims ingested AFTER
    // this user pressed start, not whatever's stored from the last session.
    lastPollTime.current = new Date().toISOString();
    setPollError(null);

    contextRef.current = "";
    demoStartTime.current = Date.now();
  }, []);

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

      // Update transcript. Prefer real YouTube captions (verbatim, synced)
      // over the demo JSON's paraphrased segment.text — the segment text is
      // a human-written summary, not what's actually spoken in the audio.
      // Falls back to segment text if captions weren't fetched (offline, or
      // YouTube returned no timedtext, or the speech is on a non-YouTube source).
      if (realCaptions && realCaptions.length > 0) {
        // Show the most recent ~60s of real captions, joined and truncated
        // for display further down in the JSX (slice(-40) trim).
        const recent = realCaptions
          .filter(c => c.time <= vt && c.time >= vt - 60)
          .map(c => c.text);
        if (recent.length > 0) setLiveTranscript(recent.join(" "));
      } else {
        // Legacy fallback: segment-text-based subtitle.
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
              // Let the server dedupe against what's already on screen.
              recentQuotes: recentQuotesRef.current,
            }),
          })
            .then(r => r.json())
            .then(data => {
              contextRef.current = (contextRef.current + " " + capturedText).slice(-500);
              // Surface upstream errors as a banner instead of silently
              // failing — audit finding #3 (ANTHROPIC_API_KEY missing was
              // invisible to demo users).
              if (data.error) {
                setPollError(`Fact-check unavailable: ${data.error}${data.detail ? ` (${data.detail.slice(0, 80)})` : ""}`);
                return;
              }
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
            .catch(e => {
              console.error("Auto fact-check error:", e);
              setPollError(e instanceof Error ? e.message : "Auto fact-check failed");
            });
        }
      }

      // End check
      const last = demoSpeech.segments[demoSpeech.segments.length - 1];
      if (shownSegmentsRef.current.size === demoSpeech.segments.length && vt >= last.time + 10) {
        setShowSummary(true);
      }
    }, 800);

    return () => clearInterval(interval);
  }, [isDemo, isPlaying, demoSpeech, realCaptions]);

  /* ── Start demo — loads speech data into state ── */
  const startDemo = useCallback(async (speechFile?: string) => {
    demoAbortRef.current = false;
    shownSegmentsRef.current = new Set();
    setIsDemo(true);
    setIsPlaying(true);
    setClaims([]);
    setLiveTranscript("");
    setRatingFilter(null);
    setShowSummary(false);
    setDemoSpeech(null);

    contextRef.current = "";
    setRealCaptions(null);

    const file = speechFile || "sotu-2024.json";
    try {
      const res = await fetch(`/speeches/${file}`);
      const speech: DemoSpeech = await res.json();
      setVideoId(speech.videoId);
      setTitle(`DEMO — ${speech.title}, ${speech.date}`);
      demoStartTime.current = Date.now();
      // Setting state triggers the polling effect above
      setDemoSpeech(speech);

      // Fire-and-forget: pull real YouTube captions, then re-time the demo's
      // segments by fuzzy-matching each segment's first claim (or the segment
      // text itself) against the captions. Once this lands:
      //   - the subtitle line shows ACTUAL spoken words (not paraphrased)
      //   - the fact card timestamps line up with where the words occur
      // If it fails the demo still plays — just with the original approximate
      // timestamps and paraphrased subtitle.
      setCaptionsLoading(true);
      fetch("/api/fetch-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${speech.videoId}` }),
      })
        .then(r => r.json())
        .then(async (data) => {
          let captions: { time: number; text: string }[] | null = null;
          if (Array.isArray(data.segments) && data.segments.length > 0) {
            captions = data.segments;
          } else if (data.clientFetch && data.captionUrl) {
            // Server couldn't get the XML; try fetching the timedtext URL ourselves.
            try {
              const xmlResp = await fetch(data.captionUrl);
              const xml = await xmlResp.text();
              captions = parseTranscriptXml(xml);
            } catch (e) {
              console.warn("[demo] client-side timedtext fetch failed:", e);
            }
          }
          if (!captions || captions.length === 0) {
            console.warn("[demo] no captions available; subtitle and timing will be approximate");
            return;
          }

          // Re-time each segment by matching its first-claim quote (most
          // discriminating) against the captions. If no claim, fall back to
          // matching the segment's own text.
          const retimedSegments = speech.segments.map(seg => {
            const probe = seg.claims?.[0]?.quote || seg.text;
            const matched = findCaptionTimeForQuote(probe, captions!);
            return matched != null ? { ...seg, time: matched } : seg;
          });
          // Re-sort by time so the firing loop's "skip if past" logic works.
          retimedSegments.sort((a, b) => a.time - b.time);

          setRealCaptions(captions);
          setDemoSpeech({ ...speech, segments: retimedSegments });
          const fixedCount = retimedSegments.filter((s, i) => s.time !== speech.segments[i]?.time).length;
          console.log(`[demo] re-timed ${fixedCount}/${speech.segments.length} segments against real captions`);
        })
        .catch(e => console.warn("[demo] caption fetch failed; using approximate timing:", e))
        .finally(() => setCaptionsLoading(false));
    } catch (e) {
      console.error("Demo error:", e);
    }
  }, []);

  /* ── Client-side XML transcript parser (mirrors server logic) ── */
  // parseTranscriptXml is now a module-level function (hoisted above the
  // component) so startDemo can reference it without TDZ issues during
  // server-side prerendering. Function lives further up in the file.

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
      setRatingFilter(null);
      setShowSummary(false);
      setDemoSpeech(null);
  
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
  }, []);

  /* ── Stop ── */
  const stopSession = useCallback(() => {
    demoAbortRef.current = true;
    setIsPlaying(false);
    setIsDemo(false);
    setDemoSpeech(null);
    setRealCaptions(null);
    setCaptionsLoading(false);
    setManualResult(null);
    shownSegmentsRef.current = new Set();
    if (ytPlayerRef.current?.destroy) {
      try { ytPlayerRef.current.destroy(); } catch {}
      ytPlayerRef.current = null;
    }
    if (claims.length > 0) setShowSummary(true);
  }, [claims.length]);

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

        {/* Surfaces fact-check pipeline failures (missing API key, KV down,
            poll errors) so the user can see why claims aren't appearing,
            instead of staring at an empty list. Auto-clears on next successful
            poll. */}
        {pollError && (
          <div style={{
            background: "#fef2f2", border: `1px solid #fecaca`, borderLeft: `4px solid ${T.accent}`,
            borderRadius: 4, padding: "10px 14px", marginBottom: 14,
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
            fontSize: 12, fontFamily: "'DM Sans',sans-serif",
          }}>
            <div>
              <strong style={{ color: T.accent, marginRight: 6 }}>Fact-check unavailable</strong>
              <span style={{ color: T.sub }}>{pollError}</span>
            </div>
            <button onClick={() => setPollError(null)} style={{
              background: "none", border: "none", color: T.mute, cursor: "pointer",
              fontSize: 18, lineHeight: 1, padding: "0 4px",
            }} aria-label="Dismiss">×</button>
          </div>
        )}

        {/* ── Idle State: broadcast-centric ── */}
        {!isPlaying && !showSummary && (
          <div>
            {/* Hero */}
            <div style={{ textAlign: "center", marginBottom: mob ? 20 : 36, padding: mob ? "20px 0 8px" : "36px 0 12px" }}>
              <div style={{
                fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: 2, color: T.mute, marginBottom: 12,
              }}>
                VOTE UNBIASED
              </div>
              <h1 style={{
                fontFamily: "'Source Serif 4',serif", fontSize: mob ? 26 : 42, fontWeight: 900,
                color: T.ink, marginBottom: 10, lineHeight: 1.15,
              }}>
                A new way to watch the news.
              </h1>
              <p style={{
                fontFamily: "'DM Sans',sans-serif", fontSize: mob ? 13 : 15, color: T.sub,
                maxWidth: 540, margin: "0 auto", lineHeight: 1.7,
              }}>
                Watch live press conferences and political speeches with real-time AI fact-checking.
                Every economic claim verified against official data — automatically.
              </p>
            </div>

            {/* ── LIVE NOW — prominent card when a broadcast is active ── */}
            {config?.status === "live" && config.videoId && (
              <div style={{
                maxWidth: 700, margin: "0 auto 28px",
                background: `linear-gradient(135deg, ${T.ink} 0%, #2d2520 100%)`,
                borderRadius: 16, padding: mob ? 20 : 28, color: "#fff",
                position: "relative", overflow: "hidden",
              }}>
                {/* Subtle glow */}
                <div style={{
                  position: "absolute", top: -40, right: -40, width: 160, height: 160,
                  background: "radial-gradient(circle, rgba(220,38,38,0.15) 0%, transparent 70%)",
                  borderRadius: "50%",
                }} />
                <div style={{ position: "relative" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <span style={{
                      width: 10, height: 10, borderRadius: "50%", background: "#dc2626",
                      animation: "pulse 2s infinite", boxShadow: "0 0 8px rgba(220,38,38,0.5)",
                    }} />
                    <span style={{
                      fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 800,
                      textTransform: "uppercase", letterSpacing: 2, color: "#dc2626",
                    }}>LIVE NOW</span>
                    {config.startedAt && (
                      <span style={{
                        fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#9a9490",
                        marginLeft: "auto",
                      }}>{timeAgo(config.startedAt)}</span>
                    )}
                  </div>
                  <div style={{
                    fontFamily: "'Source Serif 4',serif", fontSize: mob ? 20 : 26, fontWeight: 700,
                    marginBottom: 6, lineHeight: 1.2,
                  }}>{config.title}</div>
                  <div style={{
                    fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#b8b0a8",
                    marginBottom: 20,
                  }}>{config.source === "youtube" ? "YouTube" : config.source} broadcast</div>
                  <button
                    onClick={() => startLive(config.videoId, config.title)}
                    style={{
                      background: "#dc2626", color: "#fff", border: "none", borderRadius: 10,
                      padding: "14px 32px", fontFamily: "'DM Sans',sans-serif", fontSize: 15,
                      fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                      boxShadow: "0 4px 16px rgba(220,38,38,0.3)",
                    }}
                  >
                    <span style={{ fontSize: 18 }}>&#9654;</span> Watch with AI Fact-Check
                  </button>
                </div>
              </div>
            )}

            {/* ── Detected live streams (keyless channel discovery) ── */}
            {/* Streams found by /api/live-discover on watched channels that
                aren't in the schedule and have no worker running. Viewers can
                still watch here; the fact-check feed attaches automatically
                if/when the ingest pipeline starts for the same broadcast. */}
            {(!config || config.status !== "live") && discovered.length > 0 && discovered.map(d => (
              <div key={d.videoId} style={{
                maxWidth: 700, margin: "0 auto 20px",
                background: `linear-gradient(135deg, ${T.ink} 0%, #2d2520 100%)`,
                borderRadius: 16, padding: mob ? 18 : 24, color: "#fff",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: "50%", background: "#dc2626",
                    animation: "pulse 2s infinite", boxShadow: "0 0 8px rgba(220,38,38,0.5)",
                  }} />
                  <span style={{
                    fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 800,
                    textTransform: "uppercase", letterSpacing: 2, color: "#dc2626",
                  }}>LIVE ON {d.channelLabel.toUpperCase()}</span>
                </div>
                <div style={{
                  fontFamily: "'Source Serif 4',serif", fontSize: mob ? 18 : 22, fontWeight: 700,
                  marginBottom: 14, lineHeight: 1.25,
                }}>{d.title || `${d.channelLabel} — Live broadcast`}</div>
                <button
                  onClick={() => startLive(d.videoId, d.title || `${d.channelLabel} — Live`)}
                  style={{
                    background: "#dc2626", color: "#fff", border: "none", borderRadius: 10,
                    padding: "12px 28px", fontFamily: "'DM Sans',sans-serif", fontSize: 14,
                    fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                    boxShadow: "0 4px 16px rgba(220,38,38,0.3)",
                  }}
                >
                  <span style={{ fontSize: 16 }}>&#9654;</span> Watch Live
                </button>
                <div style={{
                  fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: "#9a9490", marginTop: 12,
                }}>
                  Detected automatically on a watched channel · fact-checks attach in real time when the analysis pipeline is running
                </div>
              </div>
            ))}

            {/* ── Nothing live — editorial message ── */}
            {/* Hidden when a discovered stream card is showing above — saying
                "no live broadcast" next to a LIVE card reads as a bug. */}
            {(!config || config.status !== "live") && discovered.length === 0 && (
              <div style={{
                maxWidth: 700, margin: "0 auto 28px", textAlign: "center",
                background: T.card, border: `1px solid ${T.rule}`, borderRadius: 14,
                padding: mob ? "20px 16px" : "28px 32px",
              }}>
                <div style={{
                  fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: 1.5, color: T.mute, marginBottom: 8,
                }}>No live broadcast right now</div>
                <div style={{
                  fontFamily: "'Source Serif 4',serif", fontSize: mob ? 16 : 20, fontWeight: 700,
                  color: T.ink, marginBottom: 8, lineHeight: 1.3,
                }}>
                  Watch a past speech from the archive below,<br />or analyze any YouTube video.
                </div>

                {/* Upcoming schedule — driven by public/live-schedule.json
                    via /api/live-schedule. The GitHub Action reads the same
                    endpoint, so what's shown here is exactly what will
                    auto-trigger when its scheduledStart hits. */}
                {schedule && (schedule.active || (schedule.upcoming && schedule.upcoming.length > 0)) && (
                  <div style={{
                    marginTop: 16, padding: "14px 18px", background: T.paper,
                    borderRadius: 8, border: `1px solid ${T.rule}`,
                    display: "inline-flex", flexDirection: "column", gap: 10,
                    minWidth: 280, textAlign: "left",
                  }}>
                    {/* Currently live (auto-triggered by the GitHub Action) */}
                    {schedule.active && (() => {
                      const startMs = Date.parse(schedule.active!.scheduledStart);
                      const nowMs = Date.now();
                      const hasStarted = nowMs >= startMs;
                      return (
                        <div>
                          <div style={{
                            display: "flex", alignItems: "center", gap: 6,
                            fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700,
                            textTransform: "uppercase", letterSpacing: 1.5,
                            color: hasStarted ? "#dc2626" : T.gold,
                          }}>
                            <span style={{
                              width: 6, height: 6, borderRadius: "50%",
                              background: hasStarted ? "#dc2626" : T.gold,
                              animation: hasStarted ? "pulse 2s infinite" : "none",
                            }} />
                            {hasStarted ? "LIVE NOW" : "STARTING SOON"}
                          </div>
                          <div style={{ fontFamily: "'Source Serif 4',serif", fontSize: 16, fontWeight: 600, color: T.ink, marginTop: 4 }}>
                            {schedule.active!.title}
                          </div>
                          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: T.sub, marginTop: 2 }}>
                            {schedule.active!.speaker} · {schedule.active!.source}
                          </div>
                          {!hasStarted && (
                            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: T.gold, marginTop: 4, fontWeight: 600 }}>
                              Starts {fmtCountdown(Math.floor((startMs - nowMs) / 1000))}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Next scheduled (or all upcoming if nothing's live yet) */}
                    {(schedule.active ? schedule.upcoming.filter(e => e.id !== schedule.active!.id).slice(0, 2) : schedule.upcoming.slice(0, 3)).map((ev) => {
                      const secs = Math.floor((Date.parse(ev.scheduledStart) - Date.now()) / 1000);
                      return (
                        <div key={ev.id} style={{
                          paddingTop: schedule.active ? 8 : 0,
                          borderTop: schedule.active ? `1px solid ${T.rule}` : "none",
                        }}>
                          {(!schedule.active) && (
                            <div style={{
                              fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700,
                              textTransform: "uppercase", letterSpacing: 1.5, color: T.sub, marginBottom: 4,
                            }}>NEXT BROADCAST</div>
                          )}
                          <div style={{
                            fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: T.ink,
                            display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap",
                          }}>
                            <span style={{ fontWeight: 600 }}>{ev.title}</span>
                            <span style={{ color: T.mute, fontSize: 11 }}>· {ev.speaker}</span>
                          </div>
                          <div style={{
                            fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: T.sub, marginTop: 2,
                            display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
                          }}>
                            <span>{fmtEventDate(ev.scheduledStart)}</span>
                            {secs > 0 && (
                              <>
                                <span style={{ color: T.mute }}>·</span>
                                <span style={{ color: T.accent, fontWeight: 600 }}>{fmtCountdown(secs)}</span>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Tiny footer reassuring viewers this isn't manually
                        operated — sets expectations correctly. */}
                    <div style={{
                      fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: T.mute,
                      letterSpacing: 0.5, marginTop: 4, paddingTop: 6,
                      borderTop: `1px solid ${T.rule}`,
                    }}>
                      Auto-broadcast · fact-checks appear in real time when the event begins
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Speech Archive ── */}
            <div style={{ maxWidth: 900, margin: "0 auto 28px" }}>
              <div style={{
                fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: 2, color: T.sub, marginBottom: 14,
                paddingLeft: 4,
              }}>
                SPEECH ARCHIVE
              </div>
              <div style={{
                display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 14,
              }}>
                {(config?.demos || [
                  { title: "Trump Address to Congress 2025", speaker: "Donald Trump", file: "trump-congress-2025.json", duration: "99m", claims: 20, scores: { true: 0, mostly_true: 4, misleading: 7, false: 6, unverifiable: 1 }, date: "2025-03-04" },
                  { title: "State of the Union 2024", speaker: "Joe Biden", file: "sotu-2024.json", duration: "72m", claims: 27, scores: { true: 10, mostly_true: 10, misleading: 4, false: 1, unverifiable: 2 }, date: "2024-03-07" },
                ]).map((demo, i) => {
                  const trueish = (demo.scores.true || 0) + (demo.scores.mostly_true || 0);
                  const falseish = (demo.scores.false || 0) + (demo.scores.misleading || 0);
                  const accuracy = demo.claims > 0 ? Math.round((trueish / demo.claims) * 100) : 0;
                  const accColor = accuracy >= 60 ? "#0d7377" : accuracy >= 40 ? "#ca8a04" : "#c2410c";

                  return (
                    <div key={i} style={{
                      background: T.card, border: `1px solid ${T.rule}`, borderRadius: 12,
                      padding: mob ? 16 : 20, display: "flex", flexDirection: "column",
                      transition: "box-shadow 0.2s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)")}
                    onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
                    >
                      {/* Top row: speaker + date */}
                      <div style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10,
                      }}>
                        <span style={{
                          fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700,
                          textTransform: "uppercase", letterSpacing: 1.5, color: T.mute,
                        }}>{demo.speaker}</span>
                        <span style={{
                          fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: T.mute,
                        }}>{new Date(demo.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                      </div>

                      {/* Title */}
                      <div style={{
                        fontFamily: "'Source Serif 4',serif", fontSize: mob ? 16 : 18, fontWeight: 700,
                        color: T.ink, marginBottom: 12, lineHeight: 1.3,
                      }}>{demo.title}</div>

                      {/* Accuracy bar */}
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <div style={{
                            flex: 1, height: 6, background: T.rule, borderRadius: 3, overflow: "hidden",
                          }}>
                            <div style={{
                              width: `${accuracy}%`, height: "100%", borderRadius: 3, background: accColor,
                              transition: "width 0.5s ease",
                            }} />
                          </div>
                          <span style={{
                            fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 800, color: accColor,
                            minWidth: 36, textAlign: "right",
                          }}>{accuracy}%</span>
                        </div>
                        <div style={{
                          fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: T.mute,
                        }}>Accuracy — {demo.claims} claims analyzed</div>
                      </div>

                      {/* Rating breakdown */}
                      <div style={{
                        display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14,
                        padding: "8px 10px", background: T.paper, borderRadius: 6,
                      }}>
                        {[
                          { label: "True", count: (demo.scores.true || 0) + (demo.scores.mostly_true || 0), color: "#0d7377" },
                          { label: "Misleading", count: demo.scores.misleading || 0, color: "#ca8a04" },
                          { label: "False", count: demo.scores.false || 0, color: "#c2410c" },
                        ].map(({ label, count, color }) => count > 0 ? (
                          <span key={label} style={{
                            fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600,
                            display: "flex", alignItems: "center", gap: 4,
                          }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                            <span style={{ color: T.sub }}>{count} {label}</span>
                          </span>
                        ) : null)}
                      </div>

                      {/* Meta + watch button */}
                      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{
                          fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: T.mute,
                        }}>{demo.duration}</span>
                        <button
                          onClick={() => startDemo(demo.file)}
                          style={{
                            background: T.ink, color: "#fff", border: "none", borderRadius: 8,
                            padding: "9px 20px", fontFamily: "'DM Sans',sans-serif", fontSize: 12,
                            fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                          }}
                        >
                          <span style={{ fontSize: 11 }}>&#9654;</span> Watch &amp; Fact-Check
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Analyze Any Speech (secondary) ── */}
            <div style={{
              maxWidth: 600, margin: "0 auto 24px", padding: mob ? "16px" : "18px 24px",
              background: T.card, border: `1px solid ${T.rule}`, borderRadius: 10,
            }}>
              <div style={{
                fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: 1.5, color: T.mute, marginBottom: 10,
              }}>
                ANALYZE ANY SPEECH
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                <input
                  type="text"
                  value={urlInput}
                  onChange={e => { setUrlInput(e.target.value); setUrlError(""); }}
                  onKeyDown={e => { if (e.key === "Enter" && urlInput.trim()) startFromUrl(urlInput.trim()); }}
                  placeholder="Paste a YouTube URL…"
                  style={{
                    flex: 1, padding: "9px 14px", borderRadius: 8,
                    border: `1px solid ${urlError ? "#dc2626" : T.rule}`,
                    fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: T.ink,
                    background: T.paper, outline: "none",
                  }}
                />
                <button
                  onClick={() => urlInput.trim() && startFromUrl(urlInput.trim())}
                  disabled={urlLoading || !urlInput.trim()}
                  style={{
                    background: urlLoading ? T.rule : T.ink, color: "#fff",
                    border: "none", borderRadius: 8, padding: "9px 18px",
                    fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700,
                    cursor: urlLoading || !urlInput.trim() ? "default" : "pointer",
                    opacity: urlLoading || !urlInput.trim() ? 0.6 : 1,
                    whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  {urlLoading ? (
                    <><span style={{ animation: "pulse 1s infinite" }}>&#8987;</span> Loading…</>
                  ) : (
                    <>&#9654; Analyze</>
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
                Paste any YouTube video with captions — the AI reads the transcript and fact-checks economic claims as the speech plays.
              </div>
            </div>

            {/* ── Editorial explanation ── */}
            <div style={{
              maxWidth: 600, margin: "0 auto", textAlign: "center",
              fontFamily: "'DM Sans',sans-serif", padding: "16px 0 0",
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: 2, color: T.mute, marginBottom: 12,
              }}>HOW IT WORKS</div>
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: mob ? 12 : 24,
              }}>
                {[
                  { num: "1", title: "Tune in", desc: "Watch live White House press conferences and political speeches right here." },
                  { num: "2", title: "AI reads along", desc: "The transcript is analyzed in real-time, identifying every economic claim." },
                  { num: "3", title: "Data checks in", desc: "Claims are verified against BLS, BEA, Treasury, and FRED — with sources." },
                ].map((step) => (
                  <div key={step.num}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%", background: T.ink, color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "'Source Serif 4',serif", fontSize: 13, fontWeight: 700,
                      margin: "0 auto 8px",
                    }}>{step.num}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 4 }}>{step.title}</div>
                    <div style={{ fontSize: 11, color: T.mute, lineHeight: 1.5 }}>{step.desc}</div>
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
                {/* Caption sync indicator (demo only). 'Synced' = real
                    YouTube captions loaded; subtitles + claim timestamps
                    are aligned to actual audio. 'Approximate' = fallback to
                    the demo JSON's hand-curated round-number timestamps. */}
                {isDemo && (
                  captionsLoading ? (
                    <span style={{
                      flexShrink: 0, fontSize: 9, color: "#9a9490",
                      padding: "2px 6px", border: "1px solid #3a3a3a", borderRadius: 3,
                      letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 600,
                    }} title="Fetching real YouTube captions to sync subtitle + fact-check timing">
                      syncing…
                    </span>
                  ) : realCaptions ? (
                    <span style={{
                      flexShrink: 0, fontSize: 9, color: "#0d7377",
                      padding: "2px 6px", background: "#0d737722", border: "1px solid #0d7377",
                      borderRadius: 3, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 700,
                    }} title="Subtitle text + fact-check timestamps aligned to real YouTube captions">
                      ✓ synced
                    </span>
                  ) : (
                    <span style={{
                      flexShrink: 0, fontSize: 9, color: "#ca8a04",
                      padding: "2px 6px", background: "#ca8a0422", border: "1px solid #ca8a04",
                      borderRadius: 3, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 700,
                    }} title="Could not fetch real captions — subtitle + timestamps are approximate">
                      approx.
                    </span>
                  )
                )}
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

                {isDemo && (
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: T.gold, fontWeight: 600 }}>
                    AI analyzing transcript...
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

              {/* Rating filter chips — visible once there's something to filter */}
              {claims.length > 0 && (
                <div style={{
                  display: "flex", flexWrap: "wrap", gap: 5, padding: "8px 10px",
                  background: T.card, borderLeft: `1px solid ${T.rule}`, borderRight: `1px solid ${T.rule}`,
                }}>
                  {[null, ...Object.keys(RATING_COLORS)].map(r => {
                    const count = r === null
                      ? claims.length
                      : claims.filter(c => c.rating === r).length;
                    if (r !== null && count === 0) return null;
                    const isActive = ratingFilter === r;
                    const chipColor = r === null ? T.ink : RATING_COLORS[r].bg;
                    return (
                      <button
                        key={r ?? "all"}
                        onClick={() => setRatingFilter(isActive ? null : r)}
                        style={{
                          fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700,
                          padding: "3px 9px", borderRadius: 12, cursor: "pointer",
                          letterSpacing: 0.3,
                          border: `1px solid ${isActive ? chipColor : T.rule}`,
                          background: isActive ? chipColor : T.card,
                          color: isActive ? "#fff" : T.sub,
                          transition: "all 0.15s",
                        }}
                      >
                        {r === null ? "ALL" : r} {count}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Claims list */}
              <div style={{
                flex: 1, overflowY: "auto", padding: "8px 0",
                background: T.paper, border: `1px solid ${T.rule}`, borderTop: "none",
                borderRadius: "0 0 8px 8px",
                // On mobile the panel sits below the video in normal flow;
                // give the list its own scroll so a long feed doesn't turn
                // the page into an endless scroll past the summary.
                maxHeight: mob ? 420 : undefined,
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
                  {claims.length > 0 && filteredClaims.length === 0 && (
                    <div style={{
                      textAlign: "center", padding: "24px 16px",
                      fontFamily: "'DM Sans',sans-serif", color: T.mute, fontSize: 11,
                    }}>
                      No {ratingFilter} claims yet.
                    </div>
                  )}
                  {filteredClaims.map(c => (
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
