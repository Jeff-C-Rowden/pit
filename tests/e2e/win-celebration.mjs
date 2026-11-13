// Backlog #6 live check at 390px on all seven slot cabinets. Real spins through each cabinet's own
// Spin button at its current bet (real sandbox debits/credits on the saved account) until the
// server returns a plain win that beats the bet. Checks against that server response:
//  - plate tier = win ÷ bet tier (WIN >1x, NICE 2x, BIG 6x, HUGE 21x), amount = server win,
//    multiple rounded down, "sandbox chips", fits 390px, never covers the reel window
//  - no plate on any spin paying ≤ the bet (loss, part back, bet back) seen along the way
//  - no plate while the reels move; no plate on feature / jackpot spins
//  - prefers-reduced-motion (emulated on a second pass for one cabinet): plate still shown, no sparks
// Reuses a saved session; never signs up. Nothing is staged, intercepted or forced.
//   BASE=https://pit-iota-puce.vercel.app JAR=/tmp/pot-jar.json OUT=/workspace/pit/screenshots node tests/e2e/win-celebration.mjs
import puppeteer from "puppeteer-core";
import { existsSync, readFileSync } from "fs";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit/screenshots";
const JAR = process.env.JAR;
const MAX = Number(process.env.MAX || 40);
const GAMES = (process.env.GAMES || "/slot:/api/games/slot,/vault:/api/games/slot-progressive,/mine:/api/games/mine,/prairie:/api/games/prairie,/clover:/api/games/clover,/buckshot:/api/games/buckshot,/bounty:/api/games/bounty").split(",").map((x) => x.split(":"));
const REDUCED_GAME = process.env.REDUCED_GAME || "/slot";
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (c) => `$${Math.floor(c / 100).toLocaleString("en-US")}.${String(c % 100).padStart(2, "0")}`;
const tierOf = (bet, win) => (bet <= 0 || win <= bet ? "none" : win >= bet * 21 ? "huge" : win >= bet * 6 ? "big" : win >= bet * 2 ? "nice" : "small");
const multOf = (bet, win) => { const t = Math.floor((win * 10) / bet); return `${t % 10 === 0 ? t / 10 : (t / 10).toFixed(1)}× bet`; };
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
if (!JAR || !existsSync(JAR)) throw new Error("JAR with a saved session is required (this script never signs up)");
await p.setCookie(...JSON.parse(readFileSync(JAR, "utf8")));
await p.goto(BASE + "/", { waitUntil: "networkidle2" });
const u = await p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user ?? null);
if (!u) throw new Error("saved session expired; not signing up");
console.error("account", u.email, "balance", u.balanceCents);
const feature = (s) => !!(s && (s.freeSpins || s.pick || s.hold || s.wheel || (s.progressiveHits && s.progressiveHits.length)));
const plate = () => p.evaluate(() => {
  const el = document.querySelector("[data-testid=win-celebration]");
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const w = el.closest(".slot-cabinet")?.querySelector(".cab-window")?.getBoundingClientRect();
  return { tier: el.dataset.tier, text: el.innerText.replace(/\s+/g, " ").trim(), label: el.getAttribute("aria-label"), sparks: el.querySelectorAll(".win-cele-sparks i").length,
    sparksShown: (() => { const s = el.querySelector(".win-cele-sparks"); return !!s && getComputedStyle(s).display !== "none"; })(),
    anim: getComputedStyle(el).animationName, fits: r.left >= 0 && r.right <= innerWidth + 1, overReels: w ? r.bottom > w.top + 1 : null };
});
async function finishFeature() {
  for (let k = 0; k < 90; k++) {
    await W(1000);
    for (const t of ["Start", "Continue", "Collect", "Skip", "Pick", "Spin the wheel", "Done", "Nice", "OK"]) await p.$(`xpath/.//button[contains(., "${t}") and not(@disabled) and not(@data-cab-spin)]`).then((h) => h?.evaluate((e) => e.click())).catch(() => {});
    const idle = await p.evaluate(() => { const btn = document.querySelector("[data-cab-spin]"); return !!btn && !btn.disabled && !document.querySelector("[data-testid=bonus-intro], [data-testid=bonus-summary], .vault-jp-modal"); });
    if (idle) return;
  }
}
async function runGame(game, api, tag) {
  await p.goto(BASE + game, { waitUntil: "networkidle2" }); await W(900);
  for (const t of ["Head into the mine", "Ride out", "Cross the bridge", "Got it"]) await p.$(`xpath/.//button[contains(., "${t}")]`).then((h) => h?.evaluate((e) => e.click())).catch(() => {});
  const r = { game, tag, spins: 0, quietOk: true, quietSeen: 0, featureSeen: 0, midSpinPlate: false };
  for (let i = 0; i < MAX; i++) {
    await p.waitForFunction(() => { const btn = document.querySelector("[data-cab-spin]"); return btn && !btn.disabled && !document.querySelector(".slot-cabinet.is-spinning"); }, { timeout: 60000 });
    await W(250);
    const res = p.waitForResponse((x) => x.url().endsWith(api) && x.request().method() === "POST", { timeout: 30000 });
    await p.$eval("[data-cab-spin]", (e) => e.click());
    const d = await (await res).json();
    r.spins++;
    if (!d.spin) { r.why = "spin error " + JSON.stringify(d).slice(0, 160); return r; }
    const s = d.spin, bet = s.betCents, win = s.winCents || 0;
    await W(200);
    if (await p.$(".slot-cabinet.is-spinning") && await p.$("[data-testid=win-celebration]")) r.midSpinPlate = true;
    await p.waitForFunction(() => !document.querySelector(".slot-cabinet.is-spinning"), { timeout: 60000 });
    await W(900);
    if (feature(s)) {
      r.featureSeen++;
      const pl = await plate();
      if (pl) { r.quietOk = false; r.featurePlate = pl; }
      await finishFeature(); await W(600);
      if (await plate()) { r.quietOk = false; r.featurePlateAfter = true; }
      continue;
    }
    const pl = await plate();
    if (win <= bet) {
      r.quietSeen++;
      if (pl) { r.quietOk = false; r.badQuiet = { bet, win, pl }; }
      continue;
    }
    const tier = tierOf(bet, win);
    r.bet = bet; r.win = win; r.expect = { tier, amount: fmt(win), mult: multOf(bet, win) }; r.plate = pl;
    r.ok = !!pl && pl.tier === tier && pl.text.includes(fmt(win)) && pl.text.includes(multOf(bet, win)) && /sandbox chips/i.test(pl.text) && /no cash value/i.test(pl.label) && pl.fits && pl.overReels === false && r.quietOk && !r.midSpinPlate;
    await p.evaluate(() => document.querySelector("[data-testid=win-celebration]")?.scrollIntoView({ block: "center" }));
    await W(150);
    await p.screenshot({ path: `${OUT}/win-cele${tag}${game.replace("/", "-")}-390.png` });
    return r;
  }
  r.ok = false; r.why = `no plain win over the bet in ${MAX} spins`;
  return r;
}
const out = [];
for (const [game, api] of GAMES) {
  const r = await runGame(game, api, "");
  console.error(game, r.ok ? "OK" : "FAIL", JSON.stringify({ spins: r.spins, bet: r.bet, win: r.win, plate: r.plate?.text, tier: r.plate?.tier, quiet: r.quietSeen, features: r.featureSeen, why: r.why }));
  out.push(r);
}
// reduced motion pass
await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
const api = GAMES.find(([g]) => g === REDUCED_GAME)?.[1] || "/api/games/slot";
const rr = await runGame(REDUCED_GAME, api, "-reduced");
rr.ok = !!rr.ok && rr.plate.sparks === 0 && !rr.plate.sparksShown && (rr.plate.anim === "none" || rr.plate.anim === "");
console.error("reduced", REDUCED_GAME, rr.ok ? "OK" : "FAIL", JSON.stringify({ plate: rr.plate }));
out.push(rr);
const u2 = await p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user ?? null);
console.log(JSON.stringify({ out, errors, balanceAfter: u2?.balanceCents }, null, 1));
await b.close();
process.exit(out.every((o) => o.ok) && !errors.length ? 0 : 1);
