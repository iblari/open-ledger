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
