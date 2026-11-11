// Bonus money tour on a fresh sandbox account: Cage test bonus, Cash + Bonus in the top bar,
// lobby Bonus to Cash filter, then real Bounty Bars spins funded by Bonus until a win pays cash.
// Every spin is a real server spin; nothing is staged.
//   BASE=https://pit-iota-puce.vercel.app OUT=/workspace/pit-shots node tests/e2e/bonus-money.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit-shots";
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
const email = `bonus${Date.now()}@pit.test`, pass = "sandbox-pass-1";
const click = async (xp, t = 20000) => { const h = await p.waitForSelector(`xpath/${xp}`, { timeout: t }); await h.evaluate((e) => e.scrollIntoView({ block: "center" })); await W(200); await h.click(); };
const me = () => p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user ?? null);
const log = [];
const vp = async (w) => p.setViewport(w === 390 ? { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { width: 1366, height: 900, deviceScaleFactor: 1 });
const tips = async () => { for (const t of ["Got it", "Dismiss", "OK"]) await click(`.//button[normalize-space(.)="${t}"]`, 600).catch(() => {}); };
const overflow = () => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

await vp(1366);
await p.goto(BASE + "/", { waitUntil: "networkidle2" });
await click('.//button[contains(@class,"home-enter")]'); await W(900);
await p.goto(BASE + "/signup", { waitUntil: "networkidle2" });
await p.type("#su-name", "Bonus"); await p.type("#su-email", email); await p.type("#su-pass", pass);
await p.$eval("input[type=checkbox]", (e) => { if (!e.checked) e.click(); });
await click('.//button[contains(., "Create account")]'); await W(2500);
await click('.//button[contains(., "welcome chips")]', 4000).catch(() => {}); await W(1500);
await click('.//button[contains(., "Skip tour")]', 3000).catch(() => {});
let u = await me();
log.push(`account ${email} cash ${u?.balanceCents} bonus ${u?.bonusCents}`);

// Cage: add the $5 sandbox test bonus
await p.goto(BASE + "/wallet", { waitUntil: "networkidle2" }); await W(1200); await tips();
await click('.//button[contains(., "Add $5 bonus")]'); await W(2000);
u = await me();
log.push(`after test bonus: cash ${u.balanceCents} bonus ${u.bonusCents}`);
if (u.bonusCents !== 500) log.push("FAIL bonus not 500");
for (const w of [390, 1366]) {
  await vp(w);
  await p.goto(BASE + "/wallet", { waitUntil: "networkidle2" }); await W(1200); await tips();
  await p.evaluate(() => window.scrollTo(0, 0)); await W(300);
  const top = await p.$eval("[data-testid=top-bonus]", (e) => e.textContent).catch(() => "missing");
  const cage = await p.$eval("[data-testid=cage-bonus]", (e) => e.textContent).catch(() => "missing");
  log.push(`cage ${w}: top bar "${top}" cage "${cage}" overflow=${await overflow()}`);
  await p.screenshot({ path: `${OUT}/bonus-cage-${w}.png`, fullPage: false });
  await p.goto(BASE + "/floor#bonus", { waitUntil: "networkidle2" }); await W(1500); await tips();
  const filtered = await p.$$eval(".st-grid .st-card .gname", (es) => es.map((e) => e.textContent));
  log.push(`lobby ${w} Bonus to Cash filter shows: ${JSON.stringify(filtered)}`);
  const grid = await p.$("#games");
  await grid.evaluate((e) => e.scrollIntoView({ block: "start" })); await W(500);
  await p.screenshot({ path: `${OUT}/bonus-lobby-${w}.png` });
}

// Bounty Bars: coin down to 25¢, spin with bonus until a bonus-funded win pays cash
for (const w of [1366, 390]) {
  await vp(w);
  await p.goto(BASE + "/bounty", { waitUntil: "networkidle2" }); await W(1500); await tips();
  if (w === 1366) { await p.$eval('[aria-label="Coin value down"]', (e) => e.click()); await W(200); }
  let got = null;
  for (let i = 0; i < 24 && !got; i++) {
    const before = await me();
    if (before.bonusCents <= 0) break;
    const res = p.waitForResponse((r) => r.url().includes("/api/games/bounty") && r.request().method() === "POST", { timeout: 20000 });
    await p.$eval("[data-cab-spin]", (e) => e.click());
    const body = await (await res).json();
    await p.waitForFunction(() => !document.querySelector(".bb-reel.moving"), { timeout: 20000 }); await W(900);
    const after = await me();
    const line = `spin ${i + 1}: bet ${body.spin.betCents} funded cash ${body.funded.cashCents}/bonus ${body.funded.bonusCents} win ${body.spin.winCents} paid ${JSON.stringify(body.paid)} | cash ${before.balanceCents}->${after.balanceCents} bonus ${before.bonusCents}->${after.bonusCents}`;
    log.push(`bounty ${w} ${line}`);
    if (body.paid && body.paid.convertedCents > 0) {
      const ok = after.balanceCents === before.balanceCents - body.funded.cashCents + body.paid.cashCents && after.bonusCents === before.bonusCents - body.funded.bonusCents;
      log.push(`bounty ${w} BONUS-TO-CASH WIN: ${body.paid.convertedCents}c of bonus play paid as cash; ledger check ${ok ? "OK" : "MISMATCH"}`);
      got = body;
    }
  }
  const cab = await p.$(".slot-cabinet");
  await cab.evaluate((e) => e.scrollIntoView({ block: "start" })); await W(400);
  await p.screenshot({ path: `${OUT}/bonus-bounty-${w}.png` });
  const split = await p.$eval(".wallet-split", (e) => e.innerText).catch(() => "missing");
  log.push(`bounty ${w} wallet strip: ${split.replace(/\n/g, " | ")} overflow=${await overflow()}`);
  await p.$eval(".wallet-split", (e) => e.scrollIntoView({ block: "center" })).catch(() => {}); await W(300);
  await p.screenshot({ path: `${OUT}/bonus-bounty-strip-${w}.png` });
  if (!got) log.push(`bounty ${w}: no bonus-funded win in this run (bonus ran out); see spin log`);
  if (w === 1366) { await p.goto(BASE + "/wallet", { waitUntil: "networkidle2" }); await click('.//button[contains(., "Add $5 bonus")]').catch(() => {}); }
}
await p.goto(BASE + "/wallet?x=1#ledger", { waitUntil: "networkidle2" }); await W(1500);
await vp(390);
await click('.//button[normalize-space(.)="History"]').catch(() => {}); await W(1200);
await p.screenshot({ path: `${OUT}/bonus-history-390.png`, fullPage: false });
log.push(`page errors: ${errors.length ? errors.join(" | ") : "none"}`);
console.log(log.join("\n"));
await b.close();
