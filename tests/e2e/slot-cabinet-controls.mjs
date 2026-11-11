// Cabinet controls on a fresh account: Bet −/+ step the coin, the pull handle spins (tap and
// drag), Spin-to-Stop still works, Auto runs a short visible run and can be stopped, and lights
// never show a win state while reels are moving.
//   BASE=http://127.0.0.1:3100 node tests/e2e/slot-cabinet-controls.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit-shots";
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const email = `cabc${Date.now()}@pit.test`, pass = "sandbox-pass-1";
const click = async (xp, t = 20000) => { const h = await p.waitForSelector(`xpath/${xp}`, { timeout: t }); await h.evaluate((e) => e.scrollIntoView({ block: "center" })); await W(200); await h.click(); };
const bal = () => p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user?.balanceCents ?? null);
const led = (i) => p.$$eval(".cab-led .cab-led-num", (els, i) => els[i]?.textContent, i);
const log = [];
const check = (label, ok, detail = "") => { log.push(`${ok ? "OK  " : "FAIL"} ${label} ${detail}`); if (!ok) process.exitCode = 1; };
const settled = () => p.waitForFunction(() => !document.querySelector(".reel.is-spinning") && !document.querySelector(".action-dock.is-busy"), { timeout: 25000 });
// glow must be 0 whenever any reel is still spinning
await p.evaluateOnNewDocument(() => {
  window.__glowDuringSpin = 0;
  setInterval(() => {
    const c = document.querySelector(".slot-cabinet.cab");
    if (c && document.querySelector(".reel.is-spinning") && c.getAttribute("data-glow") !== "0") window.__glowDuringSpin++;
  }, 40);
});
await p.goto(BASE + "/", { waitUntil: "networkidle2" });
await click('.//button[contains(., "I am 21 or older")]'); await W(800);
await p.goto(BASE + "/signup", { waitUntil: "networkidle2" });
await p.type("#su-name", "Cab"); await p.type("#su-email", email); await p.type("#su-pass", pass);
await p.$eval("input[type=checkbox]", (e) => { if (!e.checked) e.click(); });
await click('.//button[contains(., "Create account")]'); await W(2500);
await click('.//button[contains(., "welcome chips")]').catch(() => {}); await W(1500);
// top up so Auto has room
await p.goto(BASE + "/wallet", { waitUntil: "networkidle2" }); await W(800);
await click('.//button[contains(@class,"cage-amt") and normalize-space(.)="$50.00"]').catch(() => {}); await W(1500);

for (const game of ["slot", "vault"]) {
  await p.goto(`${BASE}/${game}`, { waitUntil: "networkidle2" }); await W(1500);
  check(`${game}: sandbox label on cabinet`, await p.$$eval(".cab-deck-note, .cab-base", (els) => els.some((e) => /Sandbox \/ test chips/.test(e.textContent))));
  check(`${game}: topper sign`, !!(await p.$(".cab-sign-title")));
  if (game === "vault") check("vault: progressive meters in topper", !!(await p.$(".cab-topper-meters .prog-strip .mhb-bar, .cab-topper-meters .prog-strip")));
  // Bet +/-
  const bet0 = await led(1);
  await p.$eval('button[aria-label="Bet up one coin size"]', (e) => e.click()); await W(200);
  const bet1 = await led(1);
  await p.$eval('button[aria-label="Bet down one coin size"]', (e) => e.click()); await W(200);
  const bet2 = await led(1);
  check(`${game}: Bet + then Bet −`, bet0 === "9.00" && bet1 === "22.50" && bet2 === "9.00", `${bet0} -> ${bet1} -> ${bet2}`);
  // Handle tap
  let before = await bal();
  await p.$eval(".cab-lever-arm", (e) => e.click());
  await W(500);
  check(`${game}: tapping the handle starts a spin`, !!(await p.$(".reel.is-spinning")));
  await settled(); await W(600);
  check(`${game}: handle spin debited the bet once`, (await bal()) !== before, `${before} -> ${await bal()}`);
  // Handle drag
  await W(400);
  const arm = await p.$(".cab-lever-arm");
  await arm.evaluate((e) => e.scrollIntoView({ block: "center" })); await W(300);
  const box = await arm.boundingBox();
  before = await bal();
  await p.mouse.move(box.x + box.width / 2, box.y + 10);
  await p.mouse.down();
  for (let i = 1; i <= 10; i++) { await p.mouse.move(box.x + box.width / 2, box.y + 10 + i * box.height * 0.09); await W(16); }
  await p.mouse.up();
  await W(600);
  check(`${game}: dragging the handle down starts a spin`, !!(await p.$(".reel.is-spinning")));
  await settled(); await W(600);
  // Spin-to-Stop via the cabinet Spin button
  await p.$eval("[data-cab-spin]", (e) => e.click()); await W(400);
  const label = await p.$eval("[data-cab-spin]", (e) => e.textContent);
  await p.$eval("[data-cab-spin]", (e) => e.click());
  const t0 = Date.now(); await settled();
  check(`${game}: Spin becomes Stop and stops early`, label === "Stop" && Date.now() - t0 < 2500, `${label} ${Date.now() - t0}ms`);
  await W(800);
  // Auto: start, let it run 2 spins, then stop
  before = await bal();
  await p.$eval('button[data-cab-auto]', (e) => e.click()); await W(300);
  const autoLbl = await p.$eval('button[data-cab-auto]', (e) => e.textContent);
  check(`${game}: Auto starts and counts down`, /Stop 9/.test(autoLbl), autoLbl);
  await p.waitForFunction(() => /Stop [0-7]\b/.test(document.querySelector("button[data-cab-auto]")?.textContent || ""), { timeout: 40000 }).catch(() => {});
  await p.$eval('button[data-cab-auto]', (e) => e.click());
  await settled(); await W(1500);
  const after = await p.$eval('button[data-cab-auto]', (e) => e.getAttribute("aria-pressed") + " " + e.textContent);
  const note = await p.$eval(".cab-auto-note", (e) => e.textContent).catch(() => "");
  check(`${game}: Auto stops when pressed`, after.startsWith("false") && /Auto stopped/.test(note), `${after} · ${note}`);
  await W(2000);
  check(`${game}: no extra spin after Auto stopped`, !(await p.$(".reel.is-spinning")));
  const credit = await led(0);
  check(`${game}: CREDIT LED matches the server balance`, credit === ((await bal()) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","), `${credit} vs ${await bal()}`);
}
check("no win lighting while any reel spins", (await p.evaluate(() => window.__glowDuringSpin)) === 0, `${await p.evaluate(() => window.__glowDuringSpin)}`);
console.log(email + "\n" + log.join("\n"));
await b.close();
