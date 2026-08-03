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
