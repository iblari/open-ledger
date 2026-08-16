import { chromium } from "playwright";
const exe = "/sessions/sharp-great-shannon/.cache/ms-playwright/chromium_headless_shell-1234/chrome-linux/headless_shell";
const browser = await chromium.launch({ args: ["--no-sandbox"], executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const events = [];
page.on("console", m => { if (m.type()==="error") events.push(`console.error: ${m.text().slice(0,180)}`); });
page.on("pageerror", e => events.push(`PAGEERROR: ${String(e).slice(0,250)}`));
page.on("crash", () => events.push("!!! PAGE CRASHED !!!"));

await page.goto("https://voteunbiased.org/live", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);

// open the archived broadcast like a user would
const row = page.locator("text=Executive Order").first();
console.log("archive row visible:", await row.isVisible().catch(() => false));
await row.click({ timeout: 5000 }).catch(e => console.log("row click failed:", e.message.slice(0,100)));

let sawBtn = false;
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(1800);
  if (await page.locator("text=Check this moment").first().isVisible().catch(() => false)) {
    console.log(`check button appeared after ~${(i+1)*2.5}s`); sawBtn = true; break;
  }
}
if (sawBtn) {
  await page.locator("text=Check this moment").first().click();
  console.log("CLICKED check-this-moment");
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(1800).catch(() => {});
    if (page.isClosed()) { events.push("page closed"); break; }
    const alive = await page.evaluate(() => 1).then(() => true).catch(() => false);
    if (!alive) { events.push(`RENDERER UNRESPONSIVE/GONE after ~${(i+1)*2.5}s`); break; }
  }
  console.log("manual result rendered:", await page.locator("text=You checked this moment").isVisible().catch(() => false));
  console.log("checking indicator:", await page.locator("text=Checking").first().isVisible().catch(() => false));
} else {
  console.log("no button; page text:", await page.evaluate(() => document.body.innerText.slice(0,400)).catch(e => "eval fail"));
}
console.log("page alive at end:", await page.evaluate(() => 1).then(() => true).catch(() => false));
console.log("--- events ---"); for (const e of events) console.log(" ", e.slice(0,220));
await browser.close();
