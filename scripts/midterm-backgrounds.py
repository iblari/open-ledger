"""
Candidate backgrounds for /vote from Wikidata (CC0, the structured records
behind Wikipedia): education, career, offices held. Matching, safest first:
  1. FEC candidate ID (Wikidata P1839)   2. Congress Bioguide ID (P1157)
  3. exact English name/alias + a US politician check (holds a US/state office,
     or occupation politician with US citizenship, or described as American /
     a candidate).
Unmatched candidates get no background (shown as "Not listed"). Writes back
into lib/data/midterms-2026.json under candidate.bg. Run: python3 scripts/midterm-backgrounds.py
"""
import json, re, time, urllib.parse, urllib.request
P = "lib/data/midterms-2026.json"
UA = {"User-Agent": "VoteUnbiasedBot/1.0 (https://voteunbiased.org; ibrahimlari7@gmail.com)"}
def get(u):
    for i in range(4):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60))
        except Exception as e:
            if i == 3: raise
            time.sleep(3 * (i + 1))
def sparql(q): return get("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(q))["results"]["bindings"]
val = lambda b, k: b[k]["value"] if k in b else None
qid = lambda u: u.rsplit("/", 1)[-1]

d = json.load(open(P))
mains = [(r, c) for r in d["races"] for c in r["candidates"] if c["main"]]

# 1-2: by IDs
fec = [c["fec"]["id"] for _, c in mains if c.get("fec")]
bio = [c["record"]["bioguide"] for _, c in mains if c.get("record") and c["record"].get("bioguide")]
byid = {}
for prop, ids in (("P1839", fec), ("P1157", bio)):
    vals = " ".join(f'"{i}"' for i in ids)
    for b in sparql(f"SELECT ?p ?id WHERE {{ VALUES ?id {{ {vals} }} ?p wdt:{prop} ?id }}"):
        byid[val(b, "id")] = qid(val(b, "p"))

def by_name(name, state):
    """First search hit that is a living US citizen who is a politician, has held
    an office, or is described as a candidate. Never trusts the first hit blindly."""
    r = get("https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({"action": "wbsearchentities", "search": name, "language": "en", "format": "json", "limit": 10, "type": "item"}))
    for x in r["search"]:
        if x.get("match", {}).get("type") not in ("label", "alias"): continue
        if x.get("match", {}).get("text", "").lower() != name.lower(): continue
        q = x["id"]; desc = (x.get("description") or "").lower()
        ok = get("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(
            f"ASK {{ wd:{q} wdt:P31 wd:Q5 ; wdt:P27 wd:Q30 . FILTER NOT EXISTS {{ wd:{q} wdt:P570 ?died }} {{ wd:{q} wdt:P106 wd:Q82955 }} UNION {{ wd:{q} wdt:P39 ?office }} }}"))["boolean"]
        if ok or ("candidate" in desc and "american" in desc):
            return q
        time.sleep(0.2)
    return None

import os, sys
CACHE = "/tmp/bg_q.json"
seen = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
t0 = time.time()
for r, c in mains:
    key = r["id"] + "|" + c["name"]
    if key in seen: c["_q"], c["_how"] = seen[key]; continue
    if time.time() - t0 > 140: print("partial, rerun"); json.dump(seen, open(CACHE, "w")); sys.exit(2)
    q = (c.get("fec") and byid.get(c["fec"]["id"])) or (c.get("record") and byid.get(c["record"].get("bioguide"))) or None
    how = "id" if q else None
    if not q:
        q = by_name(c["name"], r["state"]); how = "name" if q else None
    c["_q"], c["_how"] = q, how
    seen[key] = [q, how]
json.dump(seen, open(CACHE, "w"))

KEEP = re.compile(r"Law|Business|Graduate|Medic|Divinity|Government|Management|Public|Journalism|Engineering|Seminary|Kennedy|Nursing|Dental|Economics|Policy|Theolog|Military|Naval|War", re.I)
HS = re.compile(r"\b(high school|secondary school|academy|preparatory|prep school|elementary|middle school)\b", re.I)
SKIP_JOB = {"politician", "candidate", "political candidate"}
qs = sorted({c["_q"] for _, c in mains if c["_q"]})
info = {q: {"edu": [], "jobs": [], "offices": [], "wiki": None} for q in qs}
for i in range(0, len(qs), 40):
    vals = " ".join("wd:" + q for q in qs[i:i + 40])
    for b in sparql(f"""SELECT ?p ?k ?vLabel ?start ?end WHERE {{ VALUES ?p {{ {vals} }}
      {{ ?p p:P69 ?s. ?s ps:P69 ?v. FILTER NOT EXISTS {{ ?v wdt:P31/wdt:P279* wd:Q9826 }} FILTER NOT EXISTS {{ ?v wdt:P31/wdt:P279* wd:Q159334 }} BIND("edu" AS ?k) }} UNION
      {{ ?p p:P106 ?s. ?s ps:P106 ?v. BIND("job" AS ?k) }} UNION
      {{ ?p p:P39 ?s. ?s ps:P39 ?v. OPTIONAL{{?s pq:P580 ?start}} OPTIONAL{{?s pq:P582 ?end}} BIND("pos" AS ?k) }} UNION
      {{ ?p p:P108 ?s. ?s ps:P108 ?v. FILTER NOT EXISTS {{ ?v wdt:P31 wd:Q5 }} OPTIONAL{{?s pq:P580 ?start}} OPTIONAL{{?s pq:P582 ?end}} BIND("emp" AS ?k) }} UNION
      {{ ?p p:P241 ?s. ?s ps:P241 ?v. OPTIONAL{{?s pq:P580 ?start}} OPTIONAL{{?s pq:P582 ?end}} BIND("mil" AS ?k) }}
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }} }}"""):
        q = qid(val(b, "p")); k = val(b, "k"); v = val(b, "vLabel")
        if not v or re.fullmatch(r"Q\d+", v): continue
        x = info[q]
        if k == "edu" and not HS.search(v) and not (re.search(r"\bSchool$", v) and not KEEP.search(v)) and v not in x["edu"]: x["edu"].append(v)
        elif k == "job" and v.lower() not in SKIP_JOB and v not in x["jobs"]: x["jobs"].append(v)
        elif k in ("emp", "mil"):
            s0, e0 = (val(b, "start") or "")[:4], (val(b, "end") or "")[:4]
            if not any(o["t"] == v for o in x.setdefault("work", [])): x["work"].append({"t": v, "from": s0, "to": e0, "kind": k})
        elif k == "pos":
            s, e = (val(b, "start") or "")[:4], (val(b, "end") or "")[:4]
            if not any(o["t"] == v and o["from"] == s for o in x["offices"]): x["offices"].append({"t": v, "from": s, "to": e})
    for b in sparql(f"""SELECT ?p ?a WHERE {{ VALUES ?p {{ {vals} }} ?a schema:about ?p; schema:isPartOf <https://en.wikipedia.org/> }}"""):
        info[qid(val(b, "p"))]["wiki"] = val(b, "a")
    time.sleep(1)

# Opening of each English Wikipedia article, verbatim (first two sentences), for career context.
def summary(url):
    try:
        t = url.rsplit("/", 1)[-1]
        x = get("https://en.wikipedia.org/api/rest_v1/page/summary/" + t)
        ext = re.sub(r"\s+", " ", x.get("extract") or "").strip()
        parts = re.split(r"(?<=[a-z0-9\)][.])\s+(?=[A-Z])", ext)
        out = parts[0]
        if len(parts) > 1 and len(out) + len(parts[1]) < 330: out += " " + parts[1]
        return out if 40 < len(out) <= 420 else (out[:400].rsplit(" ", 1)[0] + "…" if len(out) > 420 else None)
    except Exception:
        return None

n = {"id": 0, "name": 0, "none": 0}
for r, c in mains:
    q = c.pop("_q"); how = c.pop("_how")
    n[how or "none"] += 1
    if not q: c["bg"] = None; continue
    x = info[q]
    # merge the same office across terms; newest first; drop pure candidacies
    offs = {}
    for o in x["offices"]:
        if re.search(r"candidate", o["t"], re.I): continue
        cur = offs.setdefault(o["t"], {"t": o["t"], "from": o["from"], "to": o["to"]})
        if o["from"] and (not cur["from"] or o["from"] < cur["from"]): cur["from"] = o["from"]
        if not o["to"] or (cur["to"] and o["to"] > cur["to"]): cur["to"] = o["to"] if o["to"] else ""
    offices = sorted(offs.values(), key=lambda o: (o["to"] == "", o["to"] or o["from"], o["from"]), reverse=True)
    work = [dict(o, t=("U.S. " + o["t"] if o["kind"] == "mil" and not o["t"].lower().startswith(("united states", "u.s.")) else o["t"])) for o in x.get("work", [])]
    work = sorted(work, key=lambda o: (o["to"] == "" and o["from"] != "", o["to"] or o["from"]), reverse=True)
    c["bg"] = {"qid": q, "match": how, "wiki": x["wiki"], "edu": x["edu"][:4], "offices": offices[:5], "work": [{"t": o["t"], "from": o["from"], "to": o["to"], "kind": o["kind"]} for o in work[:4]]}
json.dump(d, open(P, "w"), ensure_ascii=False, separators=(",", ":"))
print("matched", n)
