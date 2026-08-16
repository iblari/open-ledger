import { chromium } from "playwright";
const exe = "/sessions/sharp-great-shannon/.cache/ms-playwright/chromium_headless_shell-1234/chrome-linux/headless_shell";
const b = await chromium.launch({ args: ["--no-sandbox"], executablePath: exe });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const api = [];
page.on("response", async r => {
  if (r.url().includes("/api/live-fact-check")) {
    try { const j = await r.json(); api.push({ n: j.claims?.length ?? 0, skipped: j.skipped || null }); } catch {}
  }
});
await page.goto("https://voteunbiased.org/live", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);
await page.locator("text=Delivers Remarks").first().click();
await page.waitForTimeout(3500);
for (let i = 1; i <= 3; i++) {
  await page.locator("text=Check this moment").first().click().catch(()=>{});
  await page.waitForTimeout(9000);
  console.log(`press ${i}: api=${JSON.stringify(api[api.length-1] ?? null)}`);
}
await b.close();
