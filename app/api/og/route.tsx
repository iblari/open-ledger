import { ImageResponse } from "next/og";
import { metricBySlug, adminBySlug, ADMINS } from "@/lib/seo-catalog";
import { getBench, rankAt, currentMonth, fmtV, fmtChange } from "@/lib/seo-bench";
import { ogFonts, OgBrand } from "@/lib/og-chart";

/**
 * GET /api/og?type=metric&m={slug}[&a={admin}]  — 1200×630 benchmark card
 * GET /api/og?type=claim&key={claim slug}       — the claim's SAID-vs-DATA card
 */
export const runtime = "nodejs";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  if (sp.get("type") === "claim" && sp.get("key")) {
    return Response.redirect(new URL(`/c/${encodeURIComponent(sp.get("key")!)}/opengraph-image`, req.url), 307);
  }
  const info = metricBySlug(sp.get("m") || "");
  const fonts = await ogFonts();
  const bench = info ? await getBench() : null;
  const m = info && bench ? bench.metrics[info.key] : null;
  const focusAdmin = adminBySlug(sp.get("a") || "");
  const cur = m ? m.series.find(s => s.current) : null;
  const focusId = focusAdmin?.id ?? cur?.id;
  const focusSeries = m?.series.find(s => s.id === focusId);
  const month = m ? (focusAdmin && focusSeries && focusSeries.data.length ? Math.min(47, Math.max(...focusSeries.data.map(d => d.month))) : currentMonth(m) ?? 0) : 0;
  const t = m && info ? rankAt(m, info.key, month) : null;
  const row = t?.rows.find(r => r.id === focusId);
  const score = (r: { value: number; change: number | null }) => (t!.byChange ? (r.change ?? 0) : r.value);
  const max = t ? Math.max(...t.rows.map(r => Math.abs(score(r))), 1e-9) : 1;
  const name = (id: string) => ADMINS.find(a => a.id === id)?.name ?? id;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#0C0A08", color: "#F4F0EA", padding: "46px 60px", fontFamily: "Sans" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 21, letterSpacing: 3, color: "#A39D93" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}><div style={{ width: 13, height: 13, borderRadius: 7, background: "#E0493A" }} />SAME MONTH IN OFFICE · OFFICIAL DATA</div>
          <div>{t ? `MONTH ${t.month + 1}` : ""}</div>
        </div>
        <div style={{ display: "flex", fontFamily: "Serif", fontSize: 54, marginTop: 18 }}>{info ? `${info.name}${focusAdmin ? ` under ${focusAdmin.name}` : ""}` : "The economy under every president"}</div>
        {row && t && m && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 22, marginTop: 6 }}>
            <div style={{ fontFamily: "Serif", fontSize: 76 }}>{t.byChange ? fmtChange(m, row.start, row.value) : fmtV(m, row.value)}</div>
            <div style={{ fontSize: 30, color: "#E0493A" }}>{`#${row.rank} of ${t.n} administrations`}</div>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 14 }}>
          {(t?.rows ?? []).slice(0, 10).map(r => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 110, fontSize: 18, color: r.id === focusId ? "#F4F0EA" : "#8C8479" }}>{name(r.id)}</div>
              <div style={{ display: "flex", height: 14, width: `${Math.max(1.5, (Math.abs(score(r)) / max) * 760)}px`, background: r.id === focusId ? "#E0493A" : "#3A332C", borderRadius: 4 }} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontSize: 22, color: "#A39D93" }}>{`voteunbiased.org · ${info ? info.agency.replace(/ \(.*\)$/, "") : "BLS · BEA · Census · Fed"}`}</div>
          <OgBrand size={28} />
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts, headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } },
  );
}
