/**
 * "The record" — when the briefing ends, the page becomes a document.
 *
 * Export contract from spec 2a. Every entry carries the VERBATIM quote (never
 * a paraphrase, so it can be checked against the tape), both figures side by
 * side, the caveat explaining the gap, and the source series. Data-first
 * verdict phrasing is used here — it states the discrepancy rather than
 * passing judgement, which is what makes the export defensible.
 */

export interface RecordClaim {
  time: string;
  verdict: string;
  quote: string;
  claimed?: string | null;
  actual: string;
  note?: string;
  source?: string;
  confidence?: number;
  sources?: { title: string; url: string }[];
}

export interface RecordMeta {
  title: string;
  venue?: string;
  date: string;
  runningTime?: string;
  permalink: string;
}

export interface RecordOptions {
  transcript?: string;
  includeTranscript: boolean;
  includeSources: boolean;
  contradictedOnly: boolean;
}

const FOOTER =
  "AI-assisted fact-check. Verify against the linked source series before publication.";

function summarize(claims: RecordClaim[]) {
  const n = (r: string) => claims.filter(c => c.verdict.toUpperCase() === r).length;
  return {
    checked: claims.length,
    match: n("TRUE") + n("MOSTLY TRUE"),
    misleading: n("MISLEADING"),
    contradicted: n("FALSE"),
  };
}

function agencies(claims: RecordClaim[]): string[] {
  const set = new Set<string>();
  for (const c of claims) {
    const src = c.source || "";
    const m = src.match(/\b(BLS|BEA|Census|Treasury|CBO|GAO|CMS|EIA|FRED|Federal Reserve|FDA|DHS|IMF)\b/g);
    m?.forEach(a => set.add(a));
  }
  return [...set];
}

function filtered(claims: RecordClaim[], o: RecordOptions) {
  return o.contradictedOnly
    ? claims.filter(c => ["FALSE", "MISLEADING"].includes(c.verdict.toUpperCase()))
    : claims;
}

export function buildMarkdown(meta: RecordMeta, claims: RecordClaim[], o: RecordOptions): string {
  const list = filtered(claims, o);
  const s = summarize(claims);
  const out: string[] = [
    `# ${meta.title}`,
    "",
    `**Date:** ${meta.date}${meta.venue ? ` · **Venue:** ${meta.venue}` : ""}${meta.runningTime ? ` · **Running time:** ${meta.runningTime}` : ""}`,
    `**Record:** ${s.checked} claims checked — ${s.match} match the data, ${s.misleading} misleading, ${s.contradicted} contradicted.`,
    agencies(claims).length ? `**Sources drawn on:** ${agencies(claims).join(", ")}` : "",
    `**Permalink:** ${meta.permalink}`,
    "",
    "---",
    "",
  ];
  list.forEach((c, i) => {
    out.push(`### ${i + 1}. [${c.time}] ${c.verdict.toUpperCase()}`);
    out.push("");
    out.push(`> ${c.quote}`);
    out.push("");
    if (c.claimed) out.push(`- **Said:** \`${c.claimed}\``);
    out.push(`- **Official data:** \`${c.actual}\``);
    if (c.note) out.push(`- **Why the gap:** ${c.note}`);
    if (o.includeSources) {
      if (c.source) out.push(`- **Series:** ${c.source}`);
      c.sources?.forEach(x => out.push(`- **Source:** [${x.title}](${x.url})`));
    }
    if (typeof c.confidence === "number") out.push(`- **Model confidence:** ${c.confidence}%`);
    out.push("");
  });
  if (o.includeTranscript && o.transcript) {
    out.push("---", "", "## Full transcript", "", "```", o.transcript.trim(), "```", "");
  }
  out.push("---", "", `_${FOOTER}_`, "");
  return out.filter(l => l !== undefined).join("\n");
}

