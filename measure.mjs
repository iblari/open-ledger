import { likelyHasEconomicClaim } from "./lib/claim-utils.ts";
import fs from "fs";
const d = JSON.parse(fs.readFileSync("/tmp/rec2.json","utf8"));
const b = (d.recent || d.broadcasts)[0];
const tr = (b.transcript || "").replace(/\[\d+:\d\d\]/g, " ").replace(/\s+/g," ").trim();
const words = tr.split(" ");
console.log(`broadcast: ${b.videoId}  ${b.claims.length} claims found automatically`);
console.log(`transcript: ${words.length} words\n`);

// The worker sends ~15s of speech ≈ 40 words. Manual sends ~75s ≈ 200 words.
for (const [label, size] of [["auto 15s chunk (~40w)", 40], ["60s (~160w)", 160], ["manual 75s (~200w)", 200]]) {
  let total = 0, passed = 0;
  for (let i = 0; i < words.length; i += size) {
    const chunk = words.slice(i, i + size).join(" ");
    if (chunk.split(" ").length < 10) continue;
    total++;
    if (likelyHasEconomicClaim(chunk)) passed++;
  }
  console.log(`${label.padEnd(24)} ${passed}/${total} chunks reach the model  (${Math.round(100*passed/total)}%)`);
}
