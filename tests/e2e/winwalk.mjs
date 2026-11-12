// Slot Scout S3 live check at 390px: real server spins on one slot until a multi-win, then samples the
// overlay every ~60ms to confirm total first -> each win ~400ms -> settled total (still); a second
// multi-win is tapped to skip; a losing spin must show only the quiet banner (no overlay, no glow).
// Reuses a saved session; never signs up. Nothing is staged or forced.
//   BASE=https://pit-iota-puce.vercel.app JAR=/tmp/pot-jar.json OUT=/workspace/pit/screenshots GAME=/slot API=/api/games/slot node tests/e2e/winwalk.mjs
import puppeteer from "puppeteer-core";
import { existsSync, readFileSync } from "fs";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit/screenshots";
const JAR = process.env.JAR;
const GAME = process.env.GAME || "/slot", API = process.env.API || "/api/games/slot";
const MAX = Number(process.env.MAX_SPINS || 150);
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
await p.goto(BASE + GAME, { waitUntil: "networkidle2" }); await W(800);
for (const t of ["Head into the mine", "Ride out", "Cross the bridge", "Got it"]) await p.$(`xpath/.//button[contains(., "${t}")]`).then((h) => h?.evaluate((e) => e.click())).catch(() => {});
await p.$eval(".rl-toggle input", (e) => { if (!e.checked) e.click(); }).catch(() => {});
// smallest bet: 1-coin minimum keeps the sandbox balance healthy
const ov = () => p.evaluate(() => {
  const h = document.querySelector(".wl-host.on");
  if (!h) return null;
  return { phase: h.dataset.winPhase, idx: Number(h.dataset.winIndex), count: Number(h.dataset.winCount), kind: h.dataset.winShow, label: h.querySelector("[data-win-label]")?.textContent ?? "", t: performance.now() };
});
const r = { spins: 0, walk: null, skip: null, loss: null, errors };
const toCab = async () => { await p.$eval(".slot-cabinet", (e) => { e.scrollIntoView({ block: "start" }); window.scrollBy(0, -60); }); };
while (r.spins < MAX && !(r.walk && r.skip && r.loss)) {
  r.spins++;
  await p.waitForFunction(() => { const c = document.querySelector(".slot-cabinet"); const btn = document.querySelector("[data-cab-spin]"); return c && !c.classList.contains("is-spinning") && btn && !btn.disabled; }, { timeout: 30000 });
  await W(250);
  const res = p.waitForResponse((x) => x.url().includes(API) && x.request().method() === "POST", { timeout: 30000 });
  await p.$eval("[data-cab-spin]", (e) => e.click());
  const s = (await (await res).json()).spin;
  await p.waitForFunction(() => !document.querySelector(".slot-cabinet.is-spinning"), { timeout: 30000 });
  if (!s) { console.error("spin error"); break; }
  if (s.freeSpins || s.wheel || s.hold || s.pick || s.jackpot) { await W(4000); continue; }
  const paid = (s.lineWins ?? s.wins ?? []).filter((w) => w.winCents > 0).length + (s.scatterWinCents > 0 ? 1 : 0);
  if (s.winCents === 0 && !r.loss) {
    await W(2200);
    const q = await p.evaluate(() => { const b = document.querySelector(".result-banner"); return { overlay: !!document.querySelector(".wl-host.on"), glow: document.querySelector(".slot-cabinet")?.dataset.glow, banner: b?.className ?? null, text: b?.textContent ?? "", opacity: b ? getComputedStyle(b).opacity : null, anim: b ? getComputedStyle(b).animationName : null }; });
    r.loss = q; console.error("loss", JSON.stringify(q));
    await toCab(); await p.screenshot({ path: `${OUT}/s3-quiet-loss.png` });
    continue;
  }
  if (paid < 2) { await W(300); continue; }
  if (!r.walk) {
    await toCab();
    const seq = []; let shotTotal = false, shotLine = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 1200 + paid * 400 + 1500) {
      const o = await ov();
      if (o && (!seq.length || seq[seq.length - 1].phase !== o.phase || seq[seq.length - 1].idx !== o.idx)) {
        seq.push(o);
        if (o.phase === "total" && !shotTotal) { shotTotal = true; await p.screenshot({ path: `${OUT}/s3-walk-1-total.png` }); }
        else if (o.phase === "line" && !shotLine) { shotLine = true; await p.screenshot({ path: `${OUT}/s3-walk-2-line.png` }); }
      }
      await W(40);
    }
    await p.screenshot({ path: `${OUT}/s3-walk-3-settled.png` });
    const steps = seq.map((o, i) => ({ phase: o.phase, idx: o.idx, label: o.label, ms: i + 1 < seq.length ? Math.round(seq[i + 1].t - o.t) : null }));
    const order = seq.filter((o) => o.phase === "line").map((o) => o.idx);
    r.walk = { spin: r.spins, paid, serverWin: s.winCents, steps, ok: seq[0]?.phase === "total" && seq[seq.length - 1]?.phase === "done" && order.join() === [...Array(paid).keys()].join() };
    console.error("walk", JSON.stringify(r.walk));
    continue;
  }
  if (!r.skip) {
    await W(400);
    const before = await ov();
    await p.$eval(".wl-host.on", (h) => h.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))).catch(() => {});
    await W(120);
    const after = await ov();
    r.skip = { before, after, ok: !!after && after.phase === "done" };
    console.error("skip", JSON.stringify(r.skip));
  }
}
r.overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
console.log(JSON.stringify(r, null, 1));
await b.close();
