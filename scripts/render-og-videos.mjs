// Renders the og:video MP4s: the branded loop, one clip per charted claim,
// and one clip per metric (re-rendered when its latest observation changes).
// v/index.json records what exists, so the site only links videos that do.
//
//   node scripts/render-og-videos.mjs --site https://voteunbiased.org --out og-media [--max 40]
//
// Frames are captured deterministically: every CSS animation on the page is
// paused and set to the frame's time, then screenshotted — no screen
// recording, so no dropped frames. ffmpeg assembles H.264 MP4s
// (yuv420p + faststart, which iMessage/Slack/Safari need).
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const SITE = arg("site", "https://voteunbiased.org");
const OUT = path.resolve(arg("out", "og-media"));
const MAX = Number(arg("max", "40"));
const FPS = 24;
fs.mkdirSync(path.join(OUT, "v"), { recursive: true });

const HIDE = `html,body{margin:0!important;background:#0A0806!important;overflow:hidden!important}
body *{visibility:hidden!important}
#ogv,#ogv *{visibility:visible!important}
#ogv{position:fixed!important;left:0!important;top:0!important;z-index:2147483647!important}`;

async function render(browser, url, file, seconds) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 628 }, deviceScaleFactor: 1 });
  const res = await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  if (!res || res.status() !== 200) { await page.close(); throw new Error(`${url} → ${res && res.status()}`); }
  await page.addStyleTag({ content: HIDE });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ogv-"));
  const n = Math.round(seconds * FPS);
  for (let f = 0; f < n; f++) {
    await page.evaluate(ms => document.getAnimations().forEach(a => { a.pause(); a.currentTime = ms; }), (f * 1000) / FPS);
    await page.screenshot({ path: path.join(dir, `f${String(f).padStart(4, "0")}.jpg`), type: "jpeg", quality: 92, clip: { x: 0, y: 0, width: 1200, height: 628 } });
  }
  await page.close();
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(dir, "f%04d.jpg"),
    "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", file]);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`rendered ${path.basename(file)} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
}

const MAN = path.join(OUT, "v", "index.json");
let manifest = {};
try { manifest = JSON.parse(fs.readFileSync(MAN, "utf8")); } catch {}
// Clips rendered before the manifest existed.
for (const f of fs.readdirSync(path.join(OUT, "v"))) if (f.endsWith(".mp4") && !manifest[f.slice(0, -4)]) manifest[f.slice(0, -4)] = {};
const note = (name, extra = {}) => { manifest[name] = { ...extra, renderedAt: new Date().toISOString(), bytes: fs.statSync(path.join(OUT, "v", `${name}.mp4`)).size }; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
let ok = 0, failed = 0;
// The brand loop: re-rendered every run (its numbers are live).
try { await render(browser, `${SITE}/og-video/brand`, path.join(OUT, "v", "brand.mp4"), 14); note("brand"); ok++; } catch (e) { failed++; console.error("brand:", e.message); }

// Per-claim clips: only ones not rendered yet, newest first.
const q = await (await fetch(`${SITE}/api/og-video/queue`)).json();

// Metric clips: whenever the latest observation is newer than the rendered one.
for (const m of q.metrics || []) {
  if (manifest[m.name]?.date === m.date && fs.existsSync(path.join(OUT, "v", `${m.name}.mp4`))) continue;
  try { await render(browser, `${SITE}/og-video/m/${m.id}`, path.join(OUT, "v", `${m.name}.mp4`), 8); note(m.name, { date: m.date }); ok++; }
  catch (e) { failed++; console.error(m.name, e.message); }
}

const todo = (q.claims || []).filter(c => !fs.existsSync(path.join(OUT, "v", `${c.key}.mp4`))).slice(0, MAX);
console.log(`${todo.length} new clip(s) to render`);
for (const c of todo) {
  try { await render(browser, `${SITE}/og-video/c/${c.key}`, path.join(OUT, "v", `${c.key}.mp4`), 8); note(c.key, { date: c.date }); ok++; }
  catch (e) { failed++; console.error(c.key, e.message); }
}
await browser.close();
// Drop entries whose file was deleted (e.g. to force a re-render).
for (const k of Object.keys(manifest)) if (!fs.existsSync(path.join(OUT, "v", `${k}.mp4`))) delete manifest[k];
fs.writeFileSync(MAN, JSON.stringify(manifest, null, 1));
console.log(`done: ${ok} rendered, ${failed} failed`);
