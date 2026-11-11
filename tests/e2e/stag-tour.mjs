// Stag restyle tour: fresh account, then 390px + 1366px shots of the age gate, lobby, Cage,
// all three slots (Buckshot Bars idle + after a real spin), roulette and blackjack.
// Never fakes a result: spins are real server spins on a fresh sandbox account.
//   BASE=https://pit-iota-puce.vercel.app OUT=/workspace/pit-shots node tests/e2e/stag-tour.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit-shots";
const PREFIX = process.env.PREFIX || "stag";
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
const email = `stag${Date.now()}@pit.test`, pass = "sandbox-pass-1";
const click = async (xp, t = 20000) => { const h = await p.waitForSelector(`xpath/${xp}`, { timeout: t }); await h.evaluate((e) => e.scrollIntoView({ block: "center" })); await W(200); await h.click(); };
const me = () => p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user ?? null);
const log = [];
const vp = async (w) => p.setViewport(w === 390 ? { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { width: 1366, height: 900, deviceScaleFactor: 1 });
const tips = async () => { for (const t of ["Got it", "Dismiss", "OK"]) await click(`.//button[normalize-space(.)="${t}"]`, 600).catch(() => {}); };
const overflow = () => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

// age gate (both widths, before entering)
for (const w of [390, 1366]) {
  await vp(w);
  await p.goto(BASE + "/", { waitUntil: "networkidle2" }); await W(600);
  await p.screenshot({ path: `${OUT}/${PREFIX}-gate-${w}.png` });
  log.push(`gate ${w} overflow=${await overflow()}`);
}
await click('.//button[contains(@class,"home-enter")]'); await W(900);
await p.goto(BASE + "/signup", { waitUntil: "networkidle2" });
await p.type("#su-name", "Stag"); await p.type("#su-email", email); await p.type("#su-pass", pass);
await p.$eval("input[type=checkbox]", (e) => { if (!e.checked) e.click(); });
await click('.//button[contains(., "Create account")]'); await W(2500);
await click('.//button[contains(., "welcome chips")]').catch(() => {}); await W(1500);
await click('.//button[contains(., "Skip tour")]', 3000).catch(() => {});
let u = await me();
log.push(`account ${email} balance ${u?.balanceCents}`);

async function page(path, name, w, full = false) {
  await vp(w);
  await p.goto(BASE + path, { waitUntil: "networkidle2" }); await W(1400); await tips();
  await p.evaluate(() => window.scrollTo(0, 0)); await W(300);
  await p.screenshot({ path: `${OUT}/${PREFIX}-${name}-${w}.png`, fullPage: full });
  log.push(`${name} ${w} overflow=${await overflow()}`);
}

for (const w of [390, 1366]) {
  await page("/floor", "lobby", w, true);
  await page("/wallet", "cage", w, true);
  for (const [path, name] of [["/slot", "sundown"], ["/vault", "ridge"]]) {
    await vp(w);
    await p.goto(BASE + path, { waitUntil: "networkidle2" }); await W(1500); await tips();
    const cab = await p.$(".slot-cabinet");
    await cab.evaluate((e) => e.scrollIntoView({ block: "start" })); await p.evaluate(() => window.scrollBy(0, -60)); await W(400);
    await p.screenshot({ path: `${OUT}/${PREFIX}-${name}-${w}.png` });
    log.push(`${name} ${w} overflow=${await overflow()}`);
  }
  // Buckshot Bars: idle, then one real spin
  await vp(w);
  await p.goto(BASE + "/buckshot", { waitUntil: "networkidle2" }); await W(1500); await tips();
  const cab = await p.$(".slot-cabinet");
  await cab.evaluate((e) => e.scrollIntoView({ block: "start" })); await p.evaluate(() => window.scrollBy(0, -60)); await W(400);
  await p.screenshot({ path: `${OUT}/${PREFIX}-buckshot-idle-${w}.png` });
  const before = (await me()).balanceCents;
  const res = p.waitForResponse((r) => r.url().includes("/api/games/buckshot") && r.request().method() === "POST", { timeout: 20000 });
  await p.$eval("[data-cab-spin]", (e) => e.click());
  const body = await (await res).json();
  await p.waitForFunction(() => !document.querySelector(".bb-reel.moving"), { timeout: 20000 }); await W(1000);
  const after = (await me()).balanceCents;
  const shownLine = await p.$$eval(".bb-reel", (rs) => rs.map((r) => r.querySelectorAll(".bb-cell")[1]?.getAttribute("aria-label")));
  log.push(`buckshot ${w} spin: bet ${body.spin?.betCents} line ${JSON.stringify(body.spin?.line)} shown ${JSON.stringify(shownLine)} win ${body.spin?.winCents} balance ${before} -> ${after} (expected ${before - body.spin?.betCents + body.spin?.winCents})`);
  await cab.evaluate((e) => e.scrollIntoView({ block: "start" })); await p.evaluate(() => window.scrollBy(0, -60)); await W(300);
  await p.screenshot({ path: `${OUT}/${PREFIX}-buckshot-spin-${w}.png` });
  log.push(`buckshot ${w} overflow=${await overflow()}`);
  await page("/roulette", "roulette", w);
  await page("/blackjack", "blackjack", w);
}
const led = await p.evaluate(async () => { const r = await fetch("/api/wallet/ledger", { cache: "no-store" }); const j = await r.json(); return r.status + " " + JSON.stringify((j.recent || []).filter((l) => l.game === "buckshot").map((l) => `${l.type}:${l.amountCents}`)); });
log.push(`buckshot ledger lines: ${led}`);
log.push(`page errors: ${errors.length ? errors.join(" | ") : "none"}`);
console.log(log.join("\n"));
await b.close();
