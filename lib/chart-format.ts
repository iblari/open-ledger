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
