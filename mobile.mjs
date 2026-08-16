import { chromium } from "playwright";
const exe = "/sessions/sharp-great-shannon/.cache/ms-playwright/chromium_headless_shell-1234/chrome-linux/headless_shell";
const b = await chromium.launch({ args: ["--no-sandbox"], executablePath: exe });
const page = await b.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
await page.goto("https://voteunbiased.org/live", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
await page.locator("text=Delivers Remarks").first().click().catch(()=>{});
await page.waitForTimeout(4000);
const m = await page.evaluate(() => {
  const cards = [...document.querySelectorAll("article")];
  const vh = window.innerHeight;
  const vis = cards.filter(c => { const r = c.getBoundingClientRect(); return r.top < vh && r.bottom > 0 && r.height > 20; });
  const full = cards.filter(c => { const r = c.getBoundingClientRect(); return r.top >= 0 && r.bottom <= vh; });
  const feed = cards[0] ? cards[0].parentElement : null;
  return { vh, cards: cards.length, partly: vis.length, fully: full.length,
    cardH: cards[0] ? Math.round(cards[0].getBoundingClientRect().height) : null,
    feedH: feed ? Math.round(feed.getBoundingClientRect().height) : null,
    has25vh: !!document.querySelector("[style*=\"25vh\"]") };
});
console.log(JSON.stringify(m));
await b.close();
