// Research #5 slice 3 live check at 390px: Canary Creek Mine's Lantern Multiplier (stacking ×1→×4 free spins).
// 1) The published odds: GET /api/games/mine and the page's odds line show the exact Lantern figures.
// 2) Real server spins at the minimum coin on the saved sandbox account (real debits and credits) until a
//    free-spins feature with at least 7 spins lands. Nothing is intercepted or forced.
// 3) The page opens the feature intro by itself; while free spins play, every sampled meter reading
//    (data-mult) equals the server's own `mult` for the spin on screen ("Spin i of N"), and every "+1 next spin"
//    mark appears only after a paying spin is on screen.
// 4) After the server saves free spin 6 (FS_SAVE_EVERY = 5), RELOAD: Resume continues at spin 6 with the meter
//    at the server's ×mult for that spin. Skip to total: summary = server win and names "Lantern up to ×max".
//    Collect, and the server reports no open feature.
// Reuses a saved session; never signs up.
//   BASE=https://pit-iota-puce.vercel.app JAR=/tmp/pot-jar.json OUT=/workspace/pit/screenshots node tests/e2e/lantern-multiplier.mjs
import puppeteer from "puppeteer-core";
import { existsSync, readFileSync } from "fs";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit/screenshots";
const JAR = process.env.JAR;
const MAX = Number(process.env.MAX || 1500);
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (c) => `$${Math.floor(c / 100).toLocaleString("en-US")}.${String(c % 100).padStart(2, "0")}`;
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
const dismiss = async () => { for (const t of ["Head into the mine", "Got it"]) await p.$(`xpath/.//button[contains(., "${t}")]`).then((h) => h?.evaluate((e) => e.click())).catch(() => {}); };
const api = "/api/games/mine";
const state = () => p.evaluate(async (api) => (await (await fetch(api + "?resume=1", { cache: "no-store", credentials: "include" })).json()), api);
const r = {};

const pub = await p.evaluate(async (api) => (await (await fetch(api, { cache: "no-store" })).json()), api);
r.published = { rtp: pub.math.rtp, lanternMaxChance: pub.math.lanternMaxChance, featureX: pub.math.freeSpinFeatureX, lantern: pub.info.lanternMultiplier, awards: pub.info.freeSpinsAward };
const expectLine = `Lantern Multiplier ×1–×4: +1 after every paying free spin · a free-spins feature averages ${pub.math.freeSpinFeatureX.toFixed(1)}× bet · plays at ×4 in ${(pub.math.lanternMaxChance * 100).toFixed(0)}% of features`;

const found = await p.evaluate(async (api, MAX) => {
  for (let i = 1; i <= MAX; i++) {
    const res = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ coinCents: 25, idempotencyKey: crypto.randomUUID() }) });
    const d = await res.json();
    if (!res.ok) return { err: d.error || res.status, i };
    if (d.spin.freeSpins && d.spin.freeSpins.spins.length >= 7) return { d, i };
  }
  return { err: "no long free-spins feature in " + MAX, i: MAX };
}, api, MAX);
if (!found.d) { console.log(JSON.stringify({ ok: false, found, r }, null, 1)); await b.close(); process.exit(1); }
const d = found.d, s = d.spin, fs = s.freeSpins.spins;
r.realSpins = found.i; r.win = s.winCents; r.serverMults = fs.map((x) => x.mult); r.serverBase = fs.map((x) => x.baseWinCents);
console.error(`free spins after ${found.i} real spins`, "mults", r.serverMults.join(","), "win", s.winCents);
const recomputed = fs.map((_, i) => { let m = 1; for (let j = 0; j < i; j++) if (fs[j].baseWinCents > 0) m = Math.min(m + 1, 4); return m; });
r.serverConsistent = JSON.stringify(recomputed) === JSON.stringify(r.serverMults) && fs.every((x) => x.winCents === x.baseWinCents * x.mult);

