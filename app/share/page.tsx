import type { Metadata } from "next";
import { buildShareKit } from "@/lib/share-kit";
import CopyButton from "./CopyButton";

/** /share — Sam's share kit as a page: what to post today, with copy buttons. */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Share kit · Vote Unbiased", robots: { index: false, follow: false } };

const box: React.CSSProperties = { background: "#fff", border: "1px solid #E2DED6", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8 };
const h2: React.CSSProperties = { fontFamily: "'Newsreader',Georgia,serif", fontWeight: 500, fontSize: 24, margin: "28px 0 10px" };

export default async function SharePage() {
  const k = await buildShareKit();
  return (
    <div style={{ background: "#F8F5F0", minHeight: "100vh", fontFamily: "'DM Sans',system-ui,sans-serif", color: "#14110E" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 20px 60px" }}>
        <h1 style={{ fontFamily: "'Newsreader',Georgia,serif", fontWeight: 500, fontSize: 34, margin: 0 }}>Share kit</h1>
        <p style={{ color: "#5F5850", fontSize: 14, margin: "6px 0 0" }}>For Sam · updated {new Date(k.generatedAt).toLocaleString("en-US", { timeZone: "America/New_York" })} ET · feed: <a href="/api/share-kit">/api/share-kit</a></p>
        <ul style={{ fontSize: 13, color: "#5F5850", lineHeight: 1.6, paddingLeft: 18 }}>{k.rules.map(r => <li key={r}>{r}</li>)}</ul>

        <h2 style={h2}>Fact-checks</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
          {k.claims.map(c => (
            <div key={c.id} style={box}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.image} alt="" width={1200} height={630} style={{ width: "100%", height: "auto", borderRadius: 8 }} loading="lazy" />
              <div style={{ fontSize: 12, color: "#8C8479" }}>{c.ratingLabel} · {c.speaker || c.event} · {new Date(c.saidAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
              <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13.5, margin: 0 }}>{c.caption}</pre>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <CopyButton text={c.caption} label="Copy post" />
                <CopyButton text={c.link} label="Copy link" />
                {c.video && <a href={c.video} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, padding: "6px 10px" }}>Video ↗</a>}
              </div>
            </div>
          ))}
        </div>

        <h2 style={h2}>Data charts</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
          {k.metrics.map(m => (
            <div key={m.id} style={box}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.image} alt="" width={1200} height={630} style={{ width: "100%", height: "auto", borderRadius: 8 }} loading="lazy" />
              <div style={{ fontSize: 12, color: m.releasedLast24h ? "#C0392B" : "#8C8479" }}>{m.releasedLast24h ? "New data today · " : ""}data updated {new Date(m.dataUpdatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
              <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13.5, margin: 0 }}>{m.caption}</pre>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <CopyButton text={m.caption} label="Copy post" />
                <CopyButton text={m.link} label="Copy link" />
                {m.video && <a href={m.video} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, padding: "6px 10px" }}>Video ↗</a>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