export function buildCsv(claims: RecordClaim[], o: RecordOptions): string {
  const esc = (v: string | number | null | undefined) =>
    `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
  const rows = [
    ["timestamp", "verdict", "verbatim_quote", "claimed", "official_data", "explanation", "source"].join(","),
    ...filtered(claims, o).map(c =>
      [c.time, c.verdict.toUpperCase(), c.quote, c.claimed ?? "", c.actual, c.note ?? "",
        [c.source, ...(c.sources || []).map(s => s.url)].filter(Boolean).join(" | ")]
        .map(esc).join(",")
    ),
  ];
  return rows.join("\n");
}

export function buildText(meta: RecordMeta, claims: RecordClaim[], o: RecordOptions): string {
  const s = summarize(claims);
  const out = [
    meta.title,
    `${meta.date}${meta.venue ? ` · ${meta.venue}` : ""}`,
    `${s.checked} claims checked — ${s.match} match, ${s.misleading} misleading, ${s.contradicted} contradicted`,
    meta.permalink, "", "".padEnd(60, "-"), "",
  ];
  filtered(claims, o).forEach((c, i) => {
    out.push(`${i + 1}. [${c.time}] ${c.verdict.toUpperCase()}`);
    out.push(`   "${c.quote}"`);
    if (c.claimed) out.push(`   Said:  ${c.claimed}`);
    out.push(`   Data:  ${c.actual}`);
    if (c.note) out.push(`   Note:  ${c.note}`);
    if (o.includeSources && c.source) out.push(`   Series: ${c.source}`);
    out.push("");
  });
  if (o.includeTranscript && o.transcript) {
    out.push("".padEnd(60, "-"), "", "FULL TRANSCRIPT", "", o.transcript.trim(), "");
  }
  out.push("".padEnd(60, "-"), FOOTER, "");
  return out.join("\n");
}

/**
 * The record as a typeset document.
 *
 * Markdown and CSV are fine for machines, but the record is the thing a
 * journalist attaches to a story — it needs to look like a document, with
 * the verdict, the claim, both numbers and the source visible at a glance.
 *
 * Self-contained HTML rather than a generated PDF: it opens anywhere, prints
 * to PDF from any browser with the page furniture stripped, keeps the site's
 * own typography, and adds no server-side rendering dependency. The @page
 * rules and break-inside guards below are what make the printed version hold
 * together — a claim never splits across a page boundary.
 */
const VERDICT_STYLE: Record<string, { label: string; color: string }> = {
  true: { label: "MATCHES DATA", color: "#0E7477" },
  "mostly true": { label: "MATCHES DATA", color: "#0E7477" },
  misleading: { label: "MISLEADING", color: "#B45309" },
  false: { label: "CONTRADICTED", color: "#C2410C" },
  unconfirmed: { label: "UNCONFIRMED", color: "#4A6E8A" },
  projection: { label: "PROJECTION", color: "#4A6E8A" },
  unverifiable: { label: "UNVERIFIABLE", color: "#8A827A" },
};

/**
 * Pull the figure out of a sourced sentence.
 *
 * `actual` reads "BLS reports real average hourly earnings rose 0.1%…" —
 * true, but setting a paragraph in mono makes the document look like a log
 * file, and the whole point of the SAID/DATA pair is that two numbers sit
 * side by side. The figure goes in mono; the sentence stays as prose below,
 * where it belongs. Same extraction the live card uses.
 */
function figureOf(text: string): string | null {
  const t = (text || "").replace(/\s+/g, " ");
  const pats = [
    /\$\s?[\d,]+(?:\.\d+)?\s?(?:trillion|billion|million|[TBMK])\b/i,
    /\$\s?[\d,]+(?:\.\d+)?/,
    /[-+]?\d[\d,]*(?:\.\d+)?\s?(?:percentage points?|pp)\b/i,
    /[-+]?\d[\d,]*(?:\.\d+)?\s?%/,
    /[-+]?\d[\d,]*(?:\.\d+)?\s?(?:trillion|billion|million|thousand)\b/i,
    /[-+]?\d[\d,]*(?:\.\d+)?\s?[TBMK]\b/,
    /[-+]?\d[\d,]*(?:\.\d+)?/,
  ];
  for (const re of pats) { const m = t.match(re); if (m) return m[0].trim(); }
  return null;
}

const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildHtml(meta: RecordMeta, claims: RecordClaim[], o: RecordOptions): string {
  const rows = o.contradictedOnly
    ? claims.filter(c => /false|misleading/i.test(c.verdict))
    : claims;

  const n = (re: RegExp) => rows.filter(c => re.test(c.verdict)).length;
  const stats: [string, number, string][] = [
    ["Claims checked", rows.length, "#1a1a1a"],
    ["Match the data", n(/^(true|mostly true)$/i), "#0E7477"],
    ["Misleading", n(/^misleading$/i), "#B45309"],
    ["Contradicted", n(/^false$/i), "#C2410C"],
  ];

  // Every distinct agency named across the claims — the provenance strip.
  const agencies = [...new Set(rows.map(c => c.source).filter(Boolean) as string[])];

  const claimHtml = rows.map((c, i) => {
    const v = VERDICT_STYLE[(c.verdict || "").toLowerCase()] ?? VERDICT_STYLE.unverifiable;
    return `
    <article class="claim">
      <div class="claim-head">
        <span class="num">[${String(i + 1).padStart(2, "0")}]</span>
        <span class="time">${esc(c.time)}</span>
        <span class="verdict" style="color:${v.color};border-color:${v.color}">${v.label}</span>
        ${c.source ? `<span class="agency">${esc(c.source)}</span>` : ""}
      </div>
      <blockquote>${esc(c.quote)}</blockquote>
      <div class="figures">
        <div><span class="k">Claimed</span><span class="v said">${esc(c.claimed || "—")}</span></div>
        <div><span class="k">Official data</span><span class="v" style="color:${v.color}">${esc(figureOf(c.actual) || "—")}</span></div>
      </div>
      ${c.actual ? `<p class="finding">${esc(c.actual)}</p>` : ""}
      ${c.note ? `<p class="note">${esc(c.note)}</p>` : ""}
      ${o.includeSources && c.sources?.length
        ? `<ul class="sources">${c.sources.map(s => `<li><a href="${esc(s.url)}">${esc(s.title)}</a></li>`).join("")}</ul>`
        : ""}
    </article>`;
  }).join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(meta.title)} — Fact-Check Record</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{--ink:#1a1a1a;--sub:#5c5856;--mute:#9a9490;--rule:#e2ded6;--paper:#faf8f4}
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);
       font-family:'DM Sans',-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
  .sheet{max-width:760px;margin:0 auto;padding:44px 40px 64px;background:#fff;
         border-left:1px solid var(--rule);border-right:1px solid var(--rule);min-height:100vh}
  .eyebrow{font-size:9.5px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--mute)}
  h1{font-family:'Newsreader',Georgia,serif;font-size:34px;font-weight:600;letter-spacing:-.02em;
     margin:9px 0 6px;line-height:1.12}
  .byline{font-size:11.5px;color:var(--sub);margin:0 0 22px}
  .stats{display:flex;gap:34px;padding:16px 0;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule)}
  .stat .n{font-family:'Newsreader',serif;font-size:27px;font-weight:600;line-height:1}
  .stat .l{font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--mute);margin-top:5px}
  .against{display:flex;gap:9px;align-items:baseline;padding:13px 0 0;font-size:10px;color:var(--sub)}
  .against .k{font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--mute);white-space:nowrap}
  .section{font-size:9.5px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;
           color:var(--mute);margin:30px 0 4px}
  .claim{border-top:1px solid var(--rule);padding:16px 0 15px}
  .claim-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
  .num,.time{font-family:'DM Mono',ui-monospace,monospace;font-size:10.5px;color:var(--mute)}
  .verdict{font-size:8.5px;font-weight:700;letter-spacing:.13em;border:1px solid;border-radius:3px;padding:2px 6px}
  .agency{margin-left:auto;font-size:9.5px;color:var(--mute);text-align:right}
  blockquote{font-family:'Newsreader',Georgia,serif;font-size:17px;font-weight:500;line-height:1.42;
             margin:9px 0 11px;color:var(--ink)}
  .figures{display:flex;gap:38px}
  .figures .k{display:block;font-size:8.5px;font-weight:700;letter-spacing:.14em;
              text-transform:uppercase;color:var(--mute);margin-bottom:3px}
  .figures .v{font-family:'DM Mono',ui-monospace,monospace;font-size:14px;font-weight:500}
  .figures .said{color:var(--sub)}
  .finding{font-size:12px;line-height:1.55;color:var(--ink);margin:11px 0 0;max-width:64ch}
  .note{font-size:11.5px;line-height:1.55;color:var(--sub);margin:6px 0 0;max-width:62ch;font-style:italic}
  .sources{margin:8px 0 0;padding-left:15px}
  .sources li{font-size:10px;color:var(--sub);line-height:1.5}
  .sources a{color:var(--sub)}
  footer{margin-top:34px;padding-top:14px;border-top:1px solid var(--rule);
         font-size:10px;color:var(--mute);line-height:1.6}
  .transcript{white-space:pre-wrap;font-size:10.5px;line-height:1.65;color:var(--sub);margin-top:10px}
  @media print{
    /* Strip the browser's own header/footer and the paper edges; the sheet
       IS the page. Claims must never split across a page break — half a
       verdict on one sheet is worse than a short page. */
    @page{margin:16mm}
    body{background:#fff}
    .sheet{border:0;max-width:none;padding:0;min-height:0}
    .claim{break-inside:avoid;page-break-inside:avoid}
    .stats{break-inside:avoid}
    a{text-decoration:none;color:var(--sub)}
  }
</style></head><body><div class="sheet">
  <div class="eyebrow">Vote Unbiased &middot; Fact-check record</div>
  <h1>${esc(meta.title)}</h1>
  <p class="byline">${([meta.venue, meta.date, meta.runningTime && `${meta.runningTime} running time`]
    .filter(Boolean) as string[]).map(esc).join(" &middot; ")}</p>

  <div class="stats">
    ${stats.map(([l, v, c]) => `<div class="stat"><div class="n" style="color:${c}">${v}</div><div class="l">${l}</div></div>`).join("")}
  </div>

  ${agencies.length ? `<div class="against"><span class="k">Checked against</span><span>${agencies.map(esc).join(" &middot; ")}</span></div>` : ""}

  <div class="section">Claim by claim</div>
  ${claimHtml || `<p class="note">No claims matched the current filter.</p>`}

  ${o.includeTranscript && o.transcript
    ? `<div class="section">Full transcript</div><div class="transcript">${esc(o.transcript)}</div>` : ""}

  <footer>
    ${esc(FOOTER)}<br>
    Permalink: <a href="${esc(meta.permalink)}">${esc(meta.permalink)}</a><br>
    Generated ${new Date().toISOString().slice(0, 10)}.
  </footer>
</div></body></html>`;
}
