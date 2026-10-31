"use client";
import { useRouter } from "next/navigation";
import { writeLoc } from "@/lib/local-client";
import { C, SANS } from "@/lib/design-tokens";

/** "Not your state?" — saves the choice (shared with the Data tab) and reloads. */
export default function ChangeState({ states, current, label = "Change" }: { states: { st: string; name: string }[]; current?: string; label?: string }) {
  const router = useRouter();
  return (
    <label style={{ fontFamily: SANS, fontSize: 12.5, color: C.sub, display: "inline-flex", alignItems: "center", gap: 6 }}>
      {label}
      <select defaultValue={current || ""} onChange={e => { if (e.target.value) { writeLoc(e.target.value); router.refresh(); } }}
        style={{ fontFamily: SANS, fontSize: 12.5, padding: "3px 6px", border: `1px solid ${C.rule}`, borderRadius: 6, background: "#fff", color: C.ink }}>
        <option value="" disabled>Pick a state</option>
        {states.map(s => <option key={s.st} value={s.st}>{s.name}</option>)}
      </select>
    </label>
  );
}
