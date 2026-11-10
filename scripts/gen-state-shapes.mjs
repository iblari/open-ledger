import { readFileSync, writeFileSync } from "node:fs";
import { geoAlbersUsa, geoPath, geoMercator } from "d3-geo";
import { feature } from "topojson-client";
const topo = JSON.parse(readFileSync("/tmp/states-10m.json", "utf8"));
const fc = feature(topo, topo.objects.states);
const FIPS = {"01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE","11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV","55":"WI","56":"WY"};
const W = 400, H = 300, out = {};
for (const f of fc.features) {
  const st = FIPS[String(f.id).padStart(2, "0")]; if (!st) continue;
  const proj = st === "AK" ? geoMercator().rotate([150, 0]) : st === "HI" ? geoMercator() : geoMercator();
  proj.fitExtent([[10, 10], [W - 10, H - 10]], f);
  let d = geoPath(proj)(f) || "";
  d = d.replace(/(\d+\.\d+)/g, m => (Math.round(+m * 10) / 10).toString());
  out[st] = d;
}
writeFileSync("lib/data/state-shapes.json", JSON.stringify(out));
console.log(Object.keys(out).length, (JSON.stringify(out).length / 1024).toFixed(0) + "KB");
