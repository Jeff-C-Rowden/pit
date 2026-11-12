// Kettle of Clover tour on a fresh sandbox account (@pit.test, hidden from boards): story card, base game,
// then real server spins until kettle free spins and the Rainbow Wheel both trigger naturally at 390 (the wheel's on-screen stop is checked against the server's wedge), and one more
// feature at 1366. Nothing is staged or forced; each spin's ledger movement is checked against the result.
//   BASE=https://pit-iota-puce.vercel.app OUT=/workspace/pit-shots node tests/e2e/story3-clover.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit-shots";
const MAX = Number(process.env.MAX_SPINS || 800);
process.on("unhandledRejection", (e) => { console.error("FATAL", e?.message?.slice(0, 400)); process.exit(3); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
const errors = [];
let lastStep = Date.now();
setInterval(async () => { if (Date.now() - lastStep > 90000) { console.error("WATCHDOG stalled; url", p.url()); await p.screenshot({ path: "/tmp/cl-stall.png" }).catch((e) => console.error("shot failed", e.message)); lastStep = Date.now(); } }, 15000).unref();
p.on("pageerror", (e) => errors.push(String(e)));
const email = `clover${Date.now()}@pit.test`, pass = "sandbox-pass-1";
const click = async (xp, t = 20000) => { const h = await p.waitForSelector(`xpath/${xp}`, { timeout: t }); await h.evaluate((e) => e.scrollIntoView({ block: "center" })); await W(150); await h.click(); };
const me = () => p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user ?? null);
const log = [];
const _push = log.push.bind(log);
log.push = (...a) => { console.error(...a); return _push(...a); };
let width = 390;
const vp = async (w) => { width = w; await p.setViewport(w === 390 ? { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { width: 1366, height: 900, deviceScaleFactor: 1 }); };
const shot = async (name) => { await p.screenshot({ path: `${OUT}/story3-${name}-${width}.png` }); log.push(`shot story3-${name}-${width}.png`); };
const toCab = async () => { const c = await p.$(".cl-stage"); await c.evaluate((e) => { e.scrollIntoView({ block: "start" }); window.scrollBy(0, -78); }); await W(300); };
const overflow = () => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const settled = (t = 30000) => p.waitForFunction(() => !document.querySelector(".slot-cabinet.is-spinning") && !document.querySelector(".mine-trigger") && !document.querySelector(".mine-modal") && !document.querySelector(".mine-fs-bar"), { timeout: t });


const angle = (sel) => p.$eval(sel, (e) => { const m = getComputedStyle(e).transform; if (!m || m === "none") return 0; const v = m.match(/matrix\(([^)]+)\)/)[1].split(",").map(Number); return Math.atan2(v[1], v[0]) * 180 / Math.PI; });
const wedgeAt = (rot) => Math.floor(((((-rot) % 360) + 360) % 360) / 30) % 12;
const wedgeLabel = (w) => w.kind === "credit" ? `${w.x}x` : w.kind === "fs" ? `${w.spins} FS` : "UPGRADE";
let wheelChecks = [], upgradeSeen = false;

async function playFree(s, n, record, fromWheel) {
  if (fromWheel) await p.waitForSelector(".cl-trigger-fs", { timeout: 60000 }).catch(() => {});
  const fs = s.freeSpins;
  const exp = fs.spins.map((x) => x.grid.slice(1, 4).filter((c) => c.includes("WILD")).length);
  log.push(`[${width}] spin ${n}: FREE SPINS (${fs.source}) ${fs.source === "kettle" ? `${s.scatters} kettles, ` : ""}initial ${fs.initial}, played ${fs.spins.length}, retriggers ${fs.spins.filter((x) => x.retrigger).length}, expanded reels ${exp.reduce((a, b) => a + b, 0)}, fs win ${fs.totalWinCents}, total ${s.winCents} on ${s.betCents}`);
  if (!fromWheel) { await p.waitForSelector(".cl-trigger-fs", { timeout: 60000 }); await toCab(); await W(700); if (record) await shot("fs-trigger"); }
  await p.waitForSelector(".cl-fs-bar", { timeout: 30000 });
  if (record) {
    const idx = exp.findIndex((k, i) => k > 0 && fs.spins[i].winCents > 0);
    const idx2 = idx >= 0 ? idx : exp.findIndex((k) => k > 0);
    const target = idx2 >= 0 ? idx2 + 1 : Math.min(3, fs.spins.length);
    await p.waitForFunction((t) => new RegExp(`Spin\\s*${t}\\s*of`).test(document.querySelector(".cl-fs-bar")?.textContent || "") || !!document.querySelector(".mine-summary"), { timeout: 180000 }, target);
    await p.waitForFunction(() => !document.querySelector(".slot-cabinet.is-spinning") || !!document.querySelector(".mine-summary"), { timeout: 20000 }); await W(500);
    if (!(await p.$(".mine-summary"))) {
      const overlays = await p.$$eval(".cl-expand", (a) => a.length);
      await toCab(); await shot("fs-progress"); log.push(`fs progress shot at free spin ${target}: server expanded ${exp[target - 1]} reel(s), screen shows ${overlays} WILD REEL overlay(s), spin win ${fs.spins[target - 1].winCents}`);
    }
  } else await click('.//button[contains(., "Skip to total")]', 30000).catch(() => {});
  await p.waitForSelector(".mine-summary", { timeout: 400000 }); await W(400);
  log.push(`fs summary: ${(await p.$eval(".mine-summary", (e) => e.innerText)).replace(/\s+/g, " ")}`);
  if (record) await shot("fs-results");
  await click('.//button[contains(., "Back to the reels")]');
}

async function playWheel(s, n, record) {
  const w = s.wheel;
  log.push(`[${width}] spin ${n}: RAINBOW WHEEL inner wedge ${w.inner} (${w.outer != null ? "UPGRADE" : wedgeLabel(w.result)})${w.outer != null ? `, outer wedge ${w.outer}` : ""} → ${wedgeLabel(w.result)}, credit ${w.creditWinCents}, wheel total ${w.totalWinCents}, spin total ${s.winCents} on ${s.betCents}`);
  await p.waitForSelector(".cl-trigger-wheel", { timeout: 60000 }); await toCab(); await W(600);
  if (record) await shot("wheel-trigger");
  await p.waitForSelector(".cl-wheel", { timeout: 20000 }); await W(500);
  if (record) await shot("wheel-ready");
  await click('.//button[contains(., "Spin the Rainbow Wheel")]');
  await p.waitForFunction(() => document.querySelector(".cl-wheel-inner")?.dataset.landed !== "", { timeout: 20000 }); await W(400);
  const ia = await angle(".cl-wheel-inner"), il = Number(await p.$eval(".cl-wheel-inner", (e) => e.dataset.landed));
  const okI = wedgeAt(ia) === w.inner && il === w.inner;
  wheelChecks.push(okI);
  log.push(`inner wheel on screen: computed angle ${ia.toFixed(1)}° → wedge ${wedgeAt(ia)}, data-landed ${il}, server ${w.inner} → ${okI ? "MATCH" : "MISMATCH"}; result text: ${(await p.$eval(".cl-wheel-card", (e) => e.innerText)).replace(/\s+/g, " ").slice(0, 160)}`);
  if (record) await shot("wheel-landed");
  if (w.outer != null) {
    upgradeSeen = true;
    await click('.//button[contains(., "Spin the Pot-of-Gold Wheel")]');
    await p.waitForFunction(() => document.querySelector(".cl-wheel-outer")?.dataset.landed !== "", { timeout: 20000 }); await W(400);
    const oa = await angle(".cl-wheel-outer"), ol = Number(await p.$eval(".cl-wheel-outer", (e) => e.dataset.landed));
    const okO = wedgeAt(oa) === w.outer && ol === w.outer;
    wheelChecks.push(okO);
    log.push(`outer wheel on screen: angle ${oa.toFixed(1)}° → wedge ${wedgeAt(oa)}, data-landed ${ol}, server ${w.outer} → ${okO ? "MATCH" : "MISMATCH"}`);
    await shot("wheel-outer");
  }
  await click('.//*[contains(@class,"cl-wheel-card")]//button[contains(., "Start free spins") or contains(., "Collect")]');
  if (w.freeSpins) { await playFree({ ...s, freeSpins: w.freeSpins }, n, record, true); }
  if (s.freeSpins) { await playFree(s, n, false, false); return; }
  if (w.freeSpins) return;
  await p.waitForSelector(".mine-summary", { timeout: 20000 }).catch(async (e) => {
    await p.screenshot({ path: "/tmp/cl-fail.png" });
    throw e;
  });
  await W(300);
  log.push(`wheel summary: ${(await p.$eval(".mine-summary", (e) => e.innerText)).replace(/\s+/g, " ")}`);
  if (record) await shot("wheel-results");
  await click('.//button[contains(., "Back to the reels")]');
}

let bal = 0, mismatches = 0;
async function spinOnce(n) {
  const res = p.waitForResponse((r) => r.url().includes("/api/games/clover") && r.request().method() === "POST", { timeout: 30000 });
  await p.$eval("[data-cab-spin]", (e) => e.click());
  const body = await (await res).json();
  lastStep = Date.now();
  const s = body.spin;
  if (!s) throw new Error(`spin ${n} error ${JSON.stringify(body).slice(0, 200)}`);
  if (body.balanceCents !== bal - s.betCents + s.winCents) { mismatches++; log.push(`LEDGER MISMATCH spin ${n}`); }
  bal = body.balanceCents;
  if (n % 50 === 0) console.error(`… [${width}] ${n} spins, balance ${bal}`);
  return s;
}

await vp(390);
console.error("start");
await p.goto(BASE + "/", { waitUntil: "networkidle2" });
await click('.//button[contains(@class,"home-enter")]'); await W(900);
await p.goto(BASE + "/signup", { waitUntil: "networkidle2" });
await p.type("#su-name", "Glen Walker"); await p.type("#su-email", email); await p.type("#su-pass", pass);
await p.$eval("input[type=checkbox]", (e) => { if (!e.checked) e.click(); });
await click('.//button[contains(., "Create account")]'); await W(2500);
await click('.//button[contains(., "welcome chips")]', 4000).catch(() => {}); await W(1200);
await click('.//button[contains(., "Skip tour")]', 3000).catch(() => {});
console.error("signed up");
await p.evaluate(async () => fetch("/api/wallet/deposit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amountCents: 100000 }) }));
let u = await me();
log.push(`account ${email} balance ${u?.balanceCents}`);

await p.goto(BASE + "/clover", { waitUntil: "networkidle2" });
await p.waitForSelector(".cl-story", { timeout: 15000 }); await W(500);
await shot("intro");
await click('.//button[contains(., "Cross the bridge")]'); await W(400);
await click('.//button[normalize-space(.)="Got it"]', 2500).catch(() => {});
await p.reload({ waitUntil: "networkidle2" }); await W(800);
log.push(`story card after reload (should be gone): ${!!(await p.$(".cl-story"))}`);
await click('.//button[contains(., "Orla") and contains(., "story")]'); await W(300);
log.push(`story reopened: ${!!(await p.$(".cl-story"))}`);
await click('.//button[contains(., "Cross the bridge")]'); await W(300);
await p.$eval(".rl-toggle input", (e) => { if (!e.checked) e.click(); });

let gotFs = false, gotWheel = false, spins = 0, baseShot = false;
bal = (await me()).balanceCents;
while ((!gotFs || !gotWheel) && spins < MAX) {
  spins++;
  const s = await spinOnce(spins);
  if (s.wheel) { await playWheel(s, spins, !gotWheel); gotWheel = true; }
  else if (s.freeSpins) { await playFree(s, spins, !gotFs, false); gotFs = true; }
  await settled(120000);
  if (!baseShot && s.lineWins.length >= 2 && !s.freeSpins && !s.wheel) { baseShot = true; await toCab(); await shot("base"); log.push(`base shot: ${s.lineWins.map((w) => `line ${w.line + 1} ${w.symbol} x${w.count}`).join("; ")} = ${s.winCents}`); }
}
log.push(`[390] spins ${spins} kettle free spins seen ${gotFs} wheel seen ${gotWheel} ledger mismatches ${mismatches} overflow390 ${await overflow()}`);

await vp(1366);
await p.goto(BASE + "/clover", { waitUntil: "networkidle2" }); await W(800);
let s2 = 0, feat = false;
while (!feat && s2 < MAX) {
  s2++;
  const s = await spinOnce(s2);
  if (s2 === 1 && !s.wheel && !s.freeSpins) { await settled(30000).catch(() => {}); await W(500); await p.evaluate(() => window.scrollTo(0, 0)); await W(300); await shot("base"); }
  if (s.wheel) { feat = true; await playWheel(s, s2, true); }
  else if (s.freeSpins) { feat = true; await playFree(s, s2, true, false); }
  await settled(120000);
}
log.push(`[1366] spins ${s2} feature seen ${feat} ledger mismatches ${mismatches} overflow1366 ${await overflow()}`);
log.push(`wheel on-screen checks: ${wheelChecks.length} (${wheelChecks.filter(Boolean).length} match); outer wheel seen ${upgradeSeen}`);
await p.goto(BASE + "/stories", { waitUntil: "networkidle2" }); await W(1000);
await shot("hub");
log.push(`hub lists Kettle of Clover: ${!!(await p.$('a[href="/clover"]'))}`);
await p.goto(BASE + "/floor", { waitUntil: "networkidle2" }); await W(1200);
const tile = await p.$('a.st-card[href="/clover"]');
log.push(`lobby tile: ${tile ? (await tile.evaluate((e) => e.innerText)).replace(/\s+/g, " ") : "MISSING"}`);
if (tile) { await tile.evaluate((e) => e.scrollIntoView({ block: "center" })); await W(400); await shot("lobby"); }
log.push(`sidebar Story Slots link: ${!!(await p.$('nav.st-rail-nav a[href="/stories"]'))}`);
await p.goto(BASE + "/rules#clover", { waitUntil: "networkidle2" }); await W(600);
log.push(`rules: ${(await p.$eval("#clover + p", (e) => e.textContent)).slice(0, 120)}…`);
await p.goto(BASE + "/activity", { waitUntil: "networkidle2" }); await W(1500);
log.push(`history mentions Kettle of Clover: ${(await p.evaluate(() => document.body.innerText)).includes("Kettle of Clover")}`);
await shot("history");
const fin = await me();
log.push(`final balance ${fin.balanceCents} (server ledger; last spin response ${bal}); page errors ${errors.length} ${errors.slice(0, 3).join(" | ")}`);
console.log(log.join("\n"));
await b.close();
