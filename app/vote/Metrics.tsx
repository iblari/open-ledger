import { C, SANS } from "@/lib/design-tokens";
import { POLL_SOURCE } from "@/lib/polls";

/** "What we compare": every measure on the ballot pages, where it comes from and how current it is. */
export default function Metrics({ through, pollsAt, open = false }: { through: string | null; pollsAt: string | null; open?: boolean }) {
  const rows: [string, string, React.ReactNode, string][] = [
    ["Polls", "Senate", <><a href={POLL_SOURCE.url} style={{ color: C.sub }}>{POLL_SOURCE.name}</a>, nonpartisan pollsters only. Average of each pollster's latest poll, last 30 days.</>, pollsAt ? `Checked hourly · last ${new Date(pollsAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET` : "Checked hourly"],
    ["Money raised, cash on hand", "Senate", <><a href="https://www.fec.gov/data/candidates/senate/" style={{ color: C.sub }}>FEC</a> filings, 2025–26. Governors report to their state.</>, through ? `Through ${through} · next Dec 3` : "Latest FEC filings"],
    ["Small-donor share", "Senate", "Donations under $200 (FEC).", through ? `Through ${through}` : ""],
    ["Own money", "Senate", "Candidate's own contributions and loans (FEC).", through ? `Through ${through}` : ""],
    ["Votes with own party, missed votes, key votes", "Members of Congress", <><a href="https://voteview.com" style={{ color: C.sub }}>Voteview</a>, 119th Congress.</>, "2025–26"],
    ["Live fact-checks", "Everyone", "Our live broadcast checks.", "Live"],
    ["In their own words", "Everyone", "Verbatim quotes from campaign sites.", "Checked Oct 26"],
  ];
  return (
    <details open={open} style={{ border: `1px solid ${C.rule}`, borderRadius: 14, background: "#fff", fontFamily: SANS }}>
      <summary style={{ cursor: "pointer", padding: "12px 16px", fontWeight: 700, fontSize: 15, listStyle: "none", display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ whiteSpace: "nowrap" }}>What we compare</span><span style={{ fontWeight: 400, color: C.mute, fontSize: 13 }}>Sources</span>
        <span style={{ marginLeft: "auto", color: C.mute, fontSize: 12 }}>▾</span>
      </summary>
      <div style={{ borderTop: `1px solid ${C.rule}` }}>
        {rows.map(([name, who, how, when]) => (
          <div key={name} className="vm-row" style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr) 230px", gap: 14, padding: "10px 16px", borderTop: `1px solid ${C.rule}`, fontSize: 13, lineHeight: 1.5 }}>
            <div><b style={{ fontWeight: 700 }}>{name}</b><div style={{ fontSize: 11.5, color: C.mute }}>{who}</div></div>
            <div style={{ color: C.sub }}>{how}</div>
            <div style={{ color: C.mute, fontSize: 12 }}>{when}</div>
          </div>
        ))}
      </div>
      <style>{`.vm-row:first-child{border-top:none!important}@media(max-width:720px){.vm-row{grid-template-columns:minmax(0,1fr)!important;gap:2px!important}}`}</style>
    </details>
  );
}
