import { ImageResponse } from "next/og";
import { getSharedClaim } from "@/lib/claim-lookup";
import { hashFromKey } from "@/lib/claim-link";
import { toOutcome, VERDICT_LABEL } from "@/lib/live-design";
import { markSvg } from "@/lib/cheetah-mark";
import { kvGet } from "@/lib/live-kv";
import { SERIES_KEY, cleanMapping, type ClaimSeries } from "@/lib/claim-series";
import { getSeries } from "@/lib/series";
import { buildOgChart, OgChartSvg, type OgChart } from "@/lib/og-chart";
import { listTrendingClaims } from "@/lib/trending-claims";

/**
 * The preview card for one fact-check — what a pasted link looks like in
 * Messages, WhatsApp or X. Quote, verdict stamp and the figure on record are
 * all in the image, so it makes its point without a tap.
 */
export const alt = "Vote Unbiased fact-check";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 120;

// Brighter than the page palette: these sit on near-black.
const STAMP: Record<string, string> = {
  true: "#2BA393", misleading: "#E08A2E", false: "#E0493A",
  projection: "#7FA3C2", unconfirmed: "#7FA3C2", unverifiable: "#A39D93", checking: "#A39D93",
};

async function font(family: string, spec: string): Promise<ArrayBuffer | null> {
  try {
    // No browser UA → Google serves TrueType, which the image renderer reads.
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}:${spec}`)).text();
    const url = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch { return null; }
}

const MARK = "data:image/svg+xml;base64," + Buffer.from(markSvg({ bars: 7, id: "cog", width: 120, height: 40 })).toString("base64");
const decodeEntities = (s: string) => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const fit = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s);

export default async function Image({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const [r, serif, sans] = await Promise.all([
    getSharedClaim(hashFromKey(key)),
    font("Source+Serif+4", "wght@400"),
    font("DM+Sans", "wght@500"),
  ]);
  const fonts = [
    ...(serif ? [{ name: "Serif", data: serif, weight: 400 as const, style: "normal" as const }] : []),
    ...(sans ? [{ name: "Sans", data: sans, weight: 500 as const, style: "normal" as const }] : []),
  ];

  if (!r) {
    return new ImageResponse(
      (<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0C0A08" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MARK} width={360} height={120} alt="" />
      </div>), { ...size, fonts });
  }

  const c = r.claim;
  const v = toOutcome(c.rating);
  const col = STAMP[v];
  const q0 = c.quote.trim();
  const quote = fit(q0.charAt(0).toUpperCase() + q0.slice(1), 130);
  const qSize = quote.length > 95 ? 50 : quote.length > 60 ? 58 : 66;
  const date = new Date(c.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }).toUpperCase();
  const times = r.repeats.length + 1;

  // The chart behind the verdict, when the claim maps to an official series
  // (lib/og-chart, shared with the metric cards): ~5 years, the claimed value
  // as a dashed line, the reading at the claim as a dot.
  let chart: OgChart | null = null;
  try {
    const [raw] = await kvGet([SERIES_KEY(c.key)]);
    const map = cleanMapping(raw ? JSON.parse(raw) as ClaimSeries : null, { quote: c.quote, actual: c.actual, explanation: c.explanation, date: c.date });
    const sd = map?.series ? await getSeries(map.series, map.countries) : null;
    if (sd && map) {
      // Same fallback as the page: the checker's extracted value when the
      // mapping didn't restate it. Claims about the past get no said line.
      const historical = map.terms || !!map.since;
      const said = historical ? null : map.said ?? (await listTrendingClaims().catch(() => [])).find(x => x.key === c.key)?.claimedValue ?? null;
      chart = buildOgChart(sd, { lineKey: map.saidCountry, anchor: c.date, said });
    }
  } catch { chart = null; }
  // Who said it — or, when the title names nobody (or several people), the event.
  const who = c.speaker || `From “${fit(decodeEntities(c.title), 64)}”`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#0C0A08", color: "#F4F0EA", padding: "56px 64px", fontFamily: "Sans" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 22, letterSpacing: 3, color: "#A39D93" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 14, height: 14, borderRadius: 7, background: "#E0493A" }} />
            {c.live ? "LIVE FACT-CHECK" : "FACT-CHECK"}
          </div>
          <div>{date}</div>
        </div>

        <div style={{ display: "flex", marginTop: chart ? 24 : 34, fontFamily: "Serif", fontSize: chart ? Math.min(qSize, 46) : qSize, lineHeight: 1.12, maxWidth: 760 }}>
          “{quote}”
        </div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 24, color: "#A39D93" }}>
          {[who, times > 1 ? `said in ${times} broadcasts` : null].filter(Boolean).join(" · ")}
        </div>

        <div style={{
          position: "absolute", right: 64, top: 190, display: "flex",
          border: `6px solid ${col}`, color: col, borderRadius: 14, padding: "10px 26px",
          fontSize: 54, letterSpacing: 4, transform: "rotate(-7deg)", fontWeight: 500,
        }}>{VERDICT_LABEL[v]}</div>

        {chart && (
          <div style={{ marginTop: "auto", display: "flex", gap: 36, alignItems: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, width: 260 }}>
              {chart.said && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ fontSize: 18, letterSpacing: 3, color: "#A39D93" }}>SAID</div>
                  <div style={{ fontSize: 46, color: "#D8D2C8" }}>{chart.said}</div>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 18, letterSpacing: 3, color: "#A39D93" }}>DATA</div>
                <div style={{ fontSize: 46, color: col }}>{chart.value}</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", width: 700 }}>
              <OgChartSvg c={chart} color={col} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17, color: "#7A746C", marginTop: 6 }}>
                <span>{chart.from}</span><span>{fit(chart.label, 52)} · {chart.source}</span><span>{chart.to}</span>
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: chart ? 18 : "auto", display: "flex", justifyContent: chart ? "flex-end" : "space-between", alignItems: "flex-end", gap: 40 }}>
          {!chart && (
          <div style={{ display: "flex", fontSize: 25, lineHeight: 1.35, color: "#D8D2C8", maxWidth: 820 }}>
            {fit(c.actual || "Checked against official data, sources cited.", 150)}
          </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "none" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MARK} width={84} height={28} alt="" />
            <div style={{ display: "flex", fontFamily: "Serif", fontSize: 30 }}>Vote&nbsp;<span style={{ color: "#E0493A" }}>Unbiased</span></div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
