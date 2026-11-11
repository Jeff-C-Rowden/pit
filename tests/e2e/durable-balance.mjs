// Live regression for "can't add money / can't collect free chips" and "balance must survive
// sign-out and sign-in": fresh visitor -> age gate -> signup -> $100 welcome -> Add test funds
// -> daily claim -> reloads -> sign out / sign in x3 -> balance unchanged.
//   BASE=https://pit-iota-puce.vercel.app OUT=/workspace/pit-shots node tests/e2e/durable-balance.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit-shots";
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const email = `fix${Date.now()}@pit.test`, pass = "sandbox-pass-1";
const bal = () => p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user?.balanceCents ?? null);
const click = async (xp) => { const h = await p.waitForSelector(`xpath/${xp}`, { timeout: 20000 }); await h.evaluate((e) => e.scrollIntoView({ block: "center" })); await W(200); await h.click(); };
const log = [];
const check = (label, got, want) => { log.push(`${label}: ${got}${want !== undefined ? (got === want ? " OK" : ` FAIL (want ${want})`) : ""}`); if (want !== undefined && got !== want) process.exitCode = 1; };

await p.goto(BASE + "/", { waitUntil: "networkidle2" });
await click('.//button[contains(., "I am 21 or older")]'); await W(800);
await p.goto(BASE + "/signup", { waitUntil: "networkidle2" });
await p.type("#su-name", "Fix"); await p.type("#su-email", email); await p.type("#su-pass", pass);
await p.$eval('input[type=checkbox]', (e) => { if (!e.checked) e.click(); });
await click('.//button[contains(., "Create account")]'); await W(2500);
// onboarding: the one-time $100 welcome chips (what Jeff called "100 free chips")
await click('.//button[contains(., "welcome chips")]'); await W(2000);
check("after $100 welcome", await bal(), 10000);
await p.screenshot({ path: `${OUT}/fix-welcome-100.png` });
await click('.//button[contains(., "Skip tour")]').catch(() => {});
await p.goto(BASE + "/wallet", { waitUntil: "networkidle2" }); await W(1000);
await click('.//button[contains(@class,"cage-amt") and normalize-space(.)="$50.00"]'); await W(2000);
check("after Add test funds $50", await bal(), 15000);
await p.screenshot({ path: `${OUT}/fix-after-add-funds.png` });
await click('.//button[contains(., "Claim today")]'); await W(2000);
check("after daily claim $25", await bal(), 17500);
await (await p.$(".daily-claim"))?.evaluate((e) => e.scrollIntoView({ block: "center" })); await W(300);
await p.screenshot({ path: `${OUT}/fix-after-claim.png` });
for (let i = 0; i < 5; i++) { await p.reload({ waitUntil: "networkidle2" }); check(`reload ${i + 1}`, await bal(), 17500); }
for (let i = 0; i < 20; i++) check(`request ${i + 1}`, await bal(), 17500);
for (let c = 1; c <= 3; c++) {
  await p.goto(BASE + "/wallet", { waitUntil: "networkidle2" }); await W(800);
  await click('.//button[contains(@class,"btn-signout")]'); await W(1500);
  check(`signed out #${c} (me.user)`, await bal(), null);
  await p.goto(BASE + "/login", { waitUntil: "networkidle2" });
  await p.type("#login-email", email); await p.type("#login-password", pass);
  await click('.//button[contains(., "Sign in")]'); await W(2500);
  check(`signed back in #${c}`, await bal(), 17500);
}
await p.goto(BASE + "/wallet", { waitUntil: "networkidle2" }); await W(1500);
await p.screenshot({ path: `${OUT}/fix-after-signout-signin.png` });
console.log(email + "\n" + log.join("\n"));
await b.close();
