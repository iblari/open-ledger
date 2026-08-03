"use client";

/**
 * UpcomingEvents — the "what's coming" panel on /live.
 *
 * The retention problem this solves: official streams are announced hours
 * ahead, so an empty schedule was the normal state and there was nothing to
 * plan around. FOMC decisions and BLS releases are published a year ahead and
 * are exactly what an economic fact-checking site should own — so the page
 * now ALWAYS has something dated, with one-tap alerts and calendar add.
 */

import { useEffect, useState } from "react";
import { upcomingKnownEvents, type KnownEvent } from "@/lib/known-events";

const T = {
  ink: "#1a1a1a", sub: "#5c5856", mute: "#9a9490", rule: "#e2ded6",
  paper: "#f3ede5", card: "#fff", accent: "#b8372d", blue: "#1d4ed8", teal: "#0d7377",
};
const SANS = "'DM Sans',sans-serif";
const SERIF = "'Source Serif 4',Georgia,serif";

interface DiscoveredUpcoming {
  videoId: string; title: string; url: string; scheduledStart: string; channelLabel: string;
}

function countdown(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (ms < 0) return "now";
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `in ${d}d ${h}h`;
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
}

/** Google Calendar prefill for a single event. */
function gcal(title: string, startIso: string, minutes: number, details: string): string {
  const s = startIso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const e = new Date(Date.parse(startIso) + minutes * 60000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const p = new URLSearchParams({
    action: "TEMPLATE", text: title, dates: `${s}/${e}`,
    details: `${details}\n\nLive fact-checking: https://voteunbiased.org/live`,
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

export default function UpcomingEvents({ notifySlot }: { notifySlot?: React.ReactNode }) {
  const [streams, setStreams] = useState<DiscoveredUpcoming[]>([]);
  const known = upcomingKnownEvents(5);

  useEffect(() => {
    fetch("/api/live-discover")
      .then(r => r.json())
      .then(d => setStreams(Array.isArray(d.upcoming) ? d.upcoming : []))
      .catch(() => {});
  }, []);

  const Row = ({
    title, when, detail, badge, badgeColor, addUrl, watchUrl,
  }: { title: string; when: string; detail: string; badge: string; badgeColor: string; addUrl: string; watchUrl?: string }) => (
    <div style={{
      display: "flex", gap: 12, padding: "12px 0", borderBottom: `1px solid ${T.rule}`,
      alignItems: "flex-start", flexWrap: "wrap",
    }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
          <span style={{
            fontFamily: SANS, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.09em",
            textTransform: "uppercase", color: "#fff", background: badgeColor,
            padding: "2px 7px", borderRadius: 3,
          }}>{badge}</span>
          <span style={{ fontFamily: SANS, fontSize: 10.5, color: T.mute, fontVariantNumeric: "tabular-nums" }}>
            {when}
          </span>
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 14.5, fontWeight: 600, color: T.ink, lineHeight: 1.25 }}>{title}</div>
        <div style={{ fontFamily: SANS, fontSize: 11, color: T.sub, lineHeight: 1.5, marginTop: 2 }}>{detail}</div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {watchUrl && (
          <a href={watchUrl} target="_blank" rel="noopener noreferrer" style={{
            fontFamily: SANS, fontSize: 10.5, fontWeight: 700, color: "#fff", background: T.accent,
            padding: "6px 11px", borderRadius: 5, textDecoration: "none", whiteSpace: "nowrap",
          }}>Watch ↗</a>
        )}
        <a href={addUrl} target="_blank" rel="noopener noreferrer" style={{
          fontFamily: SANS, fontSize: 10.5, fontWeight: 700, color: T.ink, background: T.card,
          border: `1px solid ${T.rule}`, padding: "6px 11px", borderRadius: 5,
          textDecoration: "none", whiteSpace: "nowrap",
        }}>+ Calendar</a>
      </div>
    </div>
  );

  return (
    <div style={{
      background: T.card, border: `1px solid ${T.rule}`, borderRadius: 8,
      padding: "16px 18px", marginBottom: 16,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
        <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: T.ink }}>What&rsquo;s coming</div>
        <div style={{ fontFamily: SANS, fontSize: 10, color: T.mute }}>times shown in your timezone</div>
      </div>
      <p style={{ fontFamily: SANS, fontSize: 11.5, color: T.sub, lineHeight: 1.55, margin: "0 0 6px" }}>
        Official broadcasts are usually announced only hours ahead — turn on alerts and we&rsquo;ll
        ping you the moment coverage starts. Fed decisions and data releases are scheduled a year out,
        so you can plan around those.
      </p>

      {notifySlot && <div style={{ margin: "10px 0 4px" }}>{notifySlot}</div>}

      {streams.length > 0 && streams.map(s => (
        <Row key={s.videoId}
          title={s.title}
          when={`${fmt(s.scheduledStart)} · ${countdown(s.scheduledStart)}`}
          detail={`${s.channelLabel} — we'll fact-check this live.`}
          badge="Scheduled stream" badgeColor={T.accent}
          watchUrl={s.url}
          addUrl={gcal(s.title, s.scheduledStart, 90, `${s.channelLabel} live stream.`)}
        />
      ))}

      {known.map((e: KnownEvent) => (
        <Row key={e.id}
          title={e.title}
          when={`${fmt(e.startsAt)} · ${countdown(e.startsAt)}`}
          detail={e.detail}
          badge={e.liveCoverage ? "Live coverage" : "Data release"}
          badgeColor={e.liveCoverage ? T.teal : T.mute}
          addUrl={gcal(e.title, e.startsAt, e.durationMin, e.detail)}
        />
      ))}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <a href="webcal://voteunbiased.org/api/schedule.ics" style={{
          fontFamily: SANS, fontSize: 11, fontWeight: 700, color: "#fff", background: T.ink,
          padding: "8px 14px", borderRadius: 6, textDecoration: "none",
        }}>📅 Subscribe (Apple / Outlook)</a>
        <a href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent("webcal://voteunbiased.org/api/schedule.ics")}`}
          target="_blank" rel="noopener noreferrer" style={{
            fontFamily: SANS, fontSize: 11, fontWeight: 700, color: T.ink, background: T.card,
            border: `1px solid ${T.rule}`, padding: "7px 14px", borderRadius: 6, textDecoration: "none",
          }}>📅 Google Calendar</a>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 9.5, color: T.mute, marginTop: 8, lineHeight: 1.5 }}>
        Sources: Federal Reserve FOMC calendar; BLS release schedule. Subscribed calendars refresh on
        your provider&rsquo;s cycle (hours), so alerts above are the reliable way to catch a live start.
      </div>
    </div>
  );
}
