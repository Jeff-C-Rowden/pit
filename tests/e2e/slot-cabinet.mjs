// Live screenshots of both slot cabinets at 390px and 1366px: idle, mid-spin, settled.
// Fresh account each run. Never fakes a result: it just spins and records what the server dealt.
//   BASE=https://pit-iota-puce.vercel.app OUT=/workspace/pit-shots PREFIX=cab node tests/e2e/slot-cabinet.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit-shots";
const PREFIX = process.env.PREFIX || "cab";
const SPINS = Number(process.env.SPINS || 6);
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
const email = `cab${Date.now()}@pit.test`, pass = "sandbox-pass-1";
const click = async (xp, t = 20000) => { const h = await p.waitForSelector(`xpath/${xp}`, { timeout: t }); await h.evaluate((e) => e.scrollIntoView({ block: "center" })); await W(200); await h.click(); };
const bal = () => p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user?.balanceCents ?? null);
const log = [];
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await p.goto(BASE + "/", { waitUntil: "networkidle2" });
await click('.//button[contains(., "I am 21 or older")]'); await W(800);
await p.goto(BASE + "/signup", { waitUntil: "networkidle2" });
await p.type("#su-name", "Cab"); await p.type("#su-email", email); await p.type("#su-pass", pass);
await p.$eval("input[type=checkbox]", (e) => { if (!e.checked) e.click(); });
await click('.//button[contains(., "Create account")]'); await W(2500);
await click('.//button[contains(., "welcome chips")]').catch(() => {}); await W(1500);
await click('.//button[contains(., "Skip tour")]', 3000).catch(() => {});
log.push(`account ${email} balance ${await bal()}`);

async function shoot(game, width, height, mobile) {
  await p.setViewport({ width, height, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  await p.goto(`${BASE}/${game}`, { waitUntil: "networkidle2" }); await W(1500);
  // dismiss first-visit tips if present
  for (const t of ["Got it", "Dismiss", "OK"]) await click(`.//button[normalize-space(.)="${t}"]`, 800).catch(() => {});
  const cab = await p.$(".slot-cabinet");
  await cab.evaluate((e) => e.scrollIntoView({ block: "start" })); await p.evaluate(() => window.scrollBy(0, -70)); await W(400);
  const tag = `${PREFIX}-${game === "slot" ? "sundown" : "ridge"}-${width}`;
  await p.screenshot({ path: `${OUT}/${tag}-idle.png` });
  let won = false;
  for (let i = 0; i < SPINS; i++) {
    const before = await bal();
    const spinSel = await p.$('[data-cab-spin]') ? '[data-cab-spin]' : 'button.hero-act';
    await p.$eval(spinSel, (e) => e.click());
    await W(650);
    if (i === 0) {
      await cab.evaluate((e) => e.scrollIntoView({ block: "start" })); await p.evaluate(() => window.scrollBy(0, -70));
      await p.screenshot({ path: `${OUT}/${tag}-midspin.png` });
    }
    await p.waitForFunction(() => !document.querySelector(".reel.is-spinning"), { timeout: 20000 }); await W(900);
    const after = await bal();
    const glow = await cab.evaluate((e) => e.getAttribute("data-glow"));
    log.push(`${tag} spin ${i + 1}: ${before} -> ${after} glow=${glow}`);
    if (i === 0) {
      await cab.evaluate((e) => e.scrollIntoView({ block: "start" })); await p.evaluate(() => window.scrollBy(0, -70));
      await p.screenshot({ path: `${OUT}/${tag}-settled.png` });
    }
    if (!won && glow && glow !== "0") {
      won = true;
      await cab.evaluate((e) => e.scrollIntoView({ block: "start" })); await p.evaluate(() => window.scrollBy(0, -70));
      await p.screenshot({ path: `${OUT}/${tag}-win.png` });
    }
  }
  await p.screenshot({ path: `${OUT}/${tag}-full.png`, fullPage: true });
}
for (const game of ["slot", "vault"]) {
  await shoot(game, 390, 844, true);
  await shoot(game, 1366, 900, false);
}
console.log(log.join("\n"));
await b.close();