await p.goto(BASE + "/mine", { waitUntil: "networkidle2" }); await W(900); await dismiss();
r.oddsLine = await p.$eval("[data-testid=lantern-odds]", (e) => e.textContent).catch(() => null);
await p.waitForSelector("[data-testid=bonus-intro]", { timeout: 30000 });
r.introRule = await p.$eval("[data-testid=bonus-intro]", (e) => e.innerText.replace(/\s+/g, " ")).catch(() => "");
await p.$eval("[data-testid=bonus-intro-act]", (e) => e.click());
// sample the meter while free spins play, up to the server save of spin 6
const samples = [];
let shot = false, saved = null;
for (let k = 0; k < 400 && !saved; k++) {
  const m = await p.evaluate(() => {
    const el = document.querySelector("[data-testid=lantern-meter]");
    const bar = document.querySelector(".mine-fs-bar")?.innerText.replace(/\s+/g, " ") ?? "";
    const sp = /Spin (\d+) of (\d+)/.exec(bar);
    return el && sp ? { idx: Number(sp[1]) - 1, mult: Number(el.dataset.mult), next: el.dataset.next ? Number(el.dataset.next) : null, lit: el.querySelectorAll(".mine-lantern-pip.lit").length } : null;
  });
  if (m) {
    samples.push(m);
    if (!shot && m.mult >= 2 && m.next) { await p.evaluate(() => document.querySelector(".mine-fs-bar")?.scrollIntoView({ block: "start" })); await p.evaluate(() => window.scrollBy(0, -60)); await p.screenshot({ path: `${OUT}/r5s3-lantern-mine-390.png` }); shot = true; }
  }
  if (k % 4 === 0) { const st = await state(); if (st.feature?.progress?.phase === "fs" && st.feature.progress.step >= 5) saved = st.feature.progress; }
  await W(150);
}
r.saved = saved;
r.samples = samples.length;
r.badSamples = samples.filter((m) => m.mult !== fs[m.idx]?.mult || m.lit !== m.mult || (m.next !== null && !(fs[m.idx].baseWinCents > 0 && m.next === m.mult + 1))).slice(0, 5);
r.sawNext = samples.some((m) => m.next);
await p.reload({ waitUntil: "networkidle2" }); await W(900); await dismiss();
await p.waitForSelector("[data-testid=bonus-resume]", { timeout: 30000 });
await p.$eval("[data-testid=bonus-resume-act]", (e) => e.click());
await p.waitForSelector("[data-testid=lantern-meter]", { timeout: 8000 }).catch(() => {});
const after = await p.evaluate(() => { const el = document.querySelector("[data-testid=lantern-meter]"); const bar = document.querySelector(".mine-fs-bar")?.innerText.replace(/\s+/g, " ") ?? ""; return { bar, mult: el ? Number(el.dataset.mult) : null }; });
r.resumed = after;
const step = saved?.step ?? -1;
r.resumedOk = after.bar.includes(`Spin ${step + 1} of`) && after.mult === fs[step]?.mult;
if (!shot) { await p.evaluate(() => document.querySelector(".mine-fs-bar")?.scrollIntoView({ block: "start" })); await p.evaluate(() => window.scrollBy(0, -60)); await p.screenshot({ path: `${OUT}/r5s3-lantern-mine-390.png` }); }
await p.screenshot({ path: `${OUT}/r5s3-lantern-mine-resumed-390.png` });
for (let k = 0; k < 40; k++) {
  if (await p.$("[data-testid=bonus-summary]")) break;
  await p.$(`xpath/.//button[contains(., "Skip to total") and not(@disabled)]`).then((x) => x?.evaluate((e) => e.click())).catch(() => {});
  await W(600);
}
await p.waitForSelector("[data-testid=bonus-summary]", { timeout: 20000 });
r.summaryText = await p.$eval("[data-testid=bonus-summary]", (e) => e.innerText.replace(/\s+/g, " "));
r.summaryTotal = await p.$eval("[data-testid=bonus-summary-total]", (e) => e.textContent);
const top = Math.max(...fs.map((x) => x.mult));
await p.$eval("[data-testid=bonus-summary-act]", (e) => e.click());
await W(1500);
r.closedOnServer = (await state()).feature === null;
r.checks = {
  published: r.published.rtp === 0.957579 && r.published.lantern?.max === 4 && JSON.stringify(r.published.awards) === "[0,0,0,7,10,15]",
  oddsLine: r.oddsLine === expectLine,
  introRule: /Lantern Multiplier starts at ×1/.test(r.introRule),
  serverConsistent: r.serverConsistent,
  meterMatchesServer: r.samples >= 5 && r.badSamples.length === 0,
  resumedOk: r.resumedOk,
  summary: r.summaryTotal === fmt(s.winCents) && r.summaryText.includes(`Lantern up to ×${top}`),
  closed: r.closedOnServer,
};
r.ok = Object.values(r.checks).every(Boolean);
const ok = r.ok && errors.length === 0;
console.log(JSON.stringify({ ok, errors, r }, null, 1));
await b.close();
process.exit(ok ? 0 : 1);
