/**
 * Instagram-sized share cards (1080×1350 portrait, 1080×1080 square) for the
 * share kit: the same designs as the 1200×630 cards, re-laid out for each
 * size. GET /og/ig/{portrait|square}/{m|c|n}/{id}.png
 *   m = metric card (series id), c = fact-check (claim key), n = news story (<slug>-<id>).
 */
import { ImageResponse } from "next/og";
import { getSeries } from "./series";
import { shareSeriesFor, sourceLabel } from "./metric-share";
import { buildOgChart, OgChartSvg, OgBrand, ogFonts, fit } from "./og-chart";
import { getSharedClaim } from "./claim-lookup";
import { hashFromKey } from "./claim-link";
import { toOutcome, ratingLabel } from "./live-design";
import { excerpt } from "./quote-fit";
import { claimChart, claimBars, type ClaimBars, type BarFigure, STAMP, decodeEntities } from "./og-claim-chart";
import { layoutProblem, barHeight } from "./claim-bars-core";
import { getStory } from "./news/store";
import { etTime, leanShares } from "./news/share";
import { photoData } from "./news/og-photo";
import { markSvg } from "./cheetah-mark";

export type IgSize = "portrait" | "square";
export type IgKind = "m" | "c" | "n";
export const IG_W = 1080;
export const igHeight = (s: IgSize) => (s === "portrait" ? 1350 : 1080);

const INNER = IG_W - 128;
const HEADERS = { "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=86400" };
const dataUri = (svg: string) => "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
const MARK_INK = dataUri(markSvg({ ink: "#14110E", accent: "#C8102E", bars: 7, id: "igi", width: 120, height: 40 }));
const MARK_WHITE = dataUri(markSvg({ ink: "#FFFFFF", accent: "#FFFFFF", bars: 7, id: "igw", width: 120, height: 40 }));
const COL = { left: "#4361a6", center: "#FFFFFF", right: "#b8372d" } as const;
const LABEL = { left: "Left", center: "Center", right: "Right" } as const;
const INK = "#14110E", SUB = "#5c5856", MUTE = "#8a8378", RULE = "#CFC9BF";

const notFound = () => new Response("not found", { status: 404 });

export async function renderIg(kind: string, sizeName: string, file: string): Promise<Response> {
  if (sizeName !== "portrait" && sizeName !== "square") return notFound();
  const size: IgSize = sizeName;
  const id = decodeURIComponent(file).replace(/\.png$/i, "");
  if (kind === "m") return metricCard(id, size);
  if (kind === "c") return claimCard(id, size);
  if (kind === "n") return newsCard(id, size);
  return notFound();
}

async function metricCard(file: string, size: IgSize): Promise<Response> {
  const tall = size === "portrait";
  const id = shareSeriesFor(file);
  const [sd, fonts] = await Promise.all([id ? getSeries(id).catch(() => null) : null, ogFonts()]);
  const c = sd ? buildOgChart(sd, { W: INNER, H: tall ? 680 : 380 }) : null;
  if (!sd || !c) return notFound();
  return new ImageResponse((
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#0C0A08", color: "#F4F0EA", padding: "64px 64px 52px", fontFamily: "Sans" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 22, letterSpacing: 3, color: "#A39D93" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 14, height: 14, borderRadius: 7, background: "#E0493A" }} />
          {`OFFICIAL DATA · LATEST ${c.valueDate.toUpperCase()}`}
        </div>
        <div style={{ display: "flex" }}>{sourceLabel(id ?? "", sd.source).toUpperCase()}</div>
      </div>
      <div style={{ display: "flex", marginTop: tall ? 44 : 30, fontFamily: "Serif", fontSize: tall ? 66 : 54, lineHeight: 1.1, maxWidth: INNER }}>{fit(sd.label, 70)}</div>
      <div style={{ display: "flex", flexDirection: tall ? "column" : "row", alignItems: tall ? "flex-start" : "baseline", gap: tall ? 8 : 26, marginTop: 14 }}>
        <div style={{ display: "flex", fontFamily: "Serif", fontSize: tall ? 168 : 120, lineHeight: 1 }}>{c.value}</div>
        {c.change && <div style={{ display: "flex", fontSize: tall ? 32 : 28, color: "#D8D2C8" }}>{c.change}</div>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
        <OgChartSvg c={c} color="#F4F0EA" />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 20, color: "#7A746C", marginTop: 14 }}>
          <span>{`${c.from}–${c.to}`}</span>
          <OgBrand size={30} />
        </div>
      </div>
    </div>
  ), { width: IG_W, height: igHeight(size), fonts, headers: HEADERS });
}

