// SS1 live check at 390px: honest "how it plays" tags on every lobby card and in each game's first-load card.
// 1) /floor: every game card shows a .hip block whose chips and trigger line equal EXPECTED (frozen from
//    src/lib/howItPlays.ts / gameMath.ts at ship time), with a volatility meter on bucketed games.
// 2) No marketing / "due" words; no horizontal overflow of the card grid.
// 3) First load of /mine and /roulette (tip storage cleared): the "First time here" card contains the same
//    tags + trigger and the "not a prediction of the next spin" footnote; sandbox label still present.
// Reuses a saved session; never signs up; places no bets.
//   BASE=https://pit-iota-puce.vercel.app JAR=/tmp/pot-jar.json OUT=/workspace/pit/screenshots node tests/e2e/how-it-plays.mjs
import puppeteer from "puppeteer-core";
import { existsSync, readFileSync } from "fs";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit/screenshots";
const JAR = process.env.JAR;
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const EXPECTED = {
 "/slot": {
  "tags": [
   "RTP 95.53%",
   "Low volatility",
   "Wins ~1 in 3",
   "Pays ~1 in 2"
  ],
  "trigger": "No bonus round. Every spin pays from the 9-line paytable."
 },
 "/vault": {
  "tags": [
   "RTP 94.8–95.0%",
   "Medium volatility",
   "Wins ~1 in 4"
  ],
  "trigger": "Jackpots are mystery hits on any spin, no symbols needed. Mini, Minor and Major must hit by their caps. Tap a meter for its math."
 },
 "/buckshot": {
  "tags": [
   "RTP 94.44–94.67%",
   "High volatility",
   "Wins ~1 in 11",
   "Pays ~1 in 5"
  ],
  "trigger": "No bonus round. Only the centre line pays; the horseshoe is wild."
 },
 "/bounty": {
  "tags": [
   "RTP 90.31–90.53%",
   "High volatility",
   "Wins ~1 in 11",
   "Pays ~1 in 5"
  ],
  "trigger": "No bonus round. Bonus-funded wins pay out in cash."
 },
 "/mine": {
  "tags": [
   "RTP 95.76%",
   "Medium volatility",
   "Wins ~1 in 5",
   "Pays ~1 in 2"
  ],
  "trigger": "3+ dynamite anywhere: free spins with Lantern ×1–×4 (about 1 in 117 spins). Cart on reels 1, 3, 5: Mine Cart pick (about 1 in 125 spins)."
 },
 "/prairie": {
  "tags": [
   "RTP 95.25%",
   "Medium volatility",
   "Wins ~1 in 8",
   "Pays ~1 in 2"
  ],
  "trigger": "3+ storm clouds: free spins with 2×/3× wilds (about 1 in 117 spins). 6+ gold coins: Hold & Spin (about 1 in 87 spins)."
 },
 "/clover": {
  "tags": [
   "RTP 95.35%",
   "Medium volatility",
   "Wins ~1 in 6",
   "Pays ~1 in 2"
  ],
  "trigger": "3+ kettles: free spins with expanding clovers (about 1 in 117 spins). Rainbow on reels 1, 3, 5: Rainbow Wheel (about 1 in 125 spins)."
 },
 "/blackjack": {
  "tags": [
   "House edge 0.4%",
   "Low volatility"
  ],
  "trigger": "No bonus round. Blackjack pays 3:2; the dealer stands on soft 17."
 },
 "/paigow": {
  "tags": [
   "House edge 2.9%",
   "Low volatility"
  ],
  "trigger": "No bonus round. Win both hands to win, one hand to push."
 },
 "/holdem": {
  "tags": [
   "No rake",
   "High volatility"
  ],
  "trigger": "No bonus round. House bots fill the other seats; no rake."
 },
 "/roulette": {
  "tags": [
   "House edge 5.26%",
   "Volatility by bet"
  ],
  "trigger": "No bonus round. Red or black wins 18 of 38 spins."
 },
 "/craps": {
  "tags": [
   "Pass edge 1.41%",
   "Volatility by bet"
  ],
  "trigger": "No bonus round. Pass line wins 244 of 495 decisions (49.3%)."
 }
};
const BANNED = /\b(hot|due|loose|guaranteed?|huge|massive|epic|best odds|can'?t lose|lucky|overdue|streak)\b/i;
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
if (!JAR || !existsSync(JAR)) throw new Error("JAR with a saved session is required (this script never signs up)");
await p.setCookie(...JSON.parse(readFileSync(JAR, "utf8")));
await p.goto(BASE + "/floor", { waitUntil: "networkidle2" });
const u0 = await p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user ?? null);
if (!u0) throw new Error("saved session expired; not signing up");
await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("pit_tip_v1:")) localStorage.removeItem(k); });
await W(1200);
const cards = await p.$$eval(".st-grid .st-card", (els) => els.map((el) => ({
  href: el.getAttribute("href"),
  tags: [...el.querySelectorAll(".hip-tag")].map((t) => t.textContent.trim()),
  trigger: el.querySelector(".hip-trigger")?.textContent.trim() ?? null,
  meter: !!el.querySelector(".hip-vol .vol-meter"),
  aria: el.getAttribute("aria-label") || "",
})));
const r = { cards: cards.length, mismatches: [], banned: [] };
const seen = new Set();
for (const c of cards) {
  const e = EXPECTED[c.href];
  if (!e) continue;
  seen.add(c.href);
  if (JSON.stringify(c.tags) !== JSON.stringify(e.tags) || c.trigger !== e.trigger || !c.aria.includes(e.trigger)) r.mismatches.push({ c, e });
  const bucketed = !/by bet/.test(e.tags[1]);
  if (bucketed !== c.meter) r.mismatches.push({ href: c.href, meter: c.meter });
  if (BANNED.test(c.tags.join(" ") + " " + c.trigger)) r.banned.push(c.href);
}
r.missing = Object.keys(EXPECTED).filter((h) => !seen.has(h));
r.overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
// The welcome sheet can cover the lobby on a fresh browser profile; skip the tour (no claim) before the screenshot.
await p.$('xpath/.//button[contains(., "Skip tour")]').then((h) => h?.evaluate((e) => e.click())).catch(() => {});
await W(500);
await p.evaluate(() => document.querySelector('.st-grid .st-card[href="/mine"]')?.scrollIntoView({ block: "center" }));
await W(400);
await p.screenshot({ path: `${OUT}/ss1-lobby-tags-390.png` });
r.first = {};
for (const g of ["/mine", "/roulette"]) {
  await p.goto(BASE + g, { waitUntil: "networkidle2" });
  await W(1200);
  for (const t of ["Head into the mine"]) await p.$(`xpath/.//button[contains(., "${t}")]`).then((h) => h?.evaluate((e) => e.click())).catch(() => {});
  await W(300);
  const f = await p.evaluate(() => {
    const tip = document.querySelector(".first-tip");
    if (!tip) return null;
    return {
      k: tip.querySelector(".first-tip-k")?.textContent,
      tags: [...tip.querySelectorAll(".hip-tag")].map((t) => t.textContent.trim()),
      trigger: tip.querySelector(".hip-trigger")?.textContent.trim(),
      foot: tip.querySelector(".hip-foot")?.textContent,
      sandbox: tip.innerText.includes("Sandbox / test chips"),
    };
  });
  const e = EXPECTED[g];
  r.first[g] = { ok: !!f && f.k === "First time here" && JSON.stringify(f.tags) === JSON.stringify(e.tags) && f.trigger === e.trigger && /not a prediction of the next spin/.test(f.foot || "") && f.sandbox, f };
  if (g === "/mine") {
    await p.evaluate(() => document.querySelector(".first-tip")?.scrollIntoView({ block: "start" }));
    await p.evaluate(() => window.scrollBy(0, -20));
    await p.screenshot({ path: `${OUT}/ss1-mine-first-load-390.png` });
  }
}
r.errors = errors;
const ok = r.cards >= 12 && !r.mismatches.length && !r.banned.length && !r.missing.length && !r.overflow && Object.values(r.first).every((x) => x.ok) && !errors.length;
console.log(JSON.stringify({ ok, r }, null, 1));
await b.close();
process.exit(ok ? 0 : 1);
