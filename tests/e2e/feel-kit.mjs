// SS3 live check at 390px: Sound & feel kit.
// 1) Fresh device: Music / Effects / Haptics all off (phone menu panel + cabinet sheet), nothing vibrates on a spin.
// 2) Switches are separate and remembered across a reload (localStorage pit.feel.*).
// 3) Haptics on: every Sundown Trail spin is compared with the server's settled result (bet = coin×9, win from
//    POST /api/games/slot). After the spin-start kick, a losing / sub-bet spin gets NO vibration; a real win gets
//    exactly the pattern for its honest tier (small/nice/big/huge). Reel stops never vibrate.
// 4) Reduce Motion: no vibration at all, even with Haptics on.
// 5) Music on creates WebAudio oscillators (synthesized, no audio files requested); off by default.
// Reuses a saved session; never signs up. Places a few small sandbox-chip spins.
//   BASE=https://pit-iota-puce.vercel.app JAR=/tmp/pot-jar.json OUT=/workspace/pit/screenshots node tests/e2e/feel-kit.mjs
import puppeteer from "puppeteer-core";
import { existsSync, readFileSync } from "fs";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit/screenshots";
const JAR = process.env.JAR;
const SPINS = Number(process.env.SPINS || 10);
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const check = (label, ok, detail = "") => { log.push(`${ok ? "OK  " : "FAIL"} ${label} ${detail}`); if (!ok) process.exitCode = 1; };
const TIER = { small: [14], nice: [18, 60, 18], big: [26, 60, 26, 60, 26], huge: [32, 60, 32, 60, 32, 60, 90] };
const SPIN_KICK = [12, 30, 8];
const tierOf = (bet, win) => (win <= bet ? "none" : win >= bet * 21 ? "huge" : win >= bet * 6 ? "big" : win >= bet * 2 ? "nice" : "small");

if (!JAR || !existsSync(JAR)) throw new Error("JAR with a saved session is required (this script never signs up)");
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage();
const errors = [], audioFiles = [];
p.on("pageerror", (e) => errors.push(String(e)));
p.on("request", (r) => { if (/\.(mp3|wav|ogg|m4a)(\?|$)/i.test(r.url())) audioFiles.push(r.url()); });
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await p.evaluateOnNewDocument(() => {
  window.__vib = [];
  Object.defineProperty(navigator, "vibrate", { configurable: true, value: (pat) => { window.__vib.push({ t: performance.now(), pat: Array.isArray(pat) ? pat : [pat] }); return true; } });
  window.__osc = 0;
  const C = window.AudioContext;
  if (C) { const o = C.prototype.createOscillator; C.prototype.createOscillator = function () { window.__osc++; return o.call(this); }; }
});
await p.setCookie(...JSON.parse(readFileSync(JAR, "utf8")));

// spin results straight from the server
let results = [];
p.on("response", async (r) => {
  if (r.url().endsWith("/api/games/slot") && r.request().method() === "POST") {
    try { const body = JSON.parse(r.request().postData() || "{}"); const d = await r.json(); if (d.spin) results.push({ bet: body.coinCents * 9, win: d.spin.winCents || 0 }); } catch {}
  }
});

await p.goto(BASE + "/floor", { waitUntil: "networkidle2" });
const me = await p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user ?? null);
if (!me) throw new Error("saved session expired; not signing up");
await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("pit.feel") || k === "pit.sound") localStorage.removeItem(k); });
await p.reload({ waitUntil: "networkidle2" });

// 1) phone menu panel, all off
await p.click(".st-burger"); await W(500);
const rail = await p.$$eval(".st-rail-feel .feel-row", (els) => els.map((e) => [e.getAttribute("data-feel"), e.getAttribute("aria-checked")]));
check("phone menu shows Music / Effects / Haptics", JSON.stringify(rail.map((r) => r[0])) === '["music","effects","haptics"]', JSON.stringify(rail));
check("all off by default in the menu", rail.length === 3 && rail.every((r) => r[1] === "false"));
await p.keyboard.press("Escape"); await p.goto(BASE + "/slot", { waitUntil: "networkidle2" });
await p.evaluate(() => document.querySelector(".first-tip-ok")?.click()); await W(400);
// smallest coin so the test spends as few sandbox chips as possible
for (let i = 0; i < 8; i++) { const ok = await p.$eval('button[aria-label="Coin value down"]', (e) => { if (e.disabled) return false; e.click(); return true; }); if (!ok) break; await W(150); }

