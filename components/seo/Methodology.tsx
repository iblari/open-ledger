import Link from "next/link";
import type { MetricInfo } from "@/lib/seo-catalog";
import { fredUrl } from "@/lib/seo-catalog";
import { C, SERIF } from "@/lib/design-tokens";

export default function Methodology({ info, published }: { info: MetricInfo; published?: { obs: string; d: string } }) {
  return (
    <section style={{ marginTop: 28, background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 12, padding: "16px 18px" }}>
      <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 21, margin: "0 0 8px" }}>Methodology and source verification</h2>
      <p style={{ fontSize: 14.5, lineHeight: 1.65, margin: "0 0 8px" }}>{info.method}</p>
      <p style={{ fontSize: 14.5, lineHeight: 1.65, margin: "0 0 8px" }}>
        Every administration is aligned to its own inauguration: month 1 is the month it took office, and the comparison runs to month 48 (the first term). Each administration is compared at the <b>same</b> month in office, so a president halfway through a term is never measured against another's full four years.
      </p>
      <p style={{ fontSize: 14, color: C.sub, lineHeight: 1.6, margin: 0 }}>
        Primary source: <a href={info.agencyUrl} style={{ color: C.sub }}>{info.agency}</a>. Retrieved from the Federal Reserve Bank of St. Louis (FRED), series {info.series.map((s, i) => <span key={s}>{i ? ", " : ""}<a href={fredUrl(s)} style={{ color: C.sub }}>{s}</a></span>)}, refreshed hourly.
        {published ? ` Latest observation ${published.obs}, first published ${published.d}.` : ""} Full methods: <Link href="/methodology" style={{ color: C.sub }}>methodology</Link>.
      </p>
    </section>
  );
}
