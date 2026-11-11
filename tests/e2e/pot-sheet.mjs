// Jackpot Desk J2: "How this pot works" sheet on the /vault meter strip and the lobby meters.
// Opens each tier, checks dialog semantics, real numbers, sandbox label, no due/hot wording,
// Esc closes + focus returns, and no horizontal overflow at 320/360/390/430/768/1280.
//   BASE=http://127.0.0.1:3000 OUT=/workspace/pit-shots node tests/e2e/pot-sheet.mjs
// SIGNUP=0 skips account creation (use with a pre-set session or pages that don't need one).
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit-shots";
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const log = [];
const check = (label, ok, detail = "") => { console.log(`${ok ? "OK  " : "FAIL"} ${label} ${detail}`); log.push(`${ok ? "OK  " : "FAIL"} ${label} ${detail}`); if (!ok) process.exitCode = 1; };
const click = async (xp, t = 20000) => { const h = await p.waitForSelector(`xpath/${xp}`, { timeout: t }); await h.evaluate((e) => e.scrollIntoView({ block: "center" })); await W(200); await h.click(); };
await p.goto(BASE + "/", { waitUntil: "networkidle2" });
await click('.//button[contains(@class,"home-enter")]'); await W(900);
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const JAR = process.env.JAR;
if (JAR && existsSync(JAR)) await p.setCookie(...JSON.parse(readFileSync(JAR, "utf8")));
else if (process.env.SIGNUP !== "0") {
  await p.goto(BASE + "/signup", { waitUntil: "networkidle2" });
  await p.type("#su-name", "Pot"); await p.type("#su-email", `pot${Date.now()}@pit.test`); await p.type("#su-pass", "sandbox-pass-1");
  await p.$eval("input[type=checkbox]", (e) => { if (!e.checked) e.click(); });
  await click('.//button[contains(., "Create account")]'); await W(2500);
  await click('.//button[contains(., "welcome chips")]', 4000).catch(() => {}); await W(1200);
  await click('.//button[contains(., "Skip tour")]', 3000).catch(() => {});
  if (JAR) writeFileSync(JAR, JSON.stringify(await p.cookies()));
}
const expectCap = { Mini: "$30", Minor: "$150", Major: "$1,000", Grand: "No cap (mystery)" };
async function sweep(where, sel) {
  for (const name of ["Mini", "Minor", "Major", "Grand"]) {
    const btn = await p.waitForSelector(`${sel}-${name.toLowerCase()}`, { timeout: 20000 });
    await btn.evaluate((e) => e.scrollIntoView({ block: "center" })); await btn.click(); await W(300);
    // Fallback to a DOM click if an overlay (toast / tour) took the coordinate tap or hydration lagged.
    for (let i = 0; i < 6 && !(await p.$('[data-testid="pot-sheet"]')); i++) {
      await p.$eval(`${sel}-${name.toLowerCase()}`, (e) => { e.focus(); e.click(); }).catch(() => {});
      await W(1000);
    }
    if (!(await p.$('[data-testid="pot-sheet"]'))) await p.screenshot({ path: `${OUT}/pot-sheet-${where}-${name}-FAIL.png` });
    const d = await p.waitForSelector('[data-testid="pot-sheet"]', { timeout: 3000 });
    const info = await d.evaluate((e) => ({ role: e.getAttribute("role"), modal: e.getAttribute("aria-modal"), text: e.textContent, focusIn: e.contains(document.activeElement) }));
    check(`${where} ${name} dialog`, info.role === "dialog" && info.modal === "true" && info.focusIn);
    check(`${where} ${name} cap`, info.text.includes(expectCap[name]), expectCap[name]);
    check(`${where} ${name} sandbox`, info.text.includes("Sandbox chips · no cash value"));
    check(`${where} ${name} average caveat`, info.text.includes("not the odds of the next spin"));
    check(`${where} ${name} no due/hot`, !/\b(due|hot|overdue)\b/i.test(info.text));
    if (name === "Major") await p.screenshot({ path: `${OUT}/pot-sheet-${where}-390.png` });
    await p.keyboard.press("Escape"); await W(250);
    const gone = !(await p.$('[data-testid="pot-sheet"]'));
    const back = await p.evaluate((s) => document.activeElement?.matches(s), `${sel}-${name.toLowerCase()}`);
    check(`${where} ${name} Esc closes + focus returns`, gone && back);
  }
  for (const w of [320, 360, 390, 430, 768, 1280]) {
    await p.setViewport({ width: w, height: 844, isMobile: w < 768, hasTouch: w < 768 });
    await W(400);
    // isMobile flips reload the page; SSR markup can show before hydration, so retry the tap.
    await p.waitForSelector(`${sel}-major`, { timeout: 20000 }); await W(800);
    for (let i = 0; i < 8 && !(await p.$('[data-testid="pot-sheet"]')); i++) {
      await p.$eval(`${sel}-major`, (e) => { e.scrollIntoView({ block: "center" }); e.click(); }).catch(() => {});
      await W(1000);
    }
    await p.waitForSelector('[data-testid="pot-sheet"]', { timeout: 3000 }); await W(200);
    const ov = await p.evaluate(() => {
      const d = document.querySelector('[data-testid="pot-sheet"]').getBoundingClientRect();
      return { page: document.documentElement.scrollWidth - window.innerWidth, sheetFits: d.left >= -1 && d.right <= window.innerWidth + 1 };
    });
    check(`${where} ${w}px no overflow`, ov.page <= 0 && ov.sheetFits, JSON.stringify(ov));
    if (w === 320) await p.screenshot({ path: `${OUT}/pot-sheet-${where}-320.png` });
    await p.$eval(".pot-sheet-close", (e) => e.click()); await W(200);
  }
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
}
await p.goto(`${BASE}/vault`, { waitUntil: "networkidle2" }); await W(2500);
await sweep("vault", ".prog-tier.prog-tier");
await p.goto(`${BASE}/floor`, { waitUntil: "networkidle2" }); await W(2500);
await sweep("lobby", ".vault-lobby-tier-btn.vault-lobby");
await b.close();