async function claimCard(file: string, size: IgSize): Promise<Response> {
  const tall = size === "portrait";
  const [r, fonts] = await Promise.all([getSharedClaim(hashFromKey(file)), ogFonts()]);
  if (!r) return notFound();
  const c = r.claim;
  const col = STAMP[toOutcome(c.rating)];
  const label = ratingLabel(c.rating);
  const longStamp = label.length > 6;
  const date = new Date(c.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }).toUpperCase();
  const times = r.repeats.length + 1;
  const trend = await claimChart(c, { W: INNER, H: tall ? 400 : 250 });
  const bars0 = await claimBars(c, trend);
  const bars = bars0 && !layoutProblem(bars0, tall) ? bars0 : null;
  const chart = bars ? null : trend;

  const q0 = c.quote.trim();
  const qx = excerpt(q0.charAt(0).toUpperCase() + q0.slice(1), bars || chart ? (tall ? 140 : 100) : (tall ? 210 : 150)).text;
  const quote = qx.charAt(0).toUpperCase() + qx.slice(1);
  const n = quote.length;
  const qSize = tall
    ? (bars || chart ? (n > 100 ? 52 : n > 65 ? 60 : 68) : (n > 150 ? 56 : n > 95 ? 64 : 74))
    : (bars || chart ? (n > 70 ? 42 : 50) : (n > 95 ? 52 : n > 60 ? 60 : 68));
  const who = c.speaker || `From “${fit(decodeEntities(c.title), 64)}”`;

  return new ImageResponse((
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#0C0A08", color: "#F4F0EA", padding: tall ? "64px 64px 56px" : "56px 64px 48px", fontFamily: "Sans" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 22, letterSpacing: 3, color: "#A39D93" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 14, height: 14, borderRadius: 7, background: "#E0493A" }} />
          {c.live ? "LIVE FACT-CHECK" : "FACT-CHECK"}
        </div>
        <div style={{ display: "flex" }}>{date}</div>
      </div>
      <div style={{ display: "flex", flexShrink: 0, marginTop: tall ? 44 : 30, fontFamily: "Serif", fontSize: qSize, lineHeight: 1.12 }}>{`“${quote}”`}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: tall ? 28 : 18, gap: 24 }}>
        <div style={{ display: "flex", fontSize: 26, color: "#A39D93", maxWidth: 560 }}>
          {[who, times > 1 ? `said in ${times} broadcasts` : null].filter(Boolean).join(" · ")}
        </div>
        <div style={{
          display: "flex", flex: "none", border: `6px solid ${col}`, color: col, borderRadius: 14, marginRight: 16,
          padding: longStamp ? "8px 20px" : "10px 26px", fontSize: longStamp ? 40 : 54, letterSpacing: longStamp ? 3 : 4, transform: "rotate(-6deg)",
        }}>{label}</div>
      </div>
      {bars ? (
        <SaidDataBars b={bars} color={col} tall={tall} />
      ) : chart ? (
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", gap: 72, marginBottom: 18 }}>
            {chart.said && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 20, letterSpacing: 3, color: "#A39D93" }}>SAID</div>
                <div style={{ display: "flex", fontSize: tall ? 64 : 52, color: "#D8D2C8" }}>{chart.said}</div>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 20, letterSpacing: 3, color: "#A39D93" }}>DATA</div>
              <div style={{ display: "flex", fontSize: tall ? 64 : 52, color: col }}>{chart.value}</div>
            </div>
          </div>
          <OgChartSvg c={chart} color={col} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 19, color: "#7A746C", marginTop: 8 }}>
            <span>{chart.from}</span><span>{`${fit(chart.label, 46)} · ${chart.source}`}</span><span>{chart.to}</span>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", marginTop: "auto", fontSize: tall ? 34 : 30, lineHeight: 1.35, color: "#D8D2C8" }}>
          {fit(c.actual || "Checked against official data, sources cited.", tall ? 220 : 160)}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
        <OgBrand size={32} />
      </div>
    </div>
  ), { width: IG_W, height: igHeight(size), fonts, headers: HEADERS });
}

