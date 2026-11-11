// Canary Creek Mine tour on a fresh sandbox account: story card, base game, then real server spins
// until free spins and the Mine Cart pick both trigger naturally. Nothing is staged or forced;
// each spin's ledger movement is checked against the server result.
//   BASE=https://pit-iota-puce.vercel.app OUT=/workspace/pit-shots node tests/e2e/story1-mine.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit-shots";
const MAX = Number(process.env.MAX_SPINS || 700);
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
const email = `mine${Date.now()}@pit.test`, pass = "sandbox-pass-1";
const click = async (xp, t = 20000) => { const h = await p.waitForSelector(`xpath/${xp}`, { timeout: t }); await h.evaluate((e) => e.scrollIntoView({ block: "center" })); await W(150); await h.click(); };
const me = () => p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user ?? null);
const log = [];
const vp = async (w) => p.setViewport(w === 390 ? { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { width: 1366, height: 900, deviceScaleFactor: 1 });
const shot = async (name) => { await p.screenshot({ path: `${OUT}/story1-${name}.png` }); log.push(`shot story1-${name}.png`); };
const toCab = async () => { const c = await p.$(".mine-stage"); await c.evaluate((e) => { e.scrollIntoView({ block: "start" }); window.scrollBy(0, -78); }); await W(300); };
const overflow = () => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const settled = (t = 30000) => p.waitForFunction(() => !document.querySelector(".slot-cabinet.is-spinning") && !document.querySelector(".mine-trigger") && !document.querySelector(".mine-modal") && !document.querySelector(".mine-fs-bar"), { timeout: t });

await vp(390);
await p.goto(BASE + "/", { waitUntil: "networkidle2" });
await click('.//button[contains(@class,"home-enter")]'); await W(900);
await p.goto(BASE + "/signup", { waitUntil: "networkidle2" });
await p.type("#su-name", "Prospector"); await p.type("#su-email", email); await p.type("#su-pass", pass);
await p.$eval("input[type=checkbox]", (e) => { if (!e.checked) e.click(); });
await click('.//button[contains(., "Create account")]'); await W(2500);
await click('.//button[contains(., "welcome chips")]', 4000).catch(() => {}); await W(1200);
await click('.//button[contains(., "Skip tour")]', 3000).catch(() => {});
await p.evaluate(async () => fetch("/api/wallet/deposit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amountCents: 100000 }) }));
let u = await me();
log.push(`account ${email} balance ${u?.balanceCents}`);

// 1. Story card on first open
await p.goto(BASE + "/mine", { waitUntil: "networkidle2" });
await p.waitForSelector(".mine-story", { timeout: 15000 }); await W(500);
await shot("intro-390");
await click('.//button[contains(., "Head into the mine")]'); await W(400);
await click('.//button[normalize-space(.)="Got it"]', 2500).catch(() => {});
await p.reload({ waitUntil: "networkidle2" }); await W(800);
log.push(`story card after reload (should be gone): ${!!(await p.$(".mine-story"))}`);
await click('.//button[contains(., "Clem") and contains(., "story")]'); await W(300);
log.push(`story reopened: ${!!(await p.$(".mine-story"))}`);
await click('.//button[contains(., "Head into the mine")]'); await W(300);
await p.$eval(".rl-toggle input", (e) => { if (!e.checked) e.click(); });

let gotFs = false, gotPick = false, spins = 0, mismatches = 0, baseShot = false;
let bal = (await me()).balanceCents;
while ((!gotFs || !gotPick) && spins < MAX) {
  spins++;
  const res = p.waitForResponse((r) => r.url().includes("/api/games/mine") && r.request().method() === "POST", { timeout: 30000 });
  await p.$eval("[data-cab-spin]", (e) => e.click());
  const body = await (await res).json();
  const s = body.spin;
  if (!s) { log.push(`spin ${spins} error ${JSON.stringify(body).slice(0, 200)}`); break; }
  if (body.balanceCents !== bal - s.betCents + s.winCents) { mismatches++; log.push(`LEDGER MISMATCH spin ${spins}`); }
  bal = body.balanceCents;
  if (spins % 50 === 0) console.error(`… ${spins} spins, balance ${bal}`);
  if (s.freeSpins && !gotFs) {
    gotFs = true;
    log.push(`spin ${spins}: FREE SPINS trigger, ${s.scatters} dynamite, initial ${s.freeSpins.initial}, played ${s.freeSpins.spins.length}, fs win ${s.freeSpins.totalWinCents}, total ${s.winCents} on ${s.betCents}`);
    await p.waitForSelector(".mine-trigger", { timeout: 20000 }); await toCab(); await W(700);
    await shot("fs-trigger-390");
    await p.waitForSelector(".mine-fs-bar", { timeout: 20000 });
    await p.waitForFunction(() => /Spin\s*[3-9]/.test(document.querySelector(".mine-fs-bar")?.textContent || "") || !!document.querySelector(".mine-summary"), { timeout: 60000 });
    await p.waitForFunction(() => !document.querySelector(".slot-cabinet.is-spinning") || !!document.querySelector(".mine-summary"), { timeout: 20000 }); await W(250);
    if (!(await p.$(".mine-summary"))) { await toCab(); await shot("fs-progress-390"); }
    await p.waitForSelector(".mine-summary", { timeout: 180000 }); await W(400);
    log.push(`fs summary: ${(await p.$eval(".mine-summary", (e) => e.innerText)).replace(/\s+/g, " ")}`);
    await shot("fs-results-390");
    await click('.//button[contains(., "Back to the reels")]');
  } else if (s.pick && !gotPick) {
    gotPick = true;
    log.push(`spin ${spins}: MINE CART trigger, reveals ${s.pick.reveals.map((r) => (r.kind === "prize" ? r.x + "x" : "C")).join(",")}, ${s.pick.totalX}x = ${s.pick.totalWinCents}, total ${s.winCents} on ${s.betCents}`);
    await p.waitForSelector(".mine-trigger", { timeout: 20000 }); await toCab(); await W(700);
    await shot("pick-trigger-390");
    await p.waitForSelector(".mine-pick", { timeout: 20000 }); await W(400);
    await shot("pick-390");
    const order = [5, 2, 9, 0, 11, 7, 3, 10, 1, 6, 8, 4];
    for (let k = 0; k < order.length; k++) {
      const done = await p.$(".mine-pick .btn.primary");
      if (done) break;
      await p.$eval(`.mine-carts button:nth-child(${order[k] + 1})`, (e) => e.click()); await W(350);
      if (k === 1) await shot("pick-progress-390");
    }
    await W(400);
    const total = await p.$eval(".mine-pick-total b", (e) => e.textContent);
    log.push(`pick board total ${total}`);
    await shot("pick-results-390");
    await click('.//button[contains(., "Collect")]'); await W(500);
    await shot("results-390");
    await click('.//button[contains(., "Back to the reels")]');
  } else if (s.freeSpins || s.pick) {
    await click('.//button[contains(., "Reveal the rest")]', 30000).catch(() => {});
    await click('.//button[contains(., "Collect")]', 5000).catch(() => {});
    await click('.//button[contains(., "Skip to total")]', 30000).catch(() => {});
    await click('.//button[contains(., "Back to the reels")]', 120000);
  }
  await settled(60000);
  if (!baseShot && s.winCents > 0 && !s.freeSpins && !s.pick) { baseShot = true; await toCab(); await shot("base-390"); }
}
log.push(`spins ${spins} free spins seen ${gotFs} pick seen ${gotPick} ledger mismatches ${mismatches} overflow390 ${await overflow()}`);

await vp(1366);
await p.goto(BASE + "/mine", { waitUntil: "networkidle2" }); await W(800);
await p.$eval("[data-cab-spin]", (e) => e.click()); await settled(30000); await W(600);
await p.evaluate(() => window.scrollTo(0, 0)); await W(300);
await shot("base-1366");
log.push(`overflow1366 ${await overflow()}`);
await p.goto(BASE + "/floor", { waitUntil: "networkidle2" }); await W(1200);
const tile = await p.$('a.st-card[href="/mine"]');
log.push(`lobby tile: ${tile ? (await tile.evaluate((e) => e.innerText)).replace(/\s+/g, " ") : "MISSING"}`);
if (tile) { await tile.evaluate((e) => e.scrollIntoView({ block: "center" })); await W(400); await shot("lobby-1366"); }
await p.goto(BASE + "/rules#mine", { waitUntil: "networkidle2" }); await W(600);
log.push(`rules: ${(await p.$eval("#mine + p", (e) => e.textContent)).slice(0, 120)}…`);
const fin = await me();
log.push(`final balance ${fin.balanceCents} (server ledger; last spin response ${bal}); page errors ${errors.length} ${errors.slice(0, 3).join(" | ")}`);
console.log(log.join("\n"));
await b.close();
