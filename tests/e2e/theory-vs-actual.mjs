// JD4 live check at 390px: theory vs actual in the /vault Antler Ridge hit history.
// For each tier tab (Mini/Minor/Major/Grand):
//  - the "Theory" figures (average hit, coin-in per hit) equal an independent re-derivation from the LIVE
//    tier config (GET /api/games/slot-progressive info.tiers): must-hit = (S+C)/2 and (C-S)/(2r);
//    Grand = S + r*M and M, M = coin-in per hit (mysteryOddsPerSpin x 900 lines-cents).
//  - "Actual" matches the live hitSamples (last 50 real hits): under 20 → "Not enough hits yet (n of 20 ...)"
//    and "—"; otherwise the plain mean, and a drift flag iff |mean - theory| > 3 SE.
//  - Sandbox chip kept, neutral wording (no due/hot/about-to-hit), no horizontal overflow at 390px.
// Reuses a saved session; never signs up; places no bets.
//   BASE=https://pit-iota-puce.vercel.app JAR=/tmp/pot-jar.json OUT=/workspace/pit/screenshots node tests/e2e/theory-vs-actual.mjs
import puppeteer from "puppeteer-core";
import { existsSync, readFileSync } from "fs";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit/screenshots";
const JAR = process.env.JAR;
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const check = (label, ok, detail = "") => { log.push(`${ok ? "OK  " : "FAIL"} ${label} ${detail}`); if (!ok) process.exitCode = 1; };
const BANNED = /\b(due|hot|almost|about to hit|overdue|soon|streak|close|ready|lucky)\b/i;

function compactDollars(cents) {
  const abs = Math.abs(Math.trunc(cents));
  const d = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const c = abs % 100;
  return `${cents < 0 ? "-" : ""}$${d}${c ? `.${c.toString().padStart(2, "0")}` : ""}`;
}
const money = (cents) => { const c = Math.round(cents); return compactDollars(Math.abs(c) >= 100000 ? Math.round(c / 100) * 100 : c); };
function theory(t) {
  const r = t.contributionBps / 1e4;
  if (t.ceilingCents != null) {
    const span = t.ceilingCents - t.seedCents;
    return { hit: (t.seedCents + t.ceilingCents) / 2, hitSd: Math.sqrt(((span + 1) ** 2 - 1) / 12), coin: span / (2 * r), coinSd: span / (r * Math.sqrt(12)) };
  }
  const M = t.mysteryCoinInPerHitCents ?? t.mysteryOddsPerSpin * 900;
  return { hit: t.seedCents + r * M, hitSd: r * M, coin: M, coinSd: M };
}

const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
if (!JAR || !existsSync(JAR)) throw new Error("JAR with a saved session is required (this script never signs up)");
await p.setCookie(...JSON.parse(readFileSync(JAR, "utf8")));
await p.goto(BASE + "/vault", { waitUntil: "networkidle2" });
const u0 = await p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user ?? null);
if (!u0) throw new Error("saved session expired; not signing up");
await p.evaluate(() => document.querySelector(".first-tip-ok")?.click()); await W(300);
await p.waitForSelector(".hh-tv", { timeout: 20000 }); await W(800);

const api = await p.evaluate(async () => (await (await fetch("/api/games/slot-progressive", { cache: "no-store" })).json()));
check("API returns hitSamples array (last 50 real hits per tier)", Array.isArray(api.hitSamples), `n=${api.hitSamples?.length}`);
const tiers = api.info.tiers;
check("four tiers in live config", tiers.length === 4, tiers.map((t) => t.name).join(","));
const tabs = await p.$$eval(".hh-tab", (els) => els.map((e) => e.id.replace("hh-tab-", "")));
check("four hit-history tabs", tabs.length === 4, tabs.join(","));

