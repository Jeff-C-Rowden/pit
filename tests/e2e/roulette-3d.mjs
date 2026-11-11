// Live/browser check for the 3D roulette table (run manually; not part of `npm test`).
//   BASE=https://pit-iota-puce.vercel.app OUT=/workspace/pit-shots node tests/e2e/roulette-3d.mjs
// Fresh account -> $100 welcome -> at 390px and 1366px: place chips, spin, capture the wheel
// through the spin, and check the ball's drawn pocket, the dealer call, the dolly and the
// result banner all equal the pocket the server returned.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit-shots";
const FRAMES = process.env.FRAMES; // optional dir for video frames
mkdirSync(OUT, { recursive: true });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const email = `rl3d${Date.now()}@pit.test`, pass = "sandbox-pass-1";
const click = async (xp) => { const h = await p.waitForSelector(`xpath/${xp}`, { timeout: 20000 }); await h.evaluate((e) => e.scrollIntoView({ block: "center" })); await W(200); await h.click(); };
let fail = 0; const log = [];
const check = (l, ok, extra = "") => { log.push(`${ok ? "OK  " : "FAIL"} ${l} ${extra}`); if (!ok) fail++; };

await p.goto(BASE + "/", { waitUntil: "networkidle2" });
await click('.//button[contains(., "I am 21 or older")]'); await W(800);
await p.goto(BASE + "/signup", { waitUntil: "networkidle2" });
await p.type("#su-name", "Wheel"); await p.type("#su-email", email); await p.type("#su-pass", pass);
await p.$eval('input[type=checkbox]', (e) => { if (!e.checked) e.click(); });
await click('.//button[contains(., "Create account")]'); await W(2500);
await click('.//button[contains(., "welcome chips")]'); await W(2000);
await click('.//button[contains(., "Skip tour")]').catch(() => {});
await p.evaluate(() => { localStorage.setItem("pit-rl-hint-v1", "1"); });

for (const w of [390, 1366]) {
  const phone = w < 700;
  await p.setViewport({ width: w, height: phone ? 844 : 900, isMobile: phone, hasTouch: phone, deviceScaleFactor: phone ? 2 : 1 });
  await p.goto(BASE + "/roulette", { waitUntil: "networkidle2" });
  await p.waitForSelector(".rw3d", { timeout: 30000 }); await W(800);
  await p.evaluate(() => document.querySelectorAll(".first-visit-tip button, .fv-tip button").forEach((x) => /got it/i.test(x.textContent || "") && x.click()));
  // chips: $1 on red, $1 straight on 17, $1 on 2nd 12
  for (const sel of ['[data-bet="red"]', '[data-bet="17"]', '[data-bet="2nd 12"]', '[data-bet="17"]']) {
    const h = await p.$(sel); await h.evaluate((e) => e.scrollIntoView({ block: "center" })); await W(150); await h.click(); await W(250);
  }
  await W(400);
  const felt = await p.$(".rl-felt-wrap");
  await felt.evaluate((e) => e.scrollIntoView({ block: "center" })); await W(700);
  await felt.screenshot({ path: `${OUT}/rl3d-chips-${w}.png` });

  // Spin and capture
  const resP = p.waitForResponse((r) => r.url().endsWith("/api/games/roulette") && r.request().method() === "POST", { timeout: 30000 });
  await p.click(".rl-spin");
  const res = await (await resP).json();
  const server = res.spin.pocket;
  const star = await p.$(".rl-star");
  const t0 = Date.now(); let i = 0; let mid = false;
  if (FRAMES) mkdirSync(`${FRAMES}/${w}`, { recursive: true });
  while (Date.now() - t0 < 14000) {
    const st = await p.evaluate(() => ({ spinning: !!document.querySelector(".rw3d.spinning"), call: document.querySelector(".rw3d-call")?.textContent }));
    const el = Date.now() - t0;
    if (st.spinning && !mid && el > 1500) { await star.screenshot({ path: `${OUT}/rl3d-midspin-${w}.png` }); mid = true; }
    if (FRAMES) await star.screenshot({ path: `${FRAMES}/${w}/f${String(i++).padStart(4, "0")}.png` });
    else await W(120);
    if (!st.spinning && el > 1000) break;
  }
  check(`${w}: mid-spin captured`, mid);
  // Pocket the ball is drawn in, computed from the rendered rotor angle and ball transform.
  const drawn = await p.evaluate(() => {
    const rot = getComputedStyle(document.querySelector(".rw3d-rotor")).transform;
    const ball = document.querySelector(".rw3d-ball").style.transform;
    return { rot, ball };
  });
  await W(250);
  await star.screenshot({ path: `${OUT}/rl3d-settle-${w}.png` });
  const ui = await p.evaluate(() => ({
    call: document.querySelector(".rw3d-call")?.textContent || "",
    win: document.querySelectorAll(".rw3d-pk.win").length,
    dolly: document.querySelector(".rl-cell.hit")?.getAttribute("data-bet") || null,
    banner: document.querySelector(".rl-result-ov .rl-pocket-pip")?.textContent || null,
  }));
  check(`${w}: dealer call shows server pocket`, ui.call.startsWith(server + " "), `${ui.call} vs ${server}`);
  check(`${w}: dolly on server pocket`, ui.dolly === server, `${ui.dolly}`);
  check(`${w}: banner shows server pocket`, ui.banner === server, `${ui.banner}`);
  check(`${w}: exactly one lit pocket on wheel`, ui.win === 1);
  // angle check: ball angle minus rotor angle lands in the server pocket's drawn sector
  const ORDER = ["0","28","9","26","30","11","7","20","32","17","5","22","34","15","3","24","36","13","1","00","27","10","25","29","12","8","19","31","18","6","21","33","16","4","23","35","14","2"];
  const m = /matrix\(([^)]+)\)/.exec(drawn.rot); const [a, bb] = m ? m[1].split(",").map(Number) : [1, 0];
  const rotor = (Math.atan2(bb, a) * 180) / Math.PI;
  const t = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(drawn.ball);
  const bx = +t[1] + 7.5 - 220, by = +t[2] + 7.5 - 220;
  const ang = ((Math.atan2(bx, -by) * 180) / Math.PI + 360) % 360;
  const local = (((ang - rotor) % 360) + 360) % 360;
  const drawnPocket = ORDER[Math.floor(local / (360 / 38))];
  check(`${w}: ball drawn in server pocket`, drawnPocket === server, `${drawnPocket} vs ${server}`);
  await W(1800); // camera pulls back, chips settle
  await felt.evaluate((e) => e.scrollIntoView({ block: "center" })); await W(900);
  await felt.screenshot({ path: `${OUT}/rl3d-result-felt-${w}.png` });
  await p.screenshot({ path: `${OUT}/rl3d-page-${w}.png`, fullPage: false });
}
console.log(email + "\n" + log.join("\n"));
process.exitCode = fail ? 1 : 0;
await b.close();
