"use client";
import { useState } from "react";

/**
 * One share row, used by every view that has something worth sending.
 *
 * This markup existed twice before — Live Benchmark and State Atlas — each
 * carrying its own copy of two platform footnotes that are easy to get
 * wrong and invisible when you do. Consolidated so the next surface that
 * wants sharing inherits the fixes rather than the bugs.
 *
 * `url` must reproduce the view. A share link that opens a default page
 * instead of what the sender was looking at is worse than no share button:
 * it appears to have worked.
 */
export default function ShareRow({
  url, text, tone,
}: {
  url: string;
  text: string;
  tone: { rule: string; mute: string; sub: string; accent: string; ok: string; sans: string };
}) {
  const [status, setStatus] = useState("");

  const btn = (accent: boolean) => ({
    fontFamily: tone.sans, fontSize: 11.5, fontWeight: 600,
    padding: "6px 11px", borderRadius: 4, cursor: "pointer",
    border: `1px solid ${accent ? tone.accent : tone.rule}`,
    background: "transparent", color: accent ? tone.accent : tone.sub,
    textDecoration: "none", display: "inline-block",
  } as const);

  const body = `${text}\n${url}`;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      padding: "12px 0 0", marginTop: 14, borderTop: `1px solid ${tone.rule}`,
    }}>
      <span style={{
        fontFamily: tone.sans, fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
        textTransform: "uppercase", color: tone.mute, marginRight: 2,
      }}>Share</span>

      <button onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setStatus("Link copied");
          setTimeout(() => setStatus(""), 2000);
        } catch { setStatus("Couldn't copy"); }
      }} style={btn(false)}>⎘ Copy link</button>

      <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}
         target="_blank" rel="noopener noreferrer" title={text} style={btn(true)}>𝕏 Post</a>

      <a href={`https://wa.me/?text=${encodeURIComponent(body)}`}
         target="_blank" rel="noopener noreferrer" title={text} style={btn(false)}>WhatsApp</a>

      {/* The sms: body separator differs by platform — iOS wants "&body=",
          Android "?body=". "?&body=" is the form both parse. */}
      <a href={`sms:?&body=${encodeURIComponent(body)}`} title={text} style={btn(false)}>Messages</a>

      {/* Facebook removed the `quote` parameter years ago, so its sharer
          accepts a URL and silently discards any text. Sending only the link
          is honest; sending text would look correct and vanish. */}
      <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
         target="_blank" rel="noopener noreferrer"
         title="Facebook shares the link only — it strips prefilled text"
         style={btn(false)}>Facebook</a>

      {status && (
        <span style={{ fontFamily: tone.sans, fontSize: 11.5, color: tone.ok, fontWeight: 600 }}>
          {status}
        </span>
      )}
    </div>
  );
}
