// Thunderhoof Prairie tour on a fresh sandbox account (@pit.test, hidden from boards): story card, base game,
// then real server spins until free spins and Hold & Spin both trigger naturally at 390, and one more
// feature at 1366. Nothing is staged or forced; each spin's ledger movement is checked against the result.
//   BASE=https://pit-iota-puce.vercel.app OUT=/workspace/pit-shots node tests/e2e/story2-prairie.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit-shots";
const MAX = Number(process.env.MAX_SPINS || 800);
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
const email = `prairie${Date.now()}@pit.test`, pass = "sandbox-pass-1";
const click = async (xp, t = 20000) => { const h = await p.waitForSelector(`xpath/${xp}`, { timeout: t }); await h.evaluate((e) => e.scrollIntoView({ block: "center" })); await W(150); await h.click(); };
const me = () => p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user ?? null);
const log = [];
let width = 390;
const vp = async (w) => { width = w; await p.setViewport(w === 390 ? { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { width: 1366, height: 900, deviceScaleFactor: 1 }); };
const shot = async (name) => { await p.screenshot({ path: `${OUT}/story2-${name}-${width}.png` }); log.push(`shot story2-${name}-${width}.png`); };
const toCab = async () => { const c = await p.$(".pr-stage"); await c.evaluate((e) => { e.scrollIntoView({ block: "start" }); window.scrollBy(0, -78); }); await W(300); };
const overflow = () => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const settled = (t = 30000) => p.waitForFunction(() => !document.querySelector(".slot-cabinet.is-spinning") && !document.querySelector(".mine-trigger") && !document.querySelector(".mine-modal") && !document.querySelector(".mine-fs-bar"), { timeout: t });

async function playFree(s, n, record) {
  log.push(`[${width}] spin ${n}: FREE SPINS trigger, ${s.scatters} storms, initial ${s.freeSpins.initial}, played ${s.freeSpins.spins.length}, retriggers ${s.freeSpins.spins.filter((x) => x.retrigger).length}, max wild mult ${Math.max(1, ...s.freeSpins.spins.flatMap((x) => x.wins.map((w) => w.mult)))}x, fs win ${s.freeSpins.totalWinCents}, total ${s.winCents} on ${s.betCents}`);
  await p.waitForSelector(".pr-trigger-fs", { timeout: 60000 }); await toCab(); await W(700);
  if (record) await shot("fs-trigger");
  await p.waitForSelector(".pr-fs-bar:not(.pr-hold-bar)", { timeout: 20000 });
  if (record) {
    // wait for a settled free spin that shows a multiplied wild if one comes, else spin 3
    const multIdx = s.freeSpins.spins.findIndex((x) => x.wins.some((w) => w.mult > 1));
    const target = multIdx >= 0 && multIdx < 12 ? multIdx + 1 : Math.min(3, s.freeSpins.spins.length);
    await p.waitForFunction((t) => new RegExp(`Spin\\s*${t}\\s*of`).test(document.querySelector(".pr-fs-bar")?.textContent || "") || !!document.querySelector(".mine-summary"), { timeout: 120000 }, target);
    await p.waitForFunction(() => !document.querySelector(".slot-cabinet.is-spinning") || !!document.querySelector(".mine-summary"), { timeout: 20000 }); await W(300);
    if (!(await p.$(".mine-summary"))) { await toCab(); await shot("fs-progress"); log.push(`fs progress shot at free spin ${target}${multIdx >= 0 ? ` (multiplied way ${Math.max(...s.freeSpins.spins[multIdx].wins.map((w) => w.mult))}x)` : ""}`); }
  } else await click('.//button[contains(., "Skip to total")]', 30000).catch(() => {});
  await p.waitForSelector(".mine-summary", { timeout: 300000 }); await W(400);
  log.push(`fs summary: ${(await p.$eval(".mine-summary", (e) => e.innerText)).replace(/\s+/g, " ")}`);
  if (record) await shot("fs-results");
  await click('.//button[contains(., "Back to the reels")]');
}

async function playHold(s, n, record) {
  const h = s.hold;
  log.push(`[${width}] spin ${n}: HOLD & SPIN trigger, ${h.start.length} coins [${h.start.map((c) => c.x).join(",")}], ${h.respins.length} respins, ${h.board.filter((v) => v != null).length} coins final${h.full ? " FULL" : ""}, ${h.totalX}x = ${h.totalWinCents}, total ${s.winCents} on ${s.betCents}`);
  await p.waitForSelector(".pr-trigger-hold", { timeout: 60000 }); await toCab(); await W(700);
  if (record) await shot("hold-trigger");
  await p.waitForSelector(".pr-hold", { timeout: 20000 });
  if (record) {
    const firstNew = h.respins.findIndex((r) => r.landed.length > 0);
    if (firstNew >= 0) await p.waitForSelector(".pr-hold-cell.fresh", { timeout: 20000 }).catch(() => {});
    else await W(1200);
    await toCab(); await W(200); await shot("hold-progress");
    log.push(`hold meter mid-round: ${(await p.$eval(".pr-hold-meter", (e) => e.innerText)).replace(/\s+/g, " ")}`);
  } else await click('.//button[contains(., "Skip to total")]', 10000).catch(() => {});
  await p.waitForSelector(".pr-hold-done", { timeout: 60000 }); await W(500); await toCab();
  log.push(`hold result: ${(await p.$eval(".pr-hold-done", (e) => e.innerText)).replace(/\s+/g, " ")} | board meter ${(await p.$eval(".pr-hold-meter", (e) => e.innerText)).replace(/\s+/g, " ")}`);
  if (record) await shot("hold-results");
  await click('.//button[contains(., "Collect") or contains(., "On to free spins")]');
  if (s.freeSpins) { await playFree(s, n, false); return; }
  await p.waitForSelector(".mine-summary", { timeout: 20000 }); await W(300);
  if (record) await shot("results");
  await click('.//button[contains(., "Back to the reels")]');
}

let bal = 0, mismatches = 0;
async function spinOnce(n) {
  const res = p.waitForResponse((r) => r.url().includes("/api/games/prairie") && r.request().method() === "POST", { timeout: 30000 });
  await p.$eval("[data-cab-spin]", (e) => e.click());
  const body = await (await res).json();
  const s = body.spin;
  if (!s) throw new Error(`spin ${n} error ${JSON.stringify(body).slice(0, 200)}`);
  if (body.balanceCents !== bal - s.betCents + s.winCents) { mismatches++; log.push(`LEDGER MISMATCH spin ${n}`); }
  bal = body.balanceCents;
  if (n % 50 === 0) console.error(`… [${width}] ${n} spins, balance ${bal}`);
  return s;
}

await vp(390);
await p.goto(BASE + "/", { waitUntil: "networkidle2" });
await click('.//button[contains(@class,"home-enter")]'); await W(900);
await p.goto(BASE + "/signup", { waitUntil: "networkidle2" });
await p.type("#su-name", "Ranch Hand"); await p.type("#su-email", email); await p.type("#su-pass", pass);
await p.$eval("input[type=checkbox]", (e) => { if (!e.checked) e.click(); });
await click('.//button[contains(., "Create account")]'); await W(2500);
await click('.//button[contains(., "welcome chips")]', 4000).catch(() => {}); await W(1200);
await click('.//button[contains(., "Skip tour")]', 3000).catch(() => {});
await p.evaluate(async () => fetch("/api/wallet/deposit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amountCents: 100000 }) }));
let u = await me();
log.push(`account ${email} balance ${u?.balanceCents}`);

await p.goto(BASE + "/prairie", { waitUntil: "networkidle2" });
await p.waitForSelector(".pr-story", { timeout: 15000 }); await W(500);
await shot("intro");
await click('.//button[contains(., "Ride out")]'); await W(400);
await click('.//button[normalize-space(.)="Got it"]', 2500).catch(() => {});
await p.reload({ waitUntil: "networkidle2" }); await W(800);
log.push(`story card after reload (should be gone): ${!!(await p.$(".pr-story"))}`);
await click('.//button[contains(., "Ada") and contains(., "story")]'); await W(300);
log.push(`story reopened: ${!!(await p.$(".pr-story"))}`);
await click('.//button[contains(., "Ride out")]'); await W(300);
await p.$eval(".rl-toggle input", (e) => { if (!e.checked) e.click(); });

let gotFs = false, gotHold = false, spins = 0, baseShot = false, coinShot = false;
bal = (await me()).balanceCents;
while ((!gotFs || !gotHold) && spins < MAX) {
  spins++;
  const s = await spinOnce(spins);
  if (s.freeSpins && !s.hold) { await playFree(s, spins, !gotFs); gotFs = true; }
  else if (s.hold) { await playHold(s, spins, !gotHold); gotHold = true; if (s.freeSpins) gotFs = true; }
  await settled(120000);
  if (!baseShot && s.winCents > 0 && !s.freeSpins && !s.hold && s.wins.some((w) => w.ways > 1)) { baseShot = true; await toCab(); await shot("base"); log.push(`base shot: ${s.wins.map((w) => `${w.symbol} ${w.reels} reels x${w.ways} ways`).join("; ")} = ${s.winCents}`); }
  if (!coinShot && !s.hold && s.coins.flat().filter((x) => x != null).length >= 4) { coinShot = true; await toCab(); await shot("coins"); }
}
log.push(`[390] spins ${spins} free spins seen ${gotFs} hold seen ${gotHold} ledger mismatches ${mismatches} overflow390 ${await overflow()}`);

await vp(1366);
await p.goto(BASE + "/prairie", { waitUntil: "networkidle2" }); await W(800);
let s2 = 0, feat = false;
while (!feat && s2 < MAX) {
  s2++;
  const s = await spinOnce(s2);
  if (s2 === 1) { await settled(30000).catch(() => {}); await W(500); await p.evaluate(() => window.scrollTo(0, 0)); await W(300); await shot("base"); }
  if (s.hold) { feat = true; await playHold(s, s2, true); }
  else if (s.freeSpins) { feat = true; await playFree(s, s2, true); }
  await settled(120000);
}
log.push(`[1366] spins ${s2} feature seen ${feat} ledger mismatches ${mismatches} overflow1366 ${await overflow()}`);
await p.goto(BASE + "/stories", { waitUntil: "networkidle2" }); await W(1000);
await shot("hub");
await p.goto(BASE + "/floor", { waitUntil: "networkidle2" }); await W(1200);
const tile = await p.$('a.st-card[href="/prairie"]');
log.push(`lobby tile: ${tile ? (await tile.evaluate((e) => e.innerText)).replace(/\s+/g, " ") : "MISSING"}`);
if (tile) { await tile.evaluate((e) => e.scrollIntoView({ block: "center" })); await W(400); await shot("lobby"); }
const rail = await p.$('nav.st-rail-nav a[href="/stories"]');
log.push(`sidebar Story Slots link: ${!!rail}`);
await p.goto(BASE + "/rules#prairie", { waitUntil: "networkidle2" }); await W(600);
log.push(`rules: ${(await p.$eval("#prairie + p", (e) => e.textContent)).slice(0, 120)}…`);
await p.goto(BASE + "/activity", { waitUntil: "networkidle2" }); await W(1500);
log.push(`history mentions Thunderhoof Prairie: ${(await p.evaluate(() => document.body.innerText)).includes("Thunderhoof Prairie")}`);
await shot("history");
const fin = await me();
log.push(`final balance ${fin.balanceCents} (server ledger; last spin response ${bal}); page errors ${errors.length} ${errors.slice(0, 3).join(" | ")}`);
console.log(log.join("\n"));
await b.close();
