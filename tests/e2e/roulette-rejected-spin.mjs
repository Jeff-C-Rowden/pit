// Regression: a spin the server refuses (e.g. insufficient funds, loss/session limit) must
// tell the player why, in view, every time they tap Spin. Before the fix the error line sat
// above the wheel and Spin scrolled the wheel to the top, so from the 2nd tap on the message
// was hidden under the sticky top bar: tapping Spin "did nothing" (the reported freeze).
//   BASE=http://127.0.0.1:4011 CHROME=/usr/bin/google-chrome node tests/e2e/roulette-rejected-spin.mjs
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE || "http://127.0.0.1:3000";
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await p.goto(BASE + "/", { waitUntil: "networkidle2" });
await p.evaluate(async () => {
  const j = { "content-type": "application/json" };
  await fetch("/api/auth/me", { method: "POST", headers: j, body: JSON.stringify({ age: 21 }) });
  await fetch("/api/auth/signup", { method: "POST", headers: j, body: JSON.stringify({ email: `rej${Date.now()}@pit.test`, password: "password1", displayName: "Rej" }) });
  localStorage.setItem("pit-rl-hint-v1", "1");
});
await p.goto(BASE + "/roulette", { waitUntil: "networkidle2" });
await p.waitForSelector(".rl-grid", { timeout: 30000 });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const tap = async (sel) => {
  const h = await p.waitForSelector(sel, { timeout: 15000 });
  await h.evaluate((e) => { const r = e.getBoundingClientRect(); scrollTo({ top: scrollY + r.y + r.height / 2 - 350, behavior: "instant" }); });
  await W(250); await h.tap();
};
// Stake more than the balance: pick the biggest chip and cover several outside bets.
const bal = await p.evaluate(async () => (await (await fetch("/api/auth/me")).json()).user?.balanceCents ?? 0);
const [custom] = await p.$$('xpath/.//button[contains(., "Custom")]');
await custom.tap(); await W(300);
const inp = await p.waitForSelector(".rl-custom-row input");
await inp.click({ clickCount: 3 }); await inp.type(String(Math.ceil(bal / 100) + 50));
await (await p.$(".rl-custom-row button[type=submit]")).tap(); await W(300);
await tap('[data-bet="red"]');
let failed = 0;
for (let k = 0; k < 3; k++) {
  await tap(".rl-spin");
  await W(2500);
  const s = await p.evaluate(() => {
    const e = [...document.querySelectorAll('[role=alert]')].find((x) => /chip|fund|limit|break|bet/i.test(x.textContent || ""));
    if (!e) return { found: false };
    const r = e.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { found: true, text: e.textContent, visible: r.top >= 0 && r.bottom <= innerHeight && !!top && e.contains(top), coveredBy: top && !e.contains(top) ? String(top.className || top.tagName) : null };
  });
  const ok = s.found && s.visible;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} tap ${k + 1}: rejection message in view`, JSON.stringify(s));
}
await b.close();
console.log(failed ? `${failed} FAILED` : "ALL PASS");
process.exit(failed ? 1 : 0);
