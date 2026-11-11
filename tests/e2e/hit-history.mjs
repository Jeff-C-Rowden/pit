// Jackpot Desk J3: Antler Ridge per-tier hit history strip.
// Checks the strip renders from GET /api/games/slot-progressive `hitHistory`
// (real hits only), every tier tab works, empty tiers say "No hits yet", the
// sandbox label is present, no due/hot wording, and no horizontal overflow at
// 320/360/390/430/768/1280. Saves hit-history-<w>.png (strip only) + a phone page shot.
//   BASE=https://pit-iota-puce.vercel.app OUT=/workspace/pit/screenshots node tests/e2e/hit-history.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit-shots";
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const email = `hh${Date.now()}@pit.test`;
const click = async (xp, t = 20000) => { const h = await p.waitForSelector(`xpath/${xp}`, { timeout: t }); await h.evaluate((e) => e.scrollIntoView({ block: "center" })); await W(200); await h.click(); };
const log = [];
const check = (label, ok, detail = "") => { log.push(`${ok ? "OK  " : "FAIL"} ${label} ${detail}`); if (!ok) process.exitCode = 1; };
await p.goto(BASE + "/", { waitUntil: "networkidle2" });
await click('.//button[contains(@class,"home-enter")]'); await W(900);
await p.goto(BASE + "/signup", { waitUntil: "networkidle2" });
await p.type("#su-name", "Hist"); await p.type("#su-email", email); await p.type("#su-pass", "sandbox-pass-1");
await p.$eval("input[type=checkbox]", (e) => { if (!e.checked) e.click(); });
await click('.//button[contains(., "Create account")]'); await W(2500);
await click('.//button[contains(., "welcome chips")]').catch(() => {}); await W(1500);
await click('.//button[contains(., "Skip tour")]', 3000).catch(() => {});

const api = await (await fetch(BASE + "/api/games/slot-progressive")).json();
const real = Array.isArray(api.hitHistory) ? api.hitHistory : null;
check("API returns hitHistory array", !!real, real ? `${real.length} real hits` : "");
const perTier = {};
for (const h of real || []) perTier[h.tierId] = (perTier[h.tierId] || 0) + 1;
check("API caps 10 per tier", Object.values(perTier).every((n) => n <= 10), JSON.stringify(perTier));

await p.goto(`${BASE}/vault`, { waitUntil: "networkidle2" });
await p.waitForSelector(".hh .hh-tab", { timeout: 20000 }); await W(3000);
const tabs = await p.$$eval(".hh-tab", (els) => els.map((e) => e.querySelector(".hh-tab-name").textContent));
check("four tier tabs", JSON.stringify(tabs) === JSON.stringify(["Mini", "Minor", "Major", "Grand"]), tabs.join(","));
check("sandbox label", await p.$eval(".hh", (e) => e.textContent.includes("Sandbox / test chips")));
for (let i = 0; i < tabs.length; i++) {
  await p.evaluate((i) => document.querySelectorAll(".hh-tab")[i].click(), i); await W(250);
  const s = await p.evaluate(() => ({ rows: document.querySelectorAll(".hh-row").length, empty: document.querySelector(".hh-empty")?.textContent || "", text: document.querySelector(".hh").textContent }));
  const id = ["vault-mini", "vault-minor", "vault-major", "vault-grand"][i];
  const n = perTier[id] || 0;
  check(`${tabs[i]}: ${n ? `${n} real row(s)` : "No hits yet"}`, n ? s.rows === n : s.rows === 0 && s.empty === "No hits yet", `rows ${s.rows}`);
  check(`${tabs[i]}: no due/hot wording`, !/\b(due|hot|about to hit|overdue)\b/i.test(s.text));
}
// Back to the first tier with hits for the screenshots.
const firstWithHits = ["vault-mini", "vault-minor", "vault-major", "vault-grand"].findIndex((id) => perTier[id]);
await p.evaluate((i) => document.querySelectorAll(".hh-tab")[i].click(), Math.max(0, firstWithHits)); await W(250);

for (const [w, h] of [[320, 700], [360, 780], [390, 844], [430, 932], [768, 1024], [1280, 900]]) {
  await p.setViewport({ width: w, height: h, isMobile: w < 768, hasTouch: w < 768, deviceScaleFactor: w < 768 ? 2 : 1 });
  await W(500);
  const m = await p.evaluate(() => {
    const el = document.querySelector(".hh");
    if (!el) return { overflowX: document.documentElement.scrollWidth > innerWidth + 1, right: -1, left: -1, iw: innerWidth, missing: location.pathname };
    const r = el.getBoundingClientRect();
    return { overflowX: document.documentElement.scrollWidth > innerWidth + 1, right: r.right, left: r.left, iw: innerWidth };
  });
  check(`${w}px: no page overflow, strip inside viewport`, !m.overflowX && m.left >= -1 && m.right <= m.iw + 1, `strip ${m.left.toFixed(0)}–${m.right.toFixed(0)} / ${m.iw}${m.missing ? " MISSING at " + m.missing : ""}`);
  const el = await p.$(".hh");
  if (!el) continue;
  await el.evaluate((e) => e.scrollIntoView({ block: "center" })); await W(200);
  if ([360, 390, 1280].includes(w)) {
    // Strip-only crop: hide the fixed top bar / bottom dock so they don't cover it.
    await p.addStyleTag({ content: ".topbar,.action-dock{visibility:hidden!important}" }).then((t) => p.evaluate((t) => { t.id = "hh-hide"; }, t));
    await el.screenshot({ path: `${OUT}/hit-history-${w}.png` });
    await p.evaluate(() => document.getElementById("hh-hide")?.remove());
  }
}
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await W(400);
if (!(await p.$(".hh"))) { await p.reload({ waitUntil: "networkidle2" }); await p.waitForSelector(".hh", { timeout: 20000 }); await W(1500); }
await p.$eval(".hh", (e) => e.scrollIntoView({ block: "center" })); await W(300);
await p.screenshot({ path: `${OUT}/hit-history-page-390.png` });
console.log(log.join("\n"));
await b.close();
