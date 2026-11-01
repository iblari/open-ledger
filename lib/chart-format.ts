import type { ClaimChart } from "./claim-chart";

/** Value formatting shared by the claim chart and its share image. */
export function fmtVal(v: number, unit: string, dec: number): string {
  const n = Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : v.toFixed(dec);
  if (unit === "%") return `${v.toFixed(dec)}%`;
  if (unit === "$") return `${v < 0 ? "-" : ""}$${Math.abs(v) >= 1000 ? Math.round(Math.abs(v)).toLocaleString("en-US") : Math.abs(v).toFixed(dec)}`;
  if (unit.startsWith("$/")) return `$${v.toFixed(dec)}${unit.slice(1)}`;
  if (unit === "$B" || unit === "$T") return `${v < 0 ? "-" : ""}$${Math.abs(v) >= 1000 ? Math.round(Math.abs(v)).toLocaleString("en-US") : Math.abs(v).toFixed(dec)}${unit.slice(1)}`;
  if (unit === "index") return n;
  return `${n} ${unit}`;
}

/** Context figures on the same scale as the claim. Sources often put other
 *  numbers next to a dollar figure (jobs, megawatts, children, a %); those
 *  are a different measure, so anything more than 200× away from the
 *  reference figure — or a "part" under 0.5% of it — is left off. */
export function saneContext<T extends { value: number; kind: "part" | "compare" }>(
  context: T[] | undefined, data: number | null | undefined, said: number | null | undefined,
): T[] {
  const ref = Math.abs(data ?? said ?? 0);
  if (!context?.length) return [];
  if (!ref) return context;
  return context.filter(x => {
    const r = Math.abs(x.value) / ref;
    if (x.kind === "part") return r >= 0.005 && r <= 1.02;
    return r >= 1 / 200 && r <= 200;
  });
}

export function fmtU(v: number, unit: string): string {
  const u = unit.trim(), a = Math.abs(v), sign = v < 0 ? "-" : "";
  if (u === "%") return `${Math.round(v * 10) / 10}%`;
  const big = a >= 1e12 ? `${+(a / 1e12).toFixed(2)}T` : a >= 1e9 ? `${+(a / 1e9).toFixed(1)}B` : a >= 1e6 ? `${+(a / 1e6).toFixed(1)}M` : null;
  if (u === "$") return `${sign}$${big ?? (a >= 1000 ? Math.round(a).toLocaleString("en-US") : a.toFixed(2))}`;
  const n = big ? sign + big : a >= 1000 ? Math.round(v).toLocaleString("en-US") : String(Math.round(v * 100) / 100);
  return u ? `${n} ${u}` : n;
}
/** The model sometimes names the thing counted ("deaths") as the unit of a
 *  percent change; when the verified data figure is written as a percent,
 *  it is a percent. */
export function unitOf(ch: ClaimChart): string {
  if (ch.unit === "%" || !ch.data) return ch.unit;
  const n = String(Math.abs(ch.data.value));
  return new RegExp(`${n.replace(".", "\\.")}\\s*(%|percent)`, "i").test(ch.data.span.replace(/(\d),(\d{3})/g, "$1$2")) ? "%" : ch.unit;
}