const pill = await p.$eval(".cab-sound", (e) => [e.textContent.trim(), e.getAttribute("data-feel-summary")]);
check("cabinet pill reads OFF by default", pill[0].startsWith("OFF") && pill[1] === "OFF", JSON.stringify(pill));
await p.click(".cab-sound"); await W(400);
const sheet = await p.$$eval(".feel-sheet .feel-row", (els) => els.map((e) => [e.getAttribute("data-feel"), e.getAttribute("aria-checked")]));
check("cabinet sheet has 3 switches, all off", sheet.length === 3 && sheet.every((r) => r[1] === "false"), JSON.stringify(sheet));
const sheetText = await p.$eval(".feel-sheet", (e) => e.innerText);
check("sheet says haptics never fire on losses + off by default", /Never on losses/.test(sheetText) && /Off by default/.test(sheetText));
const fits = await p.evaluate(() => { const r = document.querySelector(".feel-sheet").getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 0.5 && document.documentElement.scrollWidth <= innerWidth; });
check("sheet fits 390px, no horizontal overflow", fits);
await p.keyboard.press("Escape"); await W(200);

async function spinOnce() {
  const n = results.length;
  const v0 = await p.evaluate(() => window.__vib.length);
  await p.click('button[aria-label="Spin"]');
  for (let i = 0; i < 80 && results.length === n; i++) await W(100);
  await p.waitForFunction(() => !document.querySelector('button[aria-label="Stop reels"]'), { timeout: 15000 });
  await W(1500);
  const vib = await p.evaluate((v0) => window.__vib.slice(v0).map((x) => x.pat), v0);
  return { r: results[n], vib };
}

// default: nothing vibrates
const off = await spinOnce();
check("feel off: spin produces no vibration", off.vib.length === 0, JSON.stringify(off.vib));

// 2) separate + remembered
await p.click(".cab-sound"); await W(300);
await p.click('.feel-sheet .feel-row[data-feel="haptics"]'); await W(200);
await p.screenshot({ path: `${OUT}/ss3-feel-sheet-390.png` });
await p.keyboard.press("Escape");
await p.reload({ waitUntil: "networkidle2" }); await W(600);
const stored = await p.evaluate(() => ["pit.feel.music", "pit.feel.effects", "pit.feel.haptics"].map((k) => localStorage.getItem(k)));
check("only Haptics on, remembered after reload", JSON.stringify(stored) === '["off","off","on"]', JSON.stringify(stored));
const pill2 = await p.$eval(".cab-sound", (e) => e.getAttribute("data-feel-summary"));
check("pill summary BUZZ", pill2 === "BUZZ", pill2);

// 3) honest per-tier haptics
let wins = 0, losses = 0;
for (let i = 0; i < SPINS; i++) {
  const { r, vib } = await spinOnce();
  if (!r) { const e = await p.evaluate(() => document.querySelector(".toast, [role=alert]")?.textContent || ""); check(`spin ${i + 1} got a server result`, false, e); break; }
  const tier = tierOf(r.bet, r.win);
  const first = JSON.stringify(vib[0]) === JSON.stringify(SPIN_KICK);
  const after = vib.slice(1);
  const want = tier === "none" ? [] : [TIER[tier]];
  if (tier === "none") losses++; else wins++;
  check(`spin ${i + 1} bet ${r.bet} win ${r.win} (${tier})`, first && JSON.stringify(after) === JSON.stringify(want), `vib=${JSON.stringify(vib)}`);
}
check("saw at least one non-winning spin", losses > 0, `wins=${wins} losses=${losses}`);
await p.screenshot({ path: `${OUT}/ss3-slot-haptics-390.png` });

// 4) reduced motion
await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
const rm = await spinOnce();
check("Reduce Motion: no vibration even with Haptics on", rm.vib.length === 0, `result ${JSON.stringify(rm.r)} vib=${JSON.stringify(rm.vib)}`);
await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);

// 5) music
const osc0 = await p.evaluate(() => window.__osc);
await p.click(".cab-sound"); await W(300);
await p.click('.feel-sheet .feel-row[data-feel="music"]'); await W(800);
const osc1 = await p.evaluate(() => window.__osc);
check("Music on starts a synthesized pad (WebAudio oscillators)", osc1 > osc0, `${osc0}→${osc1}`);
await p.click('.feel-sheet .feel-row[data-feel="music"]'); await W(200);
await p.click('.feel-sheet .feel-row[data-feel="haptics"]'); await W(200);
const end = await p.evaluate(() => ["pit.feel.music", "pit.feel.effects", "pit.feel.haptics"].map((k) => localStorage.getItem(k)));
check("switched everything back off", JSON.stringify(end) === '["off","off","off"]', JSON.stringify(end));
check("no audio files requested", audioFiles.length === 0, audioFiles.join(","));
const labels = await p.evaluate(() => document.body.innerText);
check("Sandbox / test chips label still on the cabinet", /sandbox/i.test(labels));
check("no page errors", errors.length === 0, errors.join(" | "));
await b.close();
console.log(log.join("\n"));
console.log(`${log.filter((l) => l.startsWith("OK")).length}/${log.length} checks passed`);