function SaidDataBars({ b, color, tall }: { b: ClaimBars; color: string; tall: boolean }) {
  const area = tall ? 500 : 300;
  const numH = tall ? 86 : 66, wordH = tall ? 40 : 32;
  const mx = Math.max(Math.abs(b.said), Math.abs(b.data), 1e-9);
  const h = (v: number) => barHeight(v, mx, area);
  const cols: [string, number, BarFigure, string][] = [["SAID", b.said, b.saidFig, "#A39D93"], ["DATA", b.data, b.dataFig, color]];
  return (
    <div style={{ marginTop: "auto", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 56, paddingBottom: 14, borderBottom: "3px solid #3A352F" }}>
        {cols.map(([l, v, f, fill]) => (
          <div key={l} style={{ display: "flex", flexDirection: "column", flexGrow: 1, flexBasis: 0, minWidth: 0, justifyContent: "flex-end", height: area + numH + wordH + 12 }}>
            <div style={{ display: "flex", flexShrink: 0, height: numH, alignItems: "flex-end", fontFamily: "Serif", fontSize: (tall ? 78 : 60) * (f.num.length > 8 ? 8 / f.num.length : 1), lineHeight: 1, whiteSpace: "nowrap", color: l === "DATA" ? fill : "#D8D2C8" }}>{f.num}</div>
            <div style={{ display: "flex", flexShrink: 0, height: wordH, alignItems: "center", fontSize: tall ? 30 : 24, letterSpacing: 1, whiteSpace: "nowrap", color: "#A39D93", marginBottom: 12 }}>{f.word}</div>
            <div style={{ display: "flex", flexShrink: 0, height: h(v), background: fill, borderRadius: "10px 10px 0 0" }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 56, marginTop: 12, fontSize: 24, letterSpacing: 4, color: "#A39D93" }}>
        <div style={{ display: "flex", flexGrow: 1, flexBasis: 0 }}>SAID</div>
        <div style={{ display: "flex", flexGrow: 1, flexBasis: 0 }}>DATA</div>
      </div>
      <div style={{ display: "flex", fontSize: 21, color: "#7A746C", marginTop: 12 }}>{`${fit(b.metric, 60)} · Source: ${fit(b.source, 44)}`}</div>
    </div>
  );
}

async function newsCard(file: string, size: IgSize): Promise<Response> {
  const tall = size === "portrait";
  const H = igHeight(size);
  const [s, fonts] = await Promise.all([getStory(file.split("-").pop() || ""), ogFonts({ bold: true })]);
  if (!s) return notFound();
  const t0 = s.title.replace(/\s+/g, " ").trim();
  const title = t0.length > 110 ? t0.slice(0, 107).replace(/\s+\S*$/, "") + "…" : t0;
  const n = title.length;
  const tSize = tall ? (n > 85 ? 64 : n > 60 ? 72 : 82) : (n > 85 ? 52 : n > 60 ? 58 : 66);
  const sh = leanShares(s.coverage) || { left: 0, center: 0, right: 0 };
  const parts = (["left", "center", "right"] as const).filter(k => s.coverage[k] > 0);
  const asOf = etTime(s.asOf || s.lastSeen);
  const photo = s.photo ? await photoData([{ url: s.photo.url, name: s.photo.name }, ...(s.photo.alts || [])]) : null;
  const bar = (white: boolean) => (
    <div style={{ display: "flex", height: tall ? 92 : 80, borderRadius: 10, overflow: "hidden", border: white ? "2px solid rgba(255,255,255,0.85)" : `2px solid ${RULE}`, background: "#fff" }}>
      {parts.map(k => (
        <div key={k} style={{ display: "flex", flexGrow: sh[k], flexBasis: 0, minWidth: white ? 150 : 100, alignItems: "center", justifyContent: "center", background: COL[k], color: k === "center" ? INK : "#fff", fontSize: tall ? 34 : 30, fontWeight: 700 }}>
          {white || sh[k] >= 16 ? `${LABEL[k]} ${sh[k]}%` : `${sh[k]}%`}
        </div>
      ))}
    </div>
  );

  if (photo) {
    return new ImageResponse((
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: INK, fontFamily: "Sans", color: "#fff" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.src} width={IG_W} height={H} alt="" style={{ position: "absolute", top: 0, left: 0, width: IG_W, height: H, objectFit: "cover" }} />
        <div style={{ position: "absolute", top: 0, left: 0, width: IG_W, height: H, display: "flex", backgroundImage: "linear-gradient(to bottom, rgba(20,17,14,0.45) 0%, rgba(20,17,14,0.55) 35%, rgba(20,17,14,0.93) 100%)" }} />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: tall ? "64px 64px 72px" : "56px 64px 60px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", fontSize: 26, fontWeight: 700, letterSpacing: 0.5, padding: "8px 20px", borderRadius: 999, background: "rgba(255,255,255,0.18)", border: "1.5px solid rgba(255,255,255,0.55)" }}>
              {`${s.outlets} source${s.outlets === 1 ? "" : "s"}`}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={MARK_WHITE} width={57} height={19} alt="" />
              <div style={{ display: "flex", fontSize: 22, fontWeight: 700 }}>voteunbiased.org</div>
            </div>
          </div>
          <div style={{ display: "flex", marginTop: tall ? 44 : 32, fontSize: tSize, fontWeight: 700, lineHeight: 1.08 }}>{title}</div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
            {bar(true)}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 14, fontSize: 20, color: "rgba(255,255,255,0.75)" }}>
              <div style={{ display: "flex" }}>{`Share of rated outlets covering it · as of ${asOf}`}</div>
              <div style={{ display: "flex" }}>{`Photo: ${photo.name}`}</div>
            </div>
          </div>
        </div>
      </div>
    ), { width: IG_W, height: H, fonts, headers: HEADERS });
  }
  return new ImageResponse((
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#fff", color: INK, padding: tall ? "64px 64px 72px" : "56px 64px 60px", fontFamily: "Sans" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 20, borderBottom: `3px solid ${INK}` }}>
        <div style={{ display: "flex", fontSize: 20, letterSpacing: 2, color: MUTE }}>{`AS OF ${asOf.toUpperCase()}`}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARK_INK} width={78} height={26} alt="" />
          <div style={{ display: "flex", fontFamily: "Serif", fontSize: 28 }}>Vote&nbsp;<span style={{ color: "#C8102E" }}>Unbiased</span></div>
        </div>
      </div>
      <div style={{ display: "flex", marginTop: tall ? 48 : 34, fontSize: tSize, fontWeight: 700, lineHeight: 1.08 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
        <div style={{ display: "flex", fontSize: 20, letterSpacing: 2.5, color: MUTE, marginBottom: 14 }}>WHO COVERED IT</div>
        {bar(false)}
        <div style={{ display: "flex", marginTop: 16, fontSize: 24, color: SUB }}>Share of rated outlets covering it, by lean</div>
        <div style={{ display: "flex", marginTop: 6, fontSize: 18, color: MUTE }}>voteunbiased.org · lean from Robertson et al. (2018)</div>
      </div>
    </div>
  ), { width: IG_W, height: H, fonts, headers: HEADERS });
}
