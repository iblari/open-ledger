"use client";
import { useState } from "react";

/** </> Embed: copies a responsive iframe + attribution link for writers. */
export default function EmbedButton({ src, href, title }: { src: string; href: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const code = `<iframe src="${src}" title="${title.replace(/"/g, "&quot;")}" width="100%" height="460" style="border:0;max-width:760px" loading="lazy"></iframe>\n<p style="font-size:12px">Interactive data by <a href="${href}" target="_blank" rel="noopener">Vote Unbiased</a></p>`;
  const copy = async () => { try { await navigator.clipboard.writeText(code); } catch {} setDone(true); setTimeout(() => setDone(false), 2000); };
  return (
    <span data-nosnippet style={{ position: "relative", display: "inline-block" }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #d8d2c8", background: "#fff", color: "#1a1a1a", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
        &lt;/&gt; Embed
      </button>
      {open && (
        <span style={{ position: "absolute", left: 0, top: "calc(100% + 8px)", zIndex: 10, width: "min(440px, 86vw)", background: "#fff", border: "1px solid #d8d2c8", borderRadius: 10, padding: 12, boxShadow: "0 8px 24px rgba(0,0,0,.12)", display: "block" }}>
          <span style={{ display: "block", fontSize: 12.5, color: "#5c5856", marginBottom: 6 }}>Paste into Substack, WordPress or any page. Free to use with the attribution link.</span>
          <textarea readOnly value={code} rows={5} onFocus={e => e.currentTarget.select()} style={{ width: "100%", fontFamily: "ui-monospace, monospace", fontSize: 11.5, border: "1px solid #e2ded6", borderRadius: 6, padding: 8, resize: "vertical" }} />
          <button type="button" onClick={copy} style={{ marginTop: 8, padding: "7px 12px", borderRadius: 7, border: 0, background: "#1a1a1a", color: "#fff", fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}>{done ? "✓ Copied" : "Copy embed code"}</button>
        </span>
      )}
    </span>
  );
}