for (const id of tabs) {
  await p.click(`#hh-tab-${id}`); await W(250);
  const t = tiers.find((x) => x.id === id);
  const th = theory(t);
  const ui = await p.evaluate(() => {
    const box = document.querySelector(".hh-tv");
    const rows = [...box.querySelectorAll(".hh-tv-row")].map((r) => ({ metric: r.dataset.metric, n: +r.dataset.n, enough: r.dataset.enough === "1", drift: r.dataset.drift === "1", theory: r.querySelector(".hh-tv-theory").textContent.trim(), actual: r.querySelector(".hh-tv-actual").textContent.trim(), status: r.querySelector(".hh-tv-status").textContent.trim() }));
    return { tier: box.dataset.tier, rows, text: box.textContent };
  });
  check(`${t.name}: theory block shows this tier`, ui.tier === id);
  const hitRow = ui.rows.find((r) => r.metric === "Average hit"), coinRow = ui.rows.find((r) => r.metric === "Coin-in per hit");
  check(`${t.name}: theory average hit ${hitRow?.theory} = live-config ${money(th.hit)}`, hitRow?.theory === money(th.hit));
  check(`${t.name}: theory coin-in per hit ${coinRow?.theory} = live-config ${money(th.coin)}`, coinRow?.theory === money(th.coin));
  const mine = api.hitSamples.filter((s) => s.tierId === id && s.amountCents > 0).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 50);
  const coins = mine.map((s) => s.coinInCents).filter((v) => typeof v === "number" && v > 0);
  for (const [row, vals, mean, sd] of [[hitRow, mine.map((s) => s.amountCents), th.hit, th.hitSd], [coinRow, coins, th.coin, th.coinSd]]) {
    if (vals.length < 20) {
      check(`${t.name} ${row.metric}: ${vals.length} real hits < 20 → "Not enough hits yet", no actual, no flag`, row.n === vals.length && !row.enough && !row.drift && row.actual === "—" && row.status.startsWith(`Not enough hits yet (${vals.length} of 20`), row.status);
    } else {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const z = (avg - mean) / (sd / Math.sqrt(vals.length));
      check(`${t.name} ${row.metric}: actual ${row.actual} = mean of ${vals.length} real hits, flag iff |z|>3 (z=${z.toFixed(2)})`, row.actual === money(avg) && row.drift === Math.abs(z) > 3);
    }
  }
  check(`${t.name}: neutral wording`, !BANNED.test(ui.text), BANNED.exec(ui.text)?.[0] ?? "");
}

const fit = await p.evaluate(() => {
  const hh = document.querySelector(".hh").getBoundingClientRect(), tv = document.querySelector(".hh-tv").getBoundingClientRect();
  const cells = [...document.querySelectorAll(".hh-tv-theory, .hh-tv-actual")].every((e) => e.scrollWidth <= e.clientWidth + 1);
  return { overflowX: document.documentElement.scrollWidth > innerWidth + 1, hh: [hh.left, hh.right], tv: [tv.left, tv.right], iw: innerWidth, cells };
});
check("390px: no page overflow, hit history + theory block inside viewport, figures untruncated", !fit.overflowX && fit.tv[0] >= -1 && fit.tv[1] <= fit.iw + 1 && fit.hh[1] <= fit.iw + 1 && fit.cells, JSON.stringify(fit));
check("sandbox chip kept on hit history", await p.$eval(".hh", (e) => !!e.querySelector(".sandbox-chip, .hh-sandbox") && /Sandbox/i.test(e.textContent)));
await p.click(`#hh-tab-${tabs[0]}`); await W(300);
await p.evaluate(() => document.querySelector(".ach-toast-x")?.click()); await W(200);
await p.$eval(".hh", (e) => e.scrollIntoView({ block: "start" })); await p.evaluate(() => window.scrollBy(0, -80)); await W(500);
await p.screenshot({ path: `${OUT}/jd4-theory-vs-actual-390.png` });
check("no page errors", errors.length === 0, errors.join(" | "));
console.log(log.join("\n"));
console.log(`${log.filter((l) => l.startsWith("OK")).length}/${log.length} passed`);
await b.close();
