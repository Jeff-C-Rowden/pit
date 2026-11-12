// Max Bet on Kettle of Clover at 390px with a balance under $500 (fresh @pit.test account, welcome chips only):
// Max Bet must pick the largest coin the balance covers, and the spin must go through.
//   BASE=https://pit-iota-puce.vercel.app OUT=/workspace/pit-shots/winlines node tests/e2e/maxbet.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit-shots/winlines";
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const clickX = async (xp, t = 4000) => { const h = await p.waitForSelector(`xpath/${xp}`, { timeout: t }); await h.evaluate((e) => e.click()); };
const me = () => p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user ?? null);
await p.goto(BASE + "/", { waitUntil: "networkidle2" });
await clickX('.//button[contains(@class,"home-enter")]').catch(() => {}); await W(600);
await p.goto(BASE + "/signup", { waitUntil: "networkidle2" });
await p.type("#su-name", "Max Bett"); await p.type("#su-email", `maxbet${Date.now()}@pit.test`); await p.type("#su-pass", "sandbox-pass-1");
await p.$eval("input[type=checkbox]", (e) => { if (!e.checked) e.click(); });
await clickX('.//button[contains(., "Create account")]'); await W(2500);
await clickX('.//button[contains(., "welcome chips")]').catch(() => {}); await W(800);
await clickX('.//button[contains(., "Skip tour")]', 2000).catch(() => {});
const u = await me();
if (!u?.email?.endsWith("@pit.test")) throw new Error("not a test account");
const out = { email: u.email, balanceCents: u.balanceCents, bonusCents: u.bonusCents };
await p.goto(BASE + "/clover", { waitUntil: "networkidle2" }); await W(800);
await clickX('.//button[contains(., "Cross the bridge")]', 2000).catch(() => {});
await clickX('.//button[normalize-space(.)="Got it"]', 1500).catch(() => {});
await p.$eval(".cab-key-max", (e) => e.click()); await W(250);
out.armedLabel = await p.$eval(".cab-key-max", (e) => e.innerText.replace(/\s+/g, " "));
await p.$eval(".cab-key-max", (e) => e.click()); await W(400);
out.betLed = await p.evaluate(() => [...document.querySelectorAll(".cab-led, [class*='led']")].map((e) => e.innerText.replace(/\s+/g, " ")).filter(Boolean).slice(0, 6));
await p.$eval(".slot-cabinet", (e) => { e.scrollIntoView({ block: "start" }); window.scrollBy(0, -60); }); await W(300);
await p.screenshot({ path: `${OUT}/clover-maxbet-${u.balanceCents}.png` });
const res = p.waitForResponse((x) => x.url().includes("/api/games/clover") && x.request().method() === "POST", { timeout: 30000 });
await p.$eval("[data-cab-spin]", (e) => e.click());
const body = await (await res).json();
out.spin = body.spin ? { betCents: body.spin.betCents, coinCents: body.spin.coinCents } : body;
out.expectedCoin = Math.min(5000, Math.floor(u.balanceCents / 10));
out.ok = !!body.spin && body.spin.coinCents === out.expectedCoin && body.spin.betCents <= u.balanceCents;
await W(4000);
out.notice = await p.$eval("[data-spin-notice]", (e) => e.innerText).catch(() => null);
await p.screenshot({ path: `${OUT}/clover-maxbet-after-spin.png` });
// if that spin left less than the smallest bet, Max Bet must show the refusal by the Spin controls
await p.waitForFunction(() => !document.querySelector(".slot-cabinet.is-spinning"), { timeout: 60000 }).catch(() => {});
for (const t of ["Spin the Rainbow Wheel", "Skip to total", "Back to the reels"]) { await clickX(`.//button[contains(., "${t}")]`, 8000).catch(() => {}); await W(1500); }
const after = await me();
out.balanceAfter = after.balanceCents;
if (after.balanceCents < 250) {
  await p.reload({ waitUntil: "networkidle2" }); await W(800);
  await p.$eval(".cab-key-max", (e) => e.click()); await W(400);
  out.refusal = await p.$eval("[data-spin-notice]", (e) => e.innerText.replace(/\s+/g, " ")).catch(() => null);
  await p.screenshot({ path: `${OUT}/clover-maxbet-refused.png` });
}
console.log(JSON.stringify(out, null, 1));
await b.close();
