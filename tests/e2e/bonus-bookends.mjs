// Slot Scout S5 live check at 390px on the three feature cabinets.
// 1) Real server spins at the minimum coin are played straight against the game API (real debits and
//    credits on the saved sandbox account) until one comes back with a bonus feature.
// 2) That already-settled server response is then handed to the cabinet's next Spin (request
//    interception: the browser receives the same real result instead of placing a second bet), so
//    the intro and summary cards show genuine server amounts. Nothing is invented or forced.
// Checks: intro card portaled to <body>, focus on Start, SandboxChip, fits 390px, no auto-advance,
// Balance held at the post-bet amount until Collect, summary total/net equal the server win, Esc
// collects, Balance then equals the server balance, recap logs the spin with a feature star.
// Reuses a saved session; never signs up.
//   BASE=https://pit-iota-puce.vercel.app JAR=/tmp/pot-jar.json OUT=/workspace/pit/screenshots node tests/e2e/bonus-bookends.mjs
import puppeteer from "puppeteer-core";
import { existsSync, readFileSync } from "fs";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit/screenshots";
const JAR = process.env.JAR;
const MAX = Number(process.env.MAX || 300);
const GAMES = (process.env.GAMES || "mine,prairie,clover").split(",");
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (c) => `$${Math.floor(c / 100).toLocaleString("en-US")}.${String(c % 100).padStart(2, "0")}`;
const signed = (c) => (c === 0 ? fmt(0) : `${c > 0 ? "+" : "−"}${fmt(Math.abs(c))}`);
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
if (!JAR || !existsSync(JAR)) throw new Error("JAR with a saved session is required (this script never signs up)");
await p.setCookie(...JSON.parse(readFileSync(JAR, "utf8")));
await p.goto(BASE + "/", { waitUntil: "networkidle2" });
const u0 = await p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user ?? null);
if (!u0) throw new Error("saved session expired; not signing up");
console.error("account", u0.email, "balance", u0.balanceCents);
const has = (s) => !!(s && (s.freeSpins || s.pick || s.hold || s.wheel));
const ledNum = () => p.evaluate(() => Number((document.querySelector(".cab-led-blue .cab-led-num")?.textContent || "").replace(/[^0-9]/g, "")));
const out = [];
let intercept = null;
await p.setRequestInterception(true);
p.on("request", (req) => {
  if (intercept && req.method() === "POST" && req.url().endsWith(intercept.api)) {
    const body = JSON.stringify(intercept.d);
    intercept = null;
    return req.respond({ status: 200, contentType: "application/json", body });
  }
  req.continue();
});
for (const game of GAMES) {
  const api = `/api/games/${game}`;
  const found = await p.evaluate(async (api, MAX) => {
    for (let i = 1; i <= MAX; i++) {
      const r = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ coinCents: 25, idempotencyKey: crypto.randomUUID() }) });
      const d = await r.json();
      if (!r.ok) return { err: d.error || r.status, i };
      const s = d.spin;
      if (s && (s.freeSpins || s.pick || s.hold || s.wheel)) return { d, i };
    }
    return { err: "no feature in " + MAX, i: MAX };
  }, api, MAX);
  if (!found.d) { out.push({ game, ok: false, why: found.err, spins: found.i }); console.error(game, "no feature", found); continue; }
  const d = found.d, s = d.spin;
  const kinds = ["freeSpins", "pick", "hold", "wheel"].filter((k) => s[k]);
  console.error(game, `feature after ${found.i} real spins`, kinds.join("+"), "win", s.winCents, "bal", d.user.balanceCents);
  await p.goto(BASE + "/" + game, { waitUntil: "networkidle2" }); await W(900);
  for (const t of ["Head into the mine", "Ride out", "Cross the bridge", "Got it"]) await p.$(`xpath/.//button[contains(., "${t}")]`).then((h) => h?.evaluate((e) => e.click())).catch(() => {});
  await p.waitForFunction(() => { const btn = document.querySelector("[data-cab-spin]"); return btn && !btn.disabled; }, { timeout: 30000 });
  intercept = { api, d };
  await p.$eval("[data-cab-spin]", (e) => e.click());
  const r = { game, kinds, realSpins: found.i, win: s.winCents, serverBal: d.user.balanceCents };
  const wheelFirst = game === "clover" && s.wheel;
  if (!wheelFirst) {
    await p.waitForSelector("[data-testid=bonus-intro]", { timeout: 30000 });
    await W(2600); // still there after the old 2s auto-advance window
    r.intro = await p.evaluate(() => {
      const c = document.querySelector("[data-testid=bonus-intro]");
      const rc = c.getBoundingClientRect();
      return { inBody: c.closest("main, .slot-page") == null, focus: document.activeElement?.dataset?.testid, text: c.innerText.replace(/\s+/g, " ").slice(0, 300), chip: /no cash value/i.test(c.textContent), fits: rc.left >= 0 && rc.right <= innerWidth + 1 && rc.top >= 0 && rc.bottom <= innerHeight + 1, still: true };
    });
    r.introBal = await ledNum();
    await p.screenshot({ path: `${OUT}/s5-intro-${game}.png` });
    await p.keyboard.press("Enter");
  } else {
    await p.waitForSelector("#cl-wheel-h", { timeout: 30000 });
    r.wheelChip = await p.evaluate(() => /no cash value/i.test(document.querySelector("#cl-wheel-h")?.closest("[role=dialog]")?.textContent || ""));
    r.introBal = await ledNum();
    await p.screenshot({ path: `${OUT}/s5-intro-${game}.png` });
  }
  // play through: Start any later intro, skip free spins to the total, reveal picks, spin wheels, Hold & Spin
  for (let k = 0; k < 90; k++) {
    if (await p.$("[data-testid=bonus-summary]")) break;
    for (const sel of ["[data-testid=bonus-intro-act]"]) await p.$(sel).then((h) => h?.evaluate((e) => e.click())).catch(() => {});
    for (const t of ["Skip to total", "Reveal the rest", "Collect", "Spin the Rainbow", "Spin the Pot", "Start free spins", "On to free spins"]) await p.$(`xpath/.//button[contains(., "${t}") and not(@disabled) and not(@data-cab-spin) and not(@data-testid="bonus-summary-act")]`).then((h) => h?.evaluate((e) => e.click())).catch(() => {});
    await W(1000);
  }
  await p.waitForSelector("[data-testid=bonus-summary]", { timeout: 30000 });
  await W(400);
  r.summary = await p.evaluate(() => {
    const c = document.querySelector("[data-testid=bonus-summary]");
    const rc = c.getBoundingClientRect();
    return { inBody: c.closest("main, .slot-page") == null, focus: document.activeElement?.dataset?.testid, total: c.querySelector("[data-testid=bonus-summary-total]")?.textContent, net: c.querySelector("[data-testid=bonus-summary-net]")?.textContent, played: c.querySelector("[data-testid=bonus-summary-played]")?.textContent, rows: [...c.querySelectorAll("tbody tr")].map((tr) => tr.innerText.replace(/\s+/g, " ")), chip: /no cash value/i.test(c.textContent), fits: rc.left >= 0 && rc.right <= innerWidth + 1 };
  });
  r.summaryBal = await ledNum();
  await p.screenshot({ path: `${OUT}/s5-summary-${game}.png` });
  await p.keyboard.press("Escape"); await W(800);
  r.after = await p.evaluate(() => ({ closed: !document.querySelector("[data-testid=bonus-summary]"), focus: document.activeElement?.hasAttribute("data-cab-spin") ? "spin" : document.activeElement?.tagName }));
  r.afterBal = await ledNum();
  await p.$eval("[data-testid=win-meter-recap]", (e) => e.click()); await W(300);
  r.recapStar = await p.evaluate(() => !!document.querySelector("[data-testid=spin-recap] tbody tr .recap-feat"));
  await p.keyboard.press("Escape"); await W(300);
  // a normal real spin still works afterwards (tap-to-stop path untouched)
  const res = p.waitForResponse((x) => x.url().includes(api) && x.request().method() === "POST", { timeout: 30000 });
  await p.$eval("[data-cab-spin]", (e) => e.click());
  r.nextSpinOk = !!(await (await res).json()).spin;
  const postBet = d.user.balanceCents - s.winCents;
  r.checks = {
    intro: wheelFirst ? r.wheelChip : !!(r.intro?.inBody && r.intro.focus === "bonus-intro-act" && r.intro.chip && r.intro.fits),
    heldBal: r.introBal === postBet && r.summaryBal === postBet,
    summary: r.summary.inBody && r.summary.focus === "bonus-summary-act" && r.summary.total === fmt(s.winCents) && r.summary.net === signed(s.winCents - s.betCents) && r.summary.chip && r.summary.fits,
    collected: r.after.closed && r.afterBal === d.user.balanceCents,
    recapStar: r.recapStar,
    nextSpinOk: r.nextSpinOk,
  };
  r.ok = Object.values(r.checks).every(Boolean);
  out.push(r);
  console.error(game, r.ok ? "OK" : "FAIL", JSON.stringify(r.checks), JSON.stringify({ intro: r.intro?.text, summary: r.summary, bals: [r.introBal, r.summaryBal, r.afterBal, postBet, d.user.balanceCents], focusAfter: r.after.focus }));
  await W(4000);
}
console.log(JSON.stringify({ ok: out.every((x) => x.ok), errors, out }, null, 1));
await b.close();
