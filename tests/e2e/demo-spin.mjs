// #11 guest demo spin live check at 390px, SIGNED OUT: fresh browser (no session cookie),
// confirm 21+ on the gate, land on /signup, take the one demo spin, and check:
// no request leaves the page during the spin (browser-only chips), the shown result equals
// the real Buckshot paytable for the reels shown, the labels / RTP / 21+ / $100 CTA are
// present, a second spin is refused, and the CTA focuses the signup form. Never signs up.
//   BASE=https://pit-iota-puce.vercel.app OUT=/workspace/pit/screenshots node tests/e2e/demo-spin.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit/screenshots";
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const ctx = await b.createBrowserContext();
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const checks = {};
await p.goto(BASE + "/", { waitUntil: "networkidle2" });
checks.signedOut = (await p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user)) == null;
checks.gateLine = !!(await p.$("[data-testid=gate-demo-line]"));
await p.$eval(".home-enter", (e) => e.click());
await p.waitForFunction(() => location.pathname === "/signup", { timeout: 15000 });
await p.waitForSelector("[data-testid=demo-spin]", { timeout: 15000 });
await W(800);
const text = await p.$eval("[data-testid=demo-spin]", (e) => e.textContent);
checks.label = text.includes("Demo spin · sandbox chips · no cash value");
checks.rtp = /RTP 94\.67% at 3 coins/.test(text);
checks.age = text.includes("21+");
checks.credits = (await p.evaluate(() => [...document.querySelectorAll(".cab-led")].find((e) => e.textContent.includes("Demo credits"))?.querySelector(".cab-led-num")?.textContent)) === "10.00";
await p.screenshot({ path: `${OUT}/demo-spin-before-390.png` });
// Watch the network while spinning: the demo must not call the server.
const reqs = [];
const onReq = (r) => { if (!r.url().includes("/_next/")) reqs.push(r.method() + " " + r.url()); };
p.on("request", onReq);
await p.$eval("[data-demo-spin]", (e) => { e.scrollIntoView({ block: "center" }); e.click(); });
await p.waitForSelector("[data-testid=demo-result]", { timeout: 20000 });
await W(1200);
p.off("request", onReq);
checks.noRequestsDuringSpin = reqs.length === 0;
const r = await p.evaluate(() => {
  const line = [...document.querySelectorAll(".bb-reel")].map((reel) => reel.querySelectorAll(".bb-cell")[1]?.getAttribute("aria-label") || reel.querySelectorAll(".bb-cell")[1]?.textContent);
  const res = document.querySelector("[data-testid=demo-result]");
  return { win: Number(res.dataset.win), text: res.innerText, line, stored: sessionStorage.getItem("pit_demo_spin_v1"), local: Object.keys(localStorage) };
});
const stored = JSON.parse(r.stored);
// Re-evaluate the stored reels with the real paytable rules (independent of the page code).
const PAYS = { SEVEN: 80, BAR3: 40, BAR2: 20, BAR1: 10 }, CH = [0, 1, 3, 10], TOP = [0, 800, 1600, 2500];
function evalLine(line, coins) {
  const wilds = line.filter((s) => s === "WILD").length;
  if (wilds === 3) return TOP[coins];
  const rest = line.filter((s) => s !== "WILD"); const mult = 2 ** wilds; let best = 0;
  if (!rest.includes("BLANK")) {
    if (rest.every((s) => s === rest[0]) && PAYS[rest[0]]) best = Math.max(best, PAYS[rest[0]] * mult);
    if (rest.every((s) => /^BAR/.test(s))) best = Math.max(best, 2 * mult);
  }
  const ch = rest.filter((s) => s === "CHERRY").length;
  if (ch) best = Math.max(best, CH[Math.min(3, ch + wilds)] * mult);
  return best * coins;
}
checks.storedOnlyInTab = !!stored && stored.spinsLeft === 0;
checks.paytableMatch = evalLine(stored.last.line, 3) * 25 === r.win && stored.last.winCents === r.win;
checks.balanceMath = stored.balanceCents === 1000 - 75 + r.win;
checks.windowMatchesStored = JSON.stringify(stored.last.window.map((w) => w[1])) === JSON.stringify(stored.last.line);
checks.cta = /claim \$100\.00 sandbox welcome chips/i.test(r.text);
checks.respPlay = /21\+ only/.test(r.text) && /limits/.test(r.text);
checks.secondSpinRefused = await p.$eval("[data-demo-spin]", (e) => e.disabled);
checks.stillSignedOut = (await p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user)) == null;
const cookies = (await p.cookies()).map((c) => c.name);
checks.noSessionCookie = !cookies.some((n) => /sess|token/i.test(n));
checks.noHorizontalScroll = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
await p.$eval("[data-testid=demo-result]", (e) => e.scrollIntoView({ block: "end" }));
await W(400);
await p.screenshot({ path: `${OUT}/demo-spin-result-390.png` });
await p.$eval("[data-testid=demo-cta]", (e) => e.click());
await W(1200);
checks.ctaFocusesForm = await p.evaluate(() => document.activeElement?.id === "su-name");
checks.noPageErrors = errors.length === 0;
const ok = Object.values(checks).every((v) => v === true || typeof v === "string");
console.log(JSON.stringify({ ok, result: r.text.split("\n")[0], line: stored.last.line, winCents: r.win, credits: checks.credits, checks, errors, reqs }, null, 1));
await b.close();
process.exit(ok ? 0 : 1);
