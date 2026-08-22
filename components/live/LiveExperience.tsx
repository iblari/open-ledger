"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Brand from "@/components/Brand";
import Link from "next/link";
import { isDuplicateQuote } from "@/lib/claim-utils";
import UpcomingEvents from "@/components/UpcomingEvents";
import CredibilityTimeline, { type TimelineTick } from "@/components/live/CredibilityTimeline";
import RunningScore from "@/components/live/RunningScore";
import RecordSheet from "@/components/live/RecordSheet";
import ControlRoom from "@/components/live/ControlRoom";
import { toVerdict, toOutcome } from "@/lib/live-design";

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
  /** Tier-3 web verification: settled by live search, with real citations. */
  webVerified?: boolean;
  sources?: { title: string; url: string }[];
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
  // Verbatim caption track baked in offline by scripts/retime-speeches.mjs.
  // When present, segment times are already caption-aligned and the page
  // skips the runtime transcript fetch entirely.
  captions?: { time: number; text: string }[];
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

/* ── "Add to calendar" links for scheduled broadcasts ─────────── */
// Zero-infrastructure reminders: Google Calendar prefill link + a per-event
// .ics (Apple/Outlook, with a built-in 15-min alarm via /api/schedule.ics).
function gcalUrl(ev: { title: string; scheduledStart: string; scheduledEnd: string }): string {
  const f = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: `🔴 ${ev.title} — live fact-check`,
    dates: `${f(ev.scheduledStart)}/${f(ev.scheduledEnd)}`,
    details: "Watch with real-time AI fact-checking against official data: https://voteunbiased.org/live",
    location: "https://voteunbiased.org/live",
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
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

/* ── Caption Karaoke ──────────────────────────────────────────── */
// Word-synced transcript strip. The embedded captions are ~15s blocks with a
// start time each; we don't have word-level timings (YouTube doesn't expose
// them), so the current word is estimated by LINEAR INTERPOLATION: fraction
// of the block elapsed × word count. Speech rate within a block is near
// enough to uniform that the highlight tracks within a word or two.
//
// Rendering shows a sliding window of words around the highlight — spoken
// words in ink, current word on an accent chip, upcoming words muted — sized
// so the strip never clips a line mid-sentence (the old strip stuffed 40
// words into a 60px overflow:hidden box).
function CaptionKaraoke({ captions, vt }: {
  captions: { time: number; text: string }[]; vt: number;
}) {
  // Latest caption block that has started.
  let idx = -1;
  for (let i = captions.length - 1; i >= 0; i--) {
    if (vt >= captions[i].time) { idx = i; break; }
  }
  if (idx < 0) {
    return (
      <span style={{ color: T.mute, fontStyle: "italic" }}>
        Waiting for speech…
      </span>
    );
  }

  const seg = captions[idx];
  const nextT = captions[idx + 1]?.time ?? seg.time + 15;
  // Strip stenography artifacts: ">>" speaker-change markers show up in
  // broadcast caption tracks and look like garbage in the ticker.
  const words = seg.text.split(/\s+/).filter(w => w && w !== ">>" && w !== ">");
  const span = Math.max(1, nextT - seg.time);
  const prog = Math.min(0.999, Math.max(0, (vt - seg.time) / span));
  const cur = Math.min(words.length - 1, Math.floor(prog * words.length));

  // Sliding window: enough context to read, few enough words to always fit.
  const BACK = 14, FWD = 10;
  const start = Math.max(0, cur - BACK);
  const end = Math.min(words.length, cur + 1 + FWD);

  return (
    <span>
      {start > 0 && <span style={{ color: T.mute, opacity: 0.5 }}>… </span>}
      {words.slice(start, end).map((w, i) => {
        const wi = start + i;
        const isCur = wi === cur;
        const spoken = wi < cur;
        return (
          <span
            key={wi}
            style={isCur ? {
              background: T.accent, color: "#fff", borderRadius: 3,
              padding: "0 4px", fontWeight: 600,
            } : {
              color: spoken ? T.ink : T.mute,
              opacity: spoken ? 1 : 0.55,
            }}
          >
            {w}{" "}
          </span>
        );
      })}
      {end < words.length && <span style={{ color: T.mute, opacity: 0.5 }}>…</span>}
    </span>
  );
}

/* ── Fact-Check Card ──────────────────────────────────────────── */
function FactCard({ claim, isNew, onSeek }: { claim: Claim; isNew: boolean; onSeek?: (claim: Claim) => void }) {
  const [expanded, setExpanded] = useState(false);
  const rc = RATING_COLORS[claim.rating] || RATING_COLORS.UNVERIFIABLE;
  // Tier-3 verification attaches the pages actually read; those are real
  // citations and outrank the keyword-detected agency landing pages.
  const cited = (claim.sources || []).map(s => ({ label: s.title.slice(0, 42), url: s.url }));
  const sources = cited.length > 0 ? cited : detectSources(claim.actual);

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
            onClick={(e) => { e.stopPropagation(); onSeek?.(claim); }}
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
            {claim.webVerified ? "Checked against:" : "Verify:"}
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
  // UNVERIFIABLE claims are excluded from the accuracy denominator — "we
  // couldn't check it" is not the same as "it was false". With zero
  // verifiable claims the meter is hidden rather than showing a scary 0%.
  const verifiableTotal = total - (counts["UNVERIFIABLE"] || 0);
  const accuracy = verifiableTotal > 0 ? Math.round((trueish / verifiableTotal) * 100) : null;

  return (
    <div style={{
      background: T.card, border: `1px solid ${T.rule}`, borderRadius: 8,
      padding: "10px 14px", fontFamily: "'DM Sans',sans-serif",
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: T.mute, marginBottom: 6 }}>
        Session Summary
      </div>
      {accuracy !== null && (
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
          <div style={{ fontSize: 9, color: T.mute }}>Accuracy Score · verifiable claims only</div>
        </div>
      )}
      {accuracy === null && total > 0 && (
        <div style={{ fontSize: 10, color: T.mute, marginBottom: 8, lineHeight: 1.5 }}>
          No verifiable claims yet — unverifiable statements don&apos;t count toward accuracy.
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
export default function LiveExperience({ autoStartReplay }: { autoStartReplay?: string }) {
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
  // Replay of a recently-ended broadcast: video plays back with the claims
  // generated while it was LIVE preloaded into the panel — zero additional
  // Deepgram/Claude spend. No polling, no live pipeline.
  const [isReplay, setIsReplay] = useState(false);
  /* ── Replay time realignment ──────────────────────────────────────────
     Claim times are anchored to when the STREAM started, but the VOD that
     YouTube keeps is often only the tail of it — one archived Cabinet
     meeting carries claims out to 176:19 while the published video is
     57:16, so every timecode overshoots and seeking lands nowhere.
     Once the player reports its real duration we shift everything by the
     overshoot, which aligns the end of our coverage with the end of the
     video. Display-only: the stored record keeps its true stream times. */
  const [timeShift, setTimeShift] = useState(0);
  // Full archived transcript shown in replay mode (live mode shows the
  // rolling Deepgram tail instead).
  const [replayTranscript, setReplayTranscript] = useState("");
  const [videoId, setVideoId] = useState("");
  const [title, setTitle] = useState("");
  const [claims, setClaims] = useState<Claim[]>([]);
  const [liveTranscript, setLiveTranscript] = useState("");
  // When the transcriber last delivered speech this session. Null until the
  // first line arrives, so a broadcast that never starts transcribing is
  // distinguishable from one that has simply gone quiet.
  const lastSpeechAt = useRef<number | null>(null);
  const [silentFor, setSilentFor] = useState<number | null>(null);
  useEffect(() => {
    if (!liveTranscript) return;
    lastSpeechAt.current = Date.now();
    setSilentFor(0);
  }, [liveTranscript]);
  useEffect(() => {
    if (!isPlaying || isDemo || isReplay) { setSilentFor(null); return; }
    // Measured from when this session started watching if nothing has ever
    // arrived — otherwise a dead chain reads as "0 seconds silent" forever.
    const started = Date.now();
    const id = setInterval(() => {
      const base = lastSpeechAt.current ?? started;
      setSilentFor(Math.round((Date.now() - base) / 1000));
    }, 5000);
    return () => clearInterval(id);
  }, [isPlaying, isDemo, isReplay]);
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
  // "The record" export sheet (spec 2a): when the briefing ends the page
  // becomes a document, reachable any time from the record bar.
  const [recordOpen, setRecordOpen] = useState(false);
  const [isManualChecking, setIsManualChecking] = useState(false);
  const [manualResult, setManualResult] = useState<Claim[] | null>(null);
  const [manualNote, setManualNote] = useState<string | null>(null);
  const [newClaimIds, setNewClaimIds] = useState<Set<string>>(new Set());
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState("");
  // Whether server-side transcript fetching is CAPABLE right now. YouTube
  // blocks caption access from datacenter IPs; the server reports true only
  // when an egress proxy (YT_PROXY_URL) is configured. When false, the
  // Analyze-any-speech box is hidden — offering a feature that fails on
  // every input is worse than not offering it. Flips on automatically the
  // moment the env var is set; no code change needed.
  const [transcriptCapable, setTranscriptCapable] = useState(false);
  useEffect(() => {
    fetch("/api/fetch-transcript")
      .then(r => r.json())
      .then(d => setTranscriptCapable(Boolean(d.enabled)))
      .catch(() => setTranscriptCapable(false));
  }, []);

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
  // Caption time of the FIRST segment sitting in autoCheckBuffer. Claims
  // found in a batch default to this (where the words started) instead of
  // the flush time (~15-30s after the words) — see the enrichment below.
  const bufferStartRef = useRef<number | null>(null);
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

  /* ── Seek to the moment a claim was spoken ── */
  // Two timelines exist and they DON'T share an origin:
  //   - demo/URL claims: videoTime is derived from YouTube captions → it's a
  //     real position on the player timeline. Seek directly.
  //   - live claims: videoTime is "seconds since the WORKER started capturing"
  //     — the viewer's player timeline knows nothing about that origin, which
  //     is why live seeks used to land in the wrong place. Instead we map via
  //     wall-clock age: claim.timestamp is when ingest finished, so the words
  //     were spoken roughly (now - timestamp) + pipeline-delay seconds ago —
  //     jump that far back from the current playhead. The pipeline delay
  //     (audio chunking + Deepgram + Claude) is ~8s and roughly constant.
  const LIVE_PIPELINE_DELAY_S = 8;
  const seekToClaim = useCallback((claim: Claim) => {
    // Three different origins, one function. The wall-clock mapping below is
    // only meaningful at the live edge; replays need the stream->video shift.
    if (isReplay) {
      // Stored claims are stamped in STREAM time; the player runs on VIDEO
      // time, and for a VOD that is only the tail of a longer stream the two
      // differ by timeShift. Seeking with the raw stored number therefore
      // landed minutes away from the quote.
      if (claim.videoTime != null && claim.videoTime > 0) {
        // Land WELL before the quote and let it arrive. Calibrated against
        // the Aug 10 signing replay: with an 8s lead the quoted line was
        // still 10–15s BEFORE the landing point — the stamp marks the end of
        // a transcript chunk that itself trails the speech by the pipeline's
        // assembly-and-check delay, so the words sit 20–30s ahead of the
        // stamp, not ~15. A 30s lead puts the quote ~5–15s AFTER landing:
        // you get a breath of context and then hear the line, which beats
        // landing "exactly" on it and clipping the front half. Deliberately
        // biased early — hearing 15s of lead-in is mildly slow, but landing
        // after the quote makes the feature feel broken.
        const LEAD_S = 30;
        seekVideo(Math.max(0, claim.videoTime - timeShift - LEAD_S));
      }
      return;
    }
    if (!isDemo) {
      const player = ytPlayerRef.current;
      if (player?.getCurrentTime) {
        try {
          const ageSec = (Date.now() - Date.parse(claim.timestamp)) / 1000;
          if (isFinite(ageSec) && ageSec >= 0) {
            const target = Math.max(0, player.getCurrentTime() - ageSec - LIVE_PIPELINE_DELAY_S);
            seekVideo(target);
            return;
          }
        } catch { /* fall through to videoTime */ }
      }
    }
    if (claim.videoTime != null && claim.videoTime > 0) seekVideo(claim.videoTime);
    // timeShift MUST be here. Without it this closure captures the initial 0
    // and every replay seek silently ignores the stream/video offset — the
    // fourth stale-closure bug in this file, and the reason the ESLint rule
    // react-hooks/exhaustive-deps is worth turning on.
  }, [isDemo, isReplay, seekVideo, timeShift]);

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
          // videoId may be EMPTY for monitor-mode broadcasts (audio ingested
          // from a non-embeddable source) — those are still live and must
          // surface here; the playing view renders the audio-monitor panel.
          if (feed.state?.status === "live") {
            // Live broadcast active — build config from API state
            setConfig({
              status: "live",
              title: feed.state.title,
              source: feed.state.source || "youtube",
              videoId: feed.state.videoId || "",
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
  // Whether THIS viewing session ever saw the ingest pipeline live. Guards
  // the end-of-broadcast check: a feed that was never live isn't "ended".
  const sawPipelineLive = useRef(false);
  // Quotes of the most recent claims on screen, mirrored into a ref so the
  // poll/auto-check closures can (a) drop near-duplicate re-statements
  // client-side and (b) tell the server what we already have (recentQuotes).
  const recentQuotesRef = useRef<string[]>([]);
  useEffect(() => {
    recentQuotesRef.current = claims.slice(0, 30).map(c => c.quote);
  }, [claims]);

  useEffect(() => {
    if (!isPlaying || isDemo || isReplay) return;

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
        // Clear via the updater form, and never read pollError here.
        //
        // pollError was in this effect's dependency array while the poll
        // both set and cleared it — so every flap tore down the interval and
        // built a new one, and a single failed poll followed by a good one
        // restarted the timer mid-broadcast. Reading it also captured a
        // stale value in the closure. The updater touches state only when it
        // actually changes, so the interval now survives the whole session.
        setPollError(prev => (prev === null ? prev : null));

        // Update transcript — ONLY while the ingest pipeline is actually
        // live. The KV transcript persists after a broadcast (and after
        // tests), so unconditionally displaying it put months-old test
        // text under an unrelated stream (observed: May test transcript
        // under the July 4th concert).
        if (feed.transcript && feed.state?.status === "live") {
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

        // Check if broadcast ended. ONLY treat "off" as an ending if this
        // session actually saw the pipeline live at some point — discovered
        // streams (channel-watcher) play without a worker, so the feed
        // reports "off" from the very first poll; ending on that killed the
        // viewer's session instantly with a "0 claims" summary.
        if (feed.state?.status === "live") {
          sawPipelineLive.current = true;
        }
        if (feed.state?.status === "off" && sawPipelineLive.current) {
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
    // pollError deliberately NOT a dependency — see above. The interval must
    // outlive transient feed errors.
  }, [isPlaying, isDemo, isReplay]);

  /* ── Recent broadcasts (last 72h, replayable with stored claims) ── */
  const [recent, setRecent] = useState<{
    videoId: string; title: string; source: string;
    startedAt: string; endedAt: string; claims: Claim[];
  }[]>([]);
  useEffect(() => {
    if (isPlaying) return;
    let cancelled = false;
    async function loadRecent() {
      try {
        const resp = await fetch("/api/live-recent");
        if (!resp.ok) return;
        const data = await resp.json();
        if (!cancelled && Array.isArray(data.recent)) setRecent(data.recent);
      } catch { /* section is additive — silent failure OK */ }
    }
    loadRecent();
    const id = setInterval(loadRecent, 120000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isPlaying]);

  /* ── Replay a recent broadcast — claims preloaded, zero API spend ── */
  const replayStartedAt = useRef(Date.now());
  const startReplay = useCallback((b: {
    videoId: string; title: string; claims: Claim[]; transcript?: string;
  }) => {
    replayStartedAt.current = Date.now();
    demoAbortRef.current = true;
    setIsDemo(false);
    setIsReplay(true);
    setIsPlaying(true);
    setVideoId(b.videoId);
    setTitle(b.title);
    setClaims(b.claims);
    setLiveTranscript("");
    setReplayTranscript(b.transcript || "");
    setRealCaptions(null);
    setRatingFilter(null);
    setShowSummary(false);
    setPollError(null);
  }, []);

  /* ── Replay transcript segments — new archives carry [mm:ss] markers per
     ~15s chunk, which lets the replay transcript scroll in sync with the
     video. Marker-less archives (pre-fix) fall back to a static block. ── */
  const replaySegments = useMemo(() => {
    if (!replayTranscript) return [] as { t: number; text: string }[];
    const out: { t: number; text: string }[] = [];
    const re = /\[(\d+):(\d\d)\]\s?([^\n]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(replayTranscript))) {
      const txt = m[3].trim();
      if (txt) out.push({ t: Number(m[1]) * 60 + Number(m[2]), text: txt });
    }
    return out;
  }, [replayTranscript]);

  /* ── Auto-open a broadcast chosen from the off-air archive ──
     LiveShell hands us a videoId; as soon as the recent list arrives we
     start that replay, so choosing a row goes straight into the record
     instead of dropping the visitor on another index. */
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStartReplay || autoStarted.current || recent.length === 0) return;
    const target = recent.find(b => b.videoId === autoStartReplay);
    if (target) { autoStarted.current = true; startReplay(target); }
  }, [autoStartReplay, recent, startReplay]);

  useEffect(() => {
    if (!isReplay || !isPlaying) { setTimeShift(0); return; }
    let tries = 0;
    const id = setInterval(() => {
      const dur = ytPlayerRef.current?.getDuration?.() ?? 0;
      if (dur > 30) {
        clearInterval(id);
        // ANCHOR ON THE TRANSCRIPT END, not the last claim. The worker
        // records until the stream ends, so the final transcript marker is
        // the stream's true length; the last CLAIM can fall minutes earlier
        // (nobody makes checkable claims during the walk-out music). On the
        // Aug 10 signing the last claim was 50:06 but the transcript ran to
        // 51:49 — anchoring on the claim underestimated the shift by 103s,
        // so every fact-click landed ~1:43 after the words were spoken.
        const lastSegment = replaySegments.length
          ? replaySegments[replaySegments.length - 1].t : 0;
        const maxClaim = Math.max(0, ...claims.map(c => c.videoTime ?? 0));
        const streamEnd = Math.max(lastSegment, maxClaim);
        const over = streamEnd - dur;
        // Only correct a real overshoot; a minute of slack is normal drift.
        setTimeShift(over > 60 ? Math.round(over) : 0);
      } else if (++tries > 25) {
        clearInterval(id);
      }
    }, 400);
    return () => clearInterval(id);
  }, [isReplay, isPlaying, claims, replaySegments]);

  /* ── Caption clock — drives the word-synced transcript strip ── */
  // 300ms tick while captions are loaded: fast enough that the highlighted
  // word advances smoothly (speech ≈ 2-3 words/sec), cheap enough that the
  // re-render (one small component) is negligible.
  const [captionClock, setCaptionClock] = useState(0);
  // The player's own reported length, so the timeline axis is the video.
  const [videoDuration, setVideoDuration] = useState(0);
  useEffect(() => {
    const hasSync = (realCaptions && realCaptions.length > 0) || (isReplay && replaySegments.length > 0);
    if (!isPlaying || !hasSync) return;
    const id = setInterval(() => {
      let t = (Date.now() - demoStartTime.current) / 1000;
      if (ytPlayerRef.current?.getCurrentTime) {
        try { t = ytPlayerRef.current.getCurrentTime(); } catch { /* wall-clock fallback */ }
      }
      setCaptionClock(t);
      const d = ytPlayerRef.current?.getDuration?.() ?? 0;
      if (d > 60) setVideoDuration(prev => (Math.abs(prev - d) > 1 ? d : prev));
    }, 300);
    return () => clearInterval(id);
  }, [isPlaying, realCaptions, isReplay, replaySegments]);

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
    sawPipelineLive.current = false;
    setPollError(null);

    contextRef.current = "";
    demoStartTime.current = Date.now();
  }, []);

  /* ── Initialize YT Player whenever a video is playing ── */
  // Live mode used to render a plain <iframe> (no YT API instance), which
  // left seekVideo() on the postMessage fallback and gave us no
  // getCurrentTime() — the thing live-claim seeking needs (see seekToClaim).
  // Now both demo and live mount a real YT.Player.
  useEffect(() => {
    if (!isPlaying || !videoId) return;

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
        // CRITICAL for mobile: YT.Player REPLACES the target div with an
        // iframe. Without explicit dimensions it creates that iframe at the
        // API default 640×360 — the inline width:100% styles on our div are
        // destroyed with it. On phones (~390px viewport) the 640px iframe
        // set the grid column's min-content width and dragged the ENTIRE
        // page wider than the screen: clipped title, unwrappable chips,
        // cards cut mid-word. The #yt-player-div CSS rule below is the
        // second layer of the same fix (the iframe inherits the div's id).
        width: "100%",
        height: "100%",
        playerVars: { autoplay: 1, rel: 0, playsinline: 1 },
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
  }, [isPlaying, videoId]);

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
          // URL-pasted video: buffer text for AI fact-checking. Remember the
          // caption time of the first segment in the buffer for timestamping.
          shownSegmentsRef.current.add(si);
          if (autoCheckBuffer.current.trim().length === 0) {
            bufferStartRef.current = seg.time;
          }
          autoCheckBuffer.current += " " + seg.text;
        }
      }

      // Auto fact-check: send buffered text to Claude every ~15 seconds
      if (!hasPreloadedClaims && vt - lastAutoCheckTime.current >= AUTO_CHECK_INTERVAL) {
        const textToCheck = autoCheckBuffer.current.trim();
        if (textToCheck.length >= 30) {
          lastAutoCheckTime.current = vt;
          const capturedText = textToCheck;
          // Where the buffered words STARTED — not the flush time. The flush
          // happens ≥15s after the first buffered words were spoken, which is
          // exactly the timestamp skew users notice on the ▶ links.
          const capturedTime = bufferStartRef.current ?? Math.floor(vt);
          autoCheckBuffer.current = "";
          bufferStartRef.current = null;

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
                const enriched: Claim[] = data.claims.map((c: Claim) => {
                  // Pin the claim to where its words actually occur in the
                  // captions (same fuzzy match the demo re-timing uses).
                  // Fallback: start of the buffered window it came from.
                  const matched = findCaptionTimeForQuote(c.quote, demoSpeech.segments);
                  return {
                    ...c,
                    videoTime: matched ?? capturedTime,
                    timestamp: new Date().toISOString(),
                    id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  };
                });
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

      // Preferred path: captions + aligned segment times baked into the
      // speech JSON offline by scripts/retime-speeches.mjs. The runtime
      // fetch below exists only for speeches that haven't been baked —
      // YouTube regularly blocks datacenter IPs (Vercel), which is exactly
      // how production ended up on the "APPROX." fallback with fact-check
      // timestamps pointing at the wrong moments.
      if (speech.captions && speech.captions.length > 0) {
        setRealCaptions(speech.captions);
        console.log(`[demo] using ${speech.captions.length} embedded caption segments (pre-aligned offline)`);
        return;
      }

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
  // Returns true when caption-driven fact-checking started, false when no
  // transcript could be loaded. quiet: suppress the idle-page error banner
  // (used by the discovered-stream fallback, which handles failure itself).
  const startFromUrl = useCallback(async (url: string, opts?: { quiet?: boolean }): Promise<boolean> => {
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
        if (!opts?.quiet) setUrlError(data.error);
        setUrlLoading(false);
        return false;
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
        if (!opts?.quiet) {
          setUrlError(
            "Could not load transcript. YouTube may be blocking automated access. " +
            "Try a different video, or open the video on YouTube → click '...' → 'Show transcript' to verify captions exist."
          );
        }
        setUrlLoading(false);
        return false;
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
      // These segments ARE real YouTube captions — feed them to the subtitle
      // renderer so the transcript strip tracks the audio (previously this
      // path left realCaptions null and fell back to the coarse 3-segment
      // display, which is why the subtitle drifted from what was spoken).
      setRealCaptions(segments);
      setDemoSpeech(speech);
      setUrlInput("");
      return true;
    } catch (e) {
      console.error("URL fetch error:", e);
      if (!opts?.quiet) setUrlError("Network error — could not reach the server.");
      return false;
    } finally {
      setUrlLoading(false);
    }
  }, []);

  /* ── Stop ── */
  const stopSession = useCallback(() => {
    demoAbortRef.current = true;
    setIsPlaying(false);
    setIsDemo(false);
    setIsReplay(false);
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

    // Capture the playhead AT CLICK TIME — the window is anchored to this
    // instant, so the user checks exactly what they just heard.
    let videoTime = Math.floor((Date.now() - demoStartTime.current) / 1000);
    if (ytPlayerRef.current?.getCurrentTime) {
      try { videoTime = Math.floor(ytPlayerRef.current.getCurrentTime()); } catch {}
    }
    // TWO CLOCKS. The player reports VIDEO time, but archived transcripts and
    // claims are stamped in STREAM time (the VOD is often only the tail of a
    // longer stream — see timeShift). Selecting transcript segments with the
    // raw player clock therefore picked text from a completely different part
    // of the event, which is exactly what "it checked some random part" was.
    // Everything below works in stream time; only seeking uses video time.
    const streamTime = videoTime + timeShift;

    // Words spoken in the last `windowSec` seconds before the playhead.
    // Captions are ~15s blocks, so we interpolate per-word timing inside
    // each block (same approximation the karaoke strip uses) rather than
    // including whole blocks — keeps the window tight and deterministic.
    const wordsInWindow = (windowSec: number): string => {
      if (!realCaptions || realCaptions.length === 0) return "";
      const from = videoTime - windowSec;
      const out: string[] = [];
      for (let i = 0; i < realCaptions.length; i++) {
        const start = realCaptions[i].time;
        const end = realCaptions[i + 1]?.time ?? start + 15;
        if (end <= from || start >= videoTime) continue;
        const words = realCaptions[i].text.split(/\s+/).filter(w => w && w !== ">>" && w !== ">");
        const span = Math.max(1, end - start);
        words.forEach((w, k) => {
          const t = start + span * (k / words.length);
          if (t >= from && t <= videoTime) out.push(w);
        });
      }
      return out.join(" ").trim();
    };

    // Caption modes: exactly the last 15s; widen to 30s if that slice was
    // applause/silence. Live worker mode: the latest ingested chunk IS the
    // last ~15s of speech — use it directly.
    let recentText: string;
    if (realCaptions && realCaptions.length > 0) {
      // 75 seconds, not 15. "This moment" to a viewer means the passage they
      // just heard, not the last breath — and a 15-second slice of political
      // speech usually contains no checkable number at all, so the check came
      // back empty and the button looked dead. Widen, then widen again.
      recentText = wordsInWindow(75);
      if (recentText.length < 60) recentText = wordsInWindow(150);
    } else if (isReplay && replaySegments.length > 0) {
      // Replay: fact-check what was said just before the current playhead.
      const upTo = replaySegments.filter(sg => sg.t <= streamTime + 2);
      const pool = upTo.length ? upTo : replaySegments;
      recentText = pool.map(sg => sg.text).join(" ").split(" ").slice(-220).join(" ").trim();
    } else if (isReplay && replayTranscript) {
      recentText = replayTranscript.replace(/\[\d+:\d\d\]/g, " ").split(/\s+/).slice(-220).join(" ").trim();
    } else {
      recentText = liveTranscript.split(" ").slice(-220).join(" ").trim();
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
        // Bounded so a stalled request can't leave the button spinning
        // forever with no explanation.
        signal: AbortSignal.timeout(120_000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: recentText,
          context: "User manually requested fact-check.",
          // Persist the result against this broadcast so the next viewer gets
          // it from the record instead of re-spending credits — and so the
          // claim joins the timeline and the export.
          videoId: videoId || undefined,
          // Stream time: matches how the worker stamps automatic claims, so a
          // manual check lands at the right tick on the credibility timeline.
          videoTime: Math.round(streamTime),
        }),
      });
      // A killed serverless function returns an HTML error page, not JSON.
      // Parsing that threw, and the throw was swallowed into a generic
      // catch — which is how a press became a silent no-op.
      let data: {
        claims?: Claim[]; error?: string; detail?: string;
        cached?: boolean; skipped?: string;
      } = {};
      try {
        data = await res.json();
      } catch {
        throw new Error(
          res.ok
            ? "The checker returned something we couldn't read."
            : `The checker timed out (${res.status}). This passage needed more verification than the request allowed.`
        );
      }
      // The route answers from the record when this moment was already
      // checked (cached:true) — say so rather than silently repeating.
      setManualNote(data.cached ? "Already on the record — no new check needed." : null);
      

      if ((data.claims?.length ?? 0) > 0) {
        const results: Claim[] = data.claims!.map((c: Claim) => ({
          ...c,
          // Stream time, to match how the feed and timeline stamp everything
          // else. Using the raw player clock here put the card at a different
          // tick than the claim it came from.
          videoTime: c.videoTime ?? Math.round(streamTime),
          timestamp: c.timestamp || new Date().toISOString(),
          // A claim answered FROM THE RECORD keeps its identity. Minting a
          // fresh random id every press is what let the same claim stack up
          // as five separate cards in the feed.
          id: c.id || `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        }));
        setManualResult(results);

        // Highlight is set OUTSIDE the updater. The previous version called
        // setNewClaimIds inside the setClaims updater — a side effect in a
        // function React is free to re-execute while rebasing state, and
        // each re-execution scheduled ANOTHER update (a new Set every time).
        // That's an unbounded update loop: the tab hangs, the browser kills
        // it, and the user sees "This page couldn't load". Marking an id
        // that turns out to be a duplicate is harmless — it just animates
        // the existing card — so the highlight doesn't need to know the
        // dedup outcome.
        setNewClaimIds(new Set(results.map(c => c.id)));

        // Only add what the feed doesn't already hold. The record is
        // deduplicated server-side, but the panel was appending every
        // response regardless — so re-checking a passage stacked copies.
        setClaims(prev => {
          const existingQuotes = prev.map(p => p.quote);
          const fresh = results.filter(r =>
            !prev.some(p => p.id === r.id) && !isDuplicateQuote(r.quote, existingQuotes)
          );
          return fresh.length ? [...fresh, ...prev] : prev;
        });
      } else {
        // API returned no claims or returned an error
        const msg = data.error
          ? (data.error === "ANTHROPIC_API_KEY not configured"
            ? "API key not configured — add ANTHROPIC_API_KEY to Vercel env vars."
            : data.error)
          : data.skipped === "no-economic-content"
            ? "Nothing with a number in it was said in the last minute or so."
            : "We read the last ~75 seconds and found no claim with a figure we can check.";
        setManualResult([{
          quote: recentText.slice(0, 100) + (recentText.length > 100 ? "..." : ""),
          rating: "UNVERIFIABLE",
          actual: msg,
          explanation: "Try clicking during a section where specific numbers, percentages, or dollar figures are mentioned.",
          videoTime: Math.round(streamTime), timestamp: new Date().toISOString(), id: `manual-${Date.now()}`,
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
    // Replay state must be in the deps — without it the callback closes over
    // the initial empty replaySegments and reports "no transcript" in replays.
    // timeShift and videoId belong here: without them the callback closes over
    // their initial values (0 / "") and the check silently uses the wrong
    // clock and fails to persist against the broadcast.
  }, [liveTranscript, realCaptions, isReplay, replaySegments, replayTranscript, captionClock, timeShift, videoId]);

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
    // overflowX clip: hard guarantee that no child can widen the page past
    // the viewport on mobile (the failure mode behind the clipped-everything
    // screenshots). Root-cause fixes exist above; this is the seatbelt.
    <div style={{ minHeight: "100vh", background: T.bg, overflowX: "clip" }}>
      {/* CSS Animations */}
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes cardSlideIn { from{transform:translateX(20px);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        /* The YT IFrame API replaces #yt-player-div with an iframe that keeps
           the same id but loses the div's inline styles. Pin it to fill the
           16:9 wrapper regardless of what the API sets on it. */
        #yt-player-div { position:absolute; inset:0; width:100% !important; height:100% !important; border:none; }
      `}</style>

      {/* ── Nav Bar ── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 50, background: T.card + "ee",
        backdropFilter: "blur(12px)", borderBottom: `1px solid ${T.rule}`,
        padding: mob ? "10px 16px" : "12px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <Brand mob={mob} />
        <div style={{ display: "flex", gap: mob ? 12 : 20, fontFamily: "'DM Sans',sans-serif", fontSize: mob ? 11 : 13 }}>
          <Link href="/dashboard" style={{ color: T.sub, textDecoration: "none", fontWeight: 500 }}>Data</Link>
          {/* "Live" pointed at /live from inside /live, and "Scenarios" sent
              someone mid-broadcast to a counterfactual chart. Replaced with
              the one action worth offering a viewer who is already here and
              engaged: a way to be told about the next one. */}
          <Link href="/today#newsletter" style={{
            color: "#fff", background: T.accent, textDecoration: "none", fontWeight: 700,
            padding: mob ? "6px 11px" : "7px 15px", borderRadius: 6, whiteSpace: "nowrap",
          }}>
            Join our newsletter
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
              {/* Same editorial signature as the landing page. */}
              <div style={{
                fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: T.mute,
                letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 14, fontWeight: 500,
              }}>
                No spin · No editorial · You interpret
              </div>
            </div>

            {/* ── LIVE NOW — prominent card when a broadcast is active ── */}
            {/* videoId may be empty (monitor mode) — still show the card. */}
            {config?.status === "live" && (
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
                  onClick={async () => {
                    // Captions-first: streams that have ENDED (or VODs)
                    // usually expose captions, which power the full
                    // client-side fact-check pipeline — no worker needed.
                    // Truly-live streams have no captions; fall back to the
                    // live path (fact-checks attach if the worker covers it).
                    // Skip the caption probe entirely when the server can't
                    // fetch transcripts (no egress proxy) — it would fail on
                    // every input and just delay playback.
                    const ok = transcriptCapable && await startFromUrl(
                      `https://www.youtube.com/watch?v=${d.videoId}`,
                      { quiet: true }
                    );
                    if (!ok) startLive(d.videoId, d.title || `${d.channelLabel} — Live`);
                  }}
                  disabled={urlLoading}
                  style={{
                    background: "#dc2626", color: "#fff", border: "none", borderRadius: 10,
                    padding: "12px 28px", fontFamily: "'DM Sans',sans-serif", fontSize: 14,
                    fontWeight: 700, cursor: urlLoading ? "default" : "pointer",
                    opacity: urlLoading ? 0.7 : 1,
                    display: "flex", alignItems: "center", gap: 8,
                    boxShadow: "0 4px 16px rgba(220,38,38,0.3)",
                  }}
                >
                  <span style={{ fontSize: 16 }}>&#9654;</span>
                  {urlLoading ? "Checking for transcript…" : "Watch Live"}
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
              </div>
            )}

            {/* ── What's coming: upcoming streams + the year-ahead economic
                calendar, with alert opt-in front and centre. Replaces a panel
                that was empty most of the time (official events are announced
                only hours ahead), which is why nobody could plan around it. ── */}
            <div style={{ maxWidth: 700, margin: "0 auto 28px" }}>
              <UpcomingEvents notifySlot={<NotifyToggle />} />
            </div>

            {/* ── Recent broadcasts — replayable for 72h with stored facts ── */}
            {recent.length > 0 && (
              <div style={{ maxWidth: 900, margin: "0 auto 32px" }}>
                <div style={{
                  fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 500,
                  textTransform: "uppercase", letterSpacing: "0.14em", color: T.sub,
                  marginBottom: 6, paddingLeft: 4,
                }}>
                  Last 72 hours · Replay
                </div>
                <div style={{
                  fontFamily: "'Source Serif 4',serif", fontSize: mob ? 20 : 26,
                  fontWeight: 400, color: T.ink, letterSpacing: "-0.015em",
                  marginBottom: 14, paddingLeft: 4,
                }}>
                  Missed it live? <em style={{ fontStyle: "italic", color: T.accent }}>The facts are saved.</em>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: 14 }}>
                  {recent.map((b) => {
                    const counts: Record<string, number> = {};
                    b.claims.forEach(c => { counts[c.rating] = (counts[c.rating] || 0) + 1; });
                    const trueish = (counts["TRUE"] || 0) + (counts["MOSTLY TRUE"] || 0);
                    const acc = b.claims.length > 0 ? Math.round((trueish / b.claims.length) * 100) : null;
                    const durMin = Math.max(1, Math.round((Date.parse(b.endedAt) - Date.parse(b.startedAt)) / 60000));
                    const agoH = Math.max(0, Math.round((Date.now() - Date.parse(b.endedAt)) / 3600000));
                    return (
                      <div key={b.videoId} style={{
                        background: T.card, border: `1px solid ${T.rule}`, borderRadius: 12,
                        padding: mob ? 16 : 20, display: "flex", flexDirection: "column",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                          <span style={{
                            fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700,
                            textTransform: "uppercase", letterSpacing: 1.2, color: T.accent,
                          }}>● Aired {agoH === 0 ? "just now" : `${agoH}h ago`}</span>
                          <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: T.mute }}>
                            expires in {Math.max(1, 24 - agoH)}h
                          </span>
                        </div>
                        <div style={{
                          fontFamily: "'Source Serif 4',serif", fontSize: mob ? 15 : 17, fontWeight: 600,
                          color: T.ink, lineHeight: 1.3, marginBottom: 10,
                        }}>{b.title}</div>
                        <div style={{
                          fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: T.sub, marginBottom: 12,
                        }}>
                          {b.claims.length} claims fact-checked live
                          {acc !== null && <> · <strong style={{ color: acc >= 60 ? "#0d7377" : acc >= 40 ? "#ca8a04" : "#c2410c" }}>{acc}% accuracy</strong></>}
                          {" "}· {durMin}m covered
                        </div>
                        <div style={{ marginTop: "auto", display: "flex", justifyContent: "flex-end" }}>
                          <button
                            onClick={() => startReplay(b)}
                            style={{
                              background: T.ink, color: "#fff", border: "none", borderRadius: 8,
                              padding: "9px 20px", fontFamily: "'DM Sans',sans-serif", fontSize: 12,
                              fontWeight: 700, cursor: "pointer",
                            }}
                          >
                            &#9654; Replay with facts
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Speech Archive ── */}
            <div style={{ maxWidth: 900, margin: "0 auto 28px" }}>
              <div style={{
                fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 500,
                textTransform: "uppercase", letterSpacing: "0.14em", color: T.sub, marginBottom: 14,
                paddingLeft: 4,
              }}>
                Speech archive
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
            {/* Rendered only when the server can actually fetch transcripts
                (capability probe above) — YouTube blocks caption access from
                datacenter IPs, so without an egress proxy this feature fails
                on every input. Hidden beats broken. */}
            {transcriptCapable && (
            <div style={{
              maxWidth: 600, margin: "0 auto 24px", padding: mob ? "16px" : "18px 24px",
              background: T.card, border: `1px solid ${T.rule}`, borderRadius: 10,
            }}>
              <div style={{
                fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 500,
                textTransform: "uppercase", letterSpacing: "0.14em", color: T.sub, marginBottom: 10,
              }}>
                Analyze any speech
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
                    // 16px on mobile: iOS Safari auto-zooms the page when
                    // focusing an input with font-size < 16px, and never
                    // zooms back out — the whole page then renders clipped.
                    // maximumScale:1 in layout.tsx is the second layer.
                    fontFamily: "'DM Sans',sans-serif", fontSize: mob ? 16 : 13, color: T.ink,
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
            )}

            {/* ── Editorial explanation ── */}
            <div style={{
              maxWidth: 600, margin: "0 auto", textAlign: "center",
              fontFamily: "'DM Sans',sans-serif", padding: "16px 0 0",
            }}>
              <div style={{
                fontSize: 11, fontWeight: 500, textTransform: "uppercase",
                letterSpacing: "0.14em", color: T.sub, marginBottom: 12,
              }}>How it works</div>
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
          /* ── Control Room (design spec 2a) ──────────────────────────────
             The video is PINNED and only the feed scrolls, so reading a
             fact-check can never push the speech off screen. The player node
             is passed in as a slot because the YouTube IFrame API replaces
             its target div in place — re-mounting it would kill playback. */
          <ControlRoom
            title={title || "Live broadcast"}
            mode={isReplay ? "replay" : isDemo ? "demo" : "live"}
            elapsed={captionClock}
            videoDuration={videoDuration}
            silentFor={silentFor}
            mob={mob}
            claims={timeShift ? claims.map(c => ({
              ...c,
              videoTime: Math.max(0, (c.videoTime ?? 0) - timeShift),
            })) : claims}
            newClaimIds={newClaimIds}
            onSeek={(secs, claimId) => {
              // A claim click resolves against the UNSHIFTED claim and goes
              // through seekToClaim, which knows the three different origins
              // (replay VOD / live worker clock / demo captions). Clicking a
              // fact used to call seekVideo with the raw stored number, which
              // is only a player position in one of those three cases.
              const src = claimId ? claims.find(c => c.id === claimId) : null;
              if (src) seekToClaim(src);
              else seekVideo(secs); // timeline scrub — already in player time
            }}
            onStop={stopSession}
            onFactCheck={manualFactCheck}
            isChecking={isManualChecking}
            onOpenRecord={() => setRecordOpen(true)}
            videoSlot={
              videoId ? (
                <div id="yt-player-div" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />
              ) : (
                /* Monitor mode: the worker is ingesting audio from a
                   non-embeddable source — the feed IS the product here. */
                <div style={{
                  position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center",
                  background: "linear-gradient(135deg,#1a1a1a,#2d2520)", color: "#e8e2d8", padding: 20,
                }}>
                  <div style={{ fontSize: 34 }}>🎙️</div>
                  <div style={{ fontFamily: "'Newsreader',serif", fontSize: mob ? 16 : 20, fontWeight: 600 }}>
                    Live audio monitor
                  </div>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11.5, color: "#b8b0a8", maxWidth: 380, lineHeight: 1.55 }}>
                    We&rsquo;re listening to this broadcast and checking every economic claim in
                    real time. Video isn&rsquo;t embeddable for this event — the record is here.
                  </div>
                </div>
              )
            }
            manualResult={manualResult?.map(c => {
              // Shift to VIDEO time, exactly as the feed claims above are.
              // This was the one path that skipped it, so a manual card read
              // 68:20 while the identical claim in the feed read 27:46.
              const vt = Math.max(0, (c.videoTime ?? 0) - timeShift);
              return {
              id: c.id,
              verdict: toOutcome(c.rating),
              time: `${Math.floor(vt / 60)}:${String(Math.floor(vt % 60)).padStart(2, "0")}`,
              quote: c.quote,
              claimed: c.claimedValue != null ? String(c.claimedValue) : null,
              actual: c.actual,
              note: c.explanation,
              source: c.groundTruth?.source,
              confidence: c.confidence,
              sources: c.sources,
              };
            }) ?? null}
            caption={
              isReplay && replaySegments.length > 0
                ? <SyncedReplayCaption segs={replaySegments} clock={captionClock + timeShift} />
                : realCaptions && realCaptions.length > 0
                  ? <CaptionKaraoke captions={realCaptions} vt={captionClock} />
                  : liveTranscript
                    ? <>{liveTranscript.split(" ").slice(-22).join(" ")}<span style={{ animation: "blink 1s infinite" }}>|</span></>
                    : null
            }
          />
        )}

        {/* The record: export sheet. Must live in the page component (it was
            accidentally mounted inside an unrendered helper, so the
            "Download record" button silently did nothing). */}
        <RecordSheet
          open={recordOpen}
          onClose={() => setRecordOpen(false)}
          meta={{
            title: title || "Live broadcast",
            date: new Date().toISOString().slice(0, 10),
            runningTime: `${Math.floor(captionClock / 60)} min`,
            permalink: "https://voteunbiased.org/live",
          }}
          claims={claims.map(c => ({
            time: `${Math.floor((c.videoTime ?? 0) / 60)}:${String(Math.floor((c.videoTime ?? 0) % 60)).padStart(2, "0")}`,
            verdict: c.rating,
            quote: c.quote,
            claimed: c.claimedValue != null ? String(c.claimedValue) : null,
            actual: c.actual,
            note: c.explanation,
            source: c.groundTruth?.source,
            confidence: c.confidence,
            sources: c.sources,
          }))}
          transcript={isReplay ? replayTranscript : liveTranscript}
        />

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
                {claims.map(c => <FactCard key={c.id} claim={c} isNew={false} onSeek={seekToClaim} />)}
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

/* ── Synced replay transcript — scrolls with the playhead ─────────────
   Segments are the [mm:ss]-stamped ~15s chunks archived by the worker.
   Everything spoken up to the current video time is shown (newest
   emphasized), auto-scrolled to the bottom like live captions. */
function SyncedReplayTranscript({ segs, clock }: {
  segs: { t: number; text: string }[]; clock: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const visible = segs.filter(s => s.t <= clock);
  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible.length]);
  const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  return (
    <div style={{ background: T.paper, borderBottom: `1px solid ${T.rule}` }}>
      <div style={{
        padding: "8px 14px 0", fontSize: 9, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: 1, color: T.mute, fontFamily: "'DM Sans',sans-serif",
      }}>
        Transcript · synced to playback
      </div>
      <div ref={boxRef} style={{
        padding: "6px 14px 10px", maxHeight: 110, overflowY: "auto",
        fontSize: 12, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.65,
      }}>
        {visible.length === 0 ? (
          <span style={{ color: T.mute, fontStyle: "italic" }}>
            Speech transcript begins at {fmt(segs[0].t)} — skip ahead or keep watching.
          </span>
        ) : (<>
          {visible.map((s, i) => (
            <span key={i} style={{
              color: i === visible.length - 1 ? T.ink : T.sub,
              fontWeight: i === visible.length - 1 ? 600 : 400,
            }}>
              {s.text}{" "}
            </span>
          ))}
          {/* Honest end-of-coverage note: without it a truncated recording
              (e.g. events captured before the Jul 2026 recorder fix) looks
              like the transcript silently "stops working". */}
          {clock > visible[visible.length - 1].t + 45 && visible.length === segs.length && (
            <span style={{ color: T.mute, fontStyle: "italic" }}>
              — transcript recording for this event ended at {fmt(segs[segs.length - 1].t)} —
            </span>
          )}
        </>)}
      </div>
    </div>
  );
}


/* ── Alert opt-in — the whole point of the live feature is being THERE ─────
   Official broadcasts are announced hours ahead at most, so a notification at
   go-live is the only channel that reliably gets a viewer to the page. On
   iPhone, Apple requires the site be added to the Home Screen before it may
   request permission — so instead of one line of small print, we detect the
   platform and walk the user through it. */
function NotifyToggle() {
  const [state, setState] = useState<"checking" | "unsupported" | "ios-install" | "off" | "on" | "busy" | "denied">("checking");
  const [showHow, setShowHow] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as unknown as { standalone?: boolean }).standalone === true;
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIOS && !standalone) { setState("ios-install"); return; }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) { setState("unsupported"); return; }
    if (Notification.permission === "denied") { setState("denied"); return; }
    navigator.serviceWorker.getRegistration().then(reg => {
      if (!reg) { setState("off"); return; }
      reg.pushManager.getSubscription().then(sub => setState(sub ? "on" : "off"));
    }).catch(() => setState("off"));
  }, []);

  const toggle = async () => {
    if (state === "busy") return;
    const prev = state;
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      if (prev === "on") {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
          await sub.unsubscribe();
        }
        setState("off");
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return; }
      const { publicKey } = await fetch("/api/push").then(r => r.json());
      const pad = "=".repeat((4 - (publicKey.length % 4)) % 4);
      const raw = atob((publicKey + pad).replace(/-/g, "+").replace(/_/g, "/"));
      const key = new Uint8Array([...raw].map((c: string) => c.charCodeAt(0)));
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
      setState("on");
      // Immediate proof it works, rather than asking the user to take it on faith.
      try { new Notification("Alerts on", { body: "We'll ping you the moment a live fact-check starts.", icon: "/icon-light-32x32.png" }); } catch { /* fine */ }
    } catch {
      setState(prev === "on" ? "on" : "off");
    }
  };

  if (state === "checking") return null;

  const box: React.CSSProperties = {
    background: "#0d73770d", border: "1px solid #0d737733", borderRadius: 8,
    padding: "12px 14px", fontFamily: "'DM Sans',sans-serif",
  };

  if (state === "ios-install") {
    return (
      <div style={box}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, marginBottom: 4 }}>
          🔔 Get an alert the moment a broadcast starts
        </div>
        <div style={{ fontSize: 11.5, color: T.sub, lineHeight: 1.55 }}>
          iPhone needs this site on your Home Screen before it can send notifications.
          {" "}
          <button onClick={() => setShowHow(v => !v)} style={{
            background: "none", border: "none", padding: 0, color: T.blue,
            fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, cursor: "pointer", textDecoration: "underline",
          }}>{showHow ? "Hide steps" : "Show me how (15 seconds)"}</button>
        </div>
        {showHow && (
          <ol style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 11.5, color: T.sub, lineHeight: 1.75 }}>
            <li>Tap the <strong>Share</strong> button in Safari&rsquo;s toolbar (□ with an ↑)</li>
            <li>Scroll and tap <strong>Add to Home Screen</strong> → <strong>Add</strong></li>
            <li>Open Vote Unbiased from the new icon</li>
            <li>Come back here and tap <strong>Turn on alerts</strong></li>
          </ol>
        )}
      </div>
    );
  }

  if (state === "unsupported") {
    return (
      <div style={box}>
        <div style={{ fontSize: 11.5, color: T.sub, lineHeight: 1.55 }}>
          🔔 This browser can&rsquo;t receive alerts. Chrome, Edge or Safari (added to your
          Home Screen on iPhone) can — or subscribe to the monthly email below.
        </div>
      </div>
    );
  }

  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button onClick={toggle} disabled={state === "busy" || state === "denied"} style={{
          fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700,
          color: state === "on" ? "#0d7377" : "#fff",
          background: state === "on" ? "transparent" : "#0d7377",
          border: state === "on" ? "1px solid #0d7377" : "none",
          padding: "9px 16px", borderRadius: 6,
          cursor: state === "denied" ? "not-allowed" : "pointer",
          opacity: state === "busy" ? 0.6 : 1,
        }}>
          {state === "on" ? "🔔 Alerts on — tap to turn off"
            : state === "denied" ? "🔕 Blocked in browser settings"
            : state === "busy" ? "…"
            : "🔔 Turn on alerts"}
        </button>
        <span style={{ fontSize: 11, color: T.sub, lineHeight: 1.5, flex: 1, minWidth: 180 }}>
          {state === "on"
            ? "You'll get a notification the moment live fact-checking begins."
            : "One notification when a broadcast goes live. Nothing else."}
        </span>
      </div>
      {state === "denied" && (
        <div style={{ fontSize: 10.5, color: T.mute, marginTop: 6, lineHeight: 1.5 }}>
          Re-enable in your browser&rsquo;s site settings for voteunbiased.org, then reload.
        </div>
      )}


    </div>
  );
}

/* ── Replay caption for the Control Room overlay ────────────────────
   The full scrolling transcript panel is gone in spec 2a; the caption is
   now a single overlaid line under the video showing what's being said at
   the playhead, which is what ties the words to the card that appears. */
function SyncedReplayCaption({ segs, clock }: { segs: { t: number; text: string }[]; clock: number }) {
  const visible = segs.filter(s => s.t <= clock);
  if (!visible.length) {
    return <span style={{ opacity: 0.6 }}>Transcript begins shortly…</span>;
  }
  // ONE line of what's being said right now. Archived segments are ~15s
  // chunks (40-100+ words); rendering even two of them produced a wall of
  // text that covered the entire video. Take the tail of the latest chunk,
  // preferring the start of the last sentence so it reads naturally.
  const latest = visible[visible.length - 1].text;
  const sentences = latest.split(/(?<=[.!?])\s+/).filter(Boolean);
  const tail = sentences[sentences.length - 1] || latest;
  const words = tail.split(/\s+/);
  return <>{words.length > 24 ? "… " + words.slice(-24).join(" ") : tail}</>;
}
