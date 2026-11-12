// Slot Scout S4 live check at 390px: spin a few real server spins on each slot at the current bet,
// then tap the Win meter and confirm the Session recap sheet lists exactly those spins (bet/win from
// the server responses), the session net equals won - bet, Esc closes and focus returns to the meter.
// Reuses a saved session; never signs up. Nothing is staged or forced.
//   BASE=https://pit-iota-puce.vercel.app JAR=/tmp/pot-jar.json OUT=/workspace/pit/screenshots node tests/e2e/spin-recap.mjs
import puppeteer from "puppeteer-core";
import { existsSync, readFileSync } from "fs";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit/screenshots";
const JAR = process.env.JAR;
const SPINS = Number(process.env.SPINS || 3);
const GAMES = (process.env.GAMES || "/slot:/api/games/slot,/vault:/api/games/slot-progressive,/mine:/api/games/mine,/prairie:/api/games/prairie,/clover:/api/games/clover,/buckshot:/api/games/buckshot,/bounty:/api/games/bounty").split(",").map((x) => x.split(":"));
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
if (!JAR || !existsSync(JAR)) throw new Error("JAR with a saved session is required (this script never signs up)");
await p.setCookie(...JSON.parse(readFileSync(JAR, "utf8")));
await p.goto(BASE + "/", { waitUntil: "networkidle2" });
const u = await p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user ?? null);
if (!u) throw new Error("saved session expired; not signing up");
console.error("account", u.email, "balance", u.balanceCents);
const fmt = (c) => `$${Math.floor(c / 100).toLocaleString("en-US")}.${String(c % 100).padStart(2, "0")}`;
const signed = (c) => (c === 0 ? fmt(0) : `${c > 0 ? "+" : "−"}${fmt(Math.abs(c))}`);
const out = [];
for (const [game, api] of GAMES) {
  await p.goto(BASE + game, { waitUntil: "networkidle2" }); await W(900);
  for (const t of ["Head into the mine", "Ride out", "Cross the bridge", "Got it"]) await p.$(`xpath/.//button[contains(., "${t}")]`).then((h) => h?.evaluate((e) => e.click())).catch(() => {});
  if (!(await p.$("[data-testid=win-meter-recap]"))) { out.push({ game, ok: false, why: "no recap Win meter" }); continue; }
  const spins = [];
  for (let i = 0; i < SPINS; i++) {
    await p.waitForFunction(() => { const btn = document.querySelector("[data-cab-spin]"); return btn && !btn.disabled && !document.querySelector(".slot-cabinet.is-spinning"); }, { timeout: 60000 });
    await W(300);
    const res = p.waitForResponse((x) => x.url().includes(api) && x.request().method() === "POST", { timeout: 30000 });
    await p.$eval("[data-cab-spin]", (e) => e.click());
    const d = await (await res).json();
    if (!d.spin) { out.push({ game, ok: false, why: "spin error " + JSON.stringify(d).slice(0, 120) }); break; }
    spins.push({ bet: d.spin.betCents ?? null, win: d.spin.winCents ?? 0, feature: !!(d.spin.freeSpins || d.spin.wheel || d.spin.hold || d.spin.pick) });
    await p.waitForFunction(() => !document.querySelector(".slot-cabinet.is-spinning"), { timeout: 60000 });
    if (spins.at(-1).feature) {
      // let the player-paced feature finish (click through Start / Continue / Collect buttons)
      for (let k = 0; k < 60; k++) {
        await W(1000);
        for (const t of ["Start", "Continue", "Collect", "Skip", "Pick", "Spin the wheel", "Done"]) await p.$(`xpath/.//button[contains(., "${t}") and not(@disabled) and not(@data-cab-spin)]`).then((h) => h?.evaluate((e) => e.click())).catch(() => {});
        const idle = await p.evaluate(() => { const btn = document.querySelector("[data-cab-spin]"); return !!btn && !btn.disabled; });
        if (idle) break;
      }
    }
  }
  await W(2500);
  await p.$eval("[data-testid=win-meter-recap]", (e) => { e.scrollIntoView({ block: "center" }); e.click(); });
  await p.waitForSelector("[data-testid=spin-recap]", { timeout: 5000 });
  const sheet = await p.evaluate(() => {
    const s = document.querySelector("[data-testid=spin-recap]");
    const r = s.getBoundingClientRect();
    return {
      inBody: s.closest(".cab-deck") == null,
      focus: document.activeElement?.textContent,
      net: s.querySelector("[data-testid=recap-net]")?.textContent,
      rows: [...s.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent.trim())),
      chip: !!s.textContent.match(/no cash value/i),
      fits: r.left >= 0 && r.right <= innerWidth + 1,
    };
  });
  await p.screenshot({ path: `${OUT}/s4-recap${game.replace("/", "-")}.png` });
  await p.keyboard.press("Escape"); await W(300);
  const after = await p.evaluate(() => ({ closed: !document.querySelector("[data-testid=spin-recap]"), focus: document.activeElement?.dataset?.testid }));
  const bets = spins.map((s) => s.bet);
  const wins = spins.map((s) => s.win);
  const rowWins = sheet.rows.map((r) => r[2]).reverse();
  const winOk = JSON.stringify(rowWins) === JSON.stringify(wins.map(fmt));
  const betOk = bets.some((x) => x == null) || JSON.stringify(sheet.rows.map((r) => r[1]).reverse()) === JSON.stringify(bets.map(fmt));
  const rowBetsCents = sheet.rows.map((r) => Math.round(Number(r[1].replace(/[$,]/g, "")) * 100));
  const netOk = sheet.net === signed(wins.reduce((a, c) => a + c, 0) - rowBetsCents.reduce((a, c) => a + c, 0));
  const ok = sheet.rows.length === spins.length && winOk && betOk && netOk && sheet.inBody && sheet.focus === "Close" && sheet.chip && sheet.fits && after.closed && after.focus === "win-meter-recap";
  out.push({ game, ok, spins, sheet, after, winOk, betOk, netOk });
  console.error(game, ok ? "OK" : "FAIL", JSON.stringify({ rows: sheet.rows, net: sheet.net }));
}
console.log(JSON.stringify({ out, errors }, null, 1));
await b.close();
process.exit(out.every((o) => o.ok) && !errors.length ? 0 : 1);
