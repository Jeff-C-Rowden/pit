// Win lines on all seven slots at 390px: real server spins until a paid win, then checks the overlay
// (count matches the server's paid wins, a line is drawn for line/ways wins and none for scatters),
// and saves phone screenshots. Nothing is staged or forced.
//   BASE=https://pit-iota-puce.vercel.app OUT=/workspace/pit-shots/winlines JAR=/tmp/pot-jar.json node tests/e2e/winlines.mjs
import puppeteer from "puppeteer-core";
import { existsSync, readFileSync, writeFileSync } from "fs";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit-shots/winlines";
const JAR = process.env.JAR;
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const MAX = Number(process.env.MAX_SPINS || 120);
process.on("unhandledRejection", (e) => { console.error("FATAL", e?.message?.slice(0, 400)); process.exit(3); });
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
if (process.env.RM) await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
if (JAR && existsSync(JAR)) await p.setCookie(...JSON.parse(readFileSync(JAR, "utf8")));
const log = (...a) => console.error(...a);
const me = () => p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user ?? null);
const clickX = async (xp, t = 4000) => { const h = await p.waitForSelector(`xpath/${xp}`, { timeout: t }); await h.evaluate((e) => e.click()); };

await p.goto(BASE + "/", { waitUntil: "networkidle2" });
let u = await me();
if (!u) {
  await clickX('.//button[contains(@class,"home-enter")]').catch(() => {}); await W(600);
  await p.goto(BASE + "/signup", { waitUntil: "networkidle2" });
  await p.type("#su-name", "Wyn Lines"); await p.type("#su-email", `winlines${Date.now()}@pit.test`); await p.type("#su-pass", "sandbox-pass-1");
  await p.$eval("input[type=checkbox]", (e) => { if (!e.checked) e.click(); });
  await clickX('.//button[contains(., "Create account")]'); await W(2500);
  await clickX('.//button[contains(., "welcome chips")]').catch(() => {}); await W(800);
  await clickX('.//button[contains(., "Skip tour")]', 2000).catch(() => {});
  u = await me();
}
if (!u?.email?.endsWith("@pit.test")) throw new Error(`not a @pit.test account: ${u?.email}`);
if (JAR) writeFileSync(JAR, JSON.stringify(await p.cookies()));
log("account", u.email, "balance", u.balanceCents);
if ((u.balanceCents ?? 0) < 50000) await p.evaluate(async () => fetch("/api/wallet/deposit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amountCents: 100000 }) }));

const GAMES = [
  { id: "sundown", path: "/slot", api: "/api/games/slot" },
  { id: "antler", path: "/vault", api: "/api/games/slot-progressive" },
  { id: "buckshot", path: "/buckshot", api: "/api/games/buckshot" },
  { id: "bounty", path: "/bounty", api: "/api/games/bounty" },
  { id: "mine", path: "/mine", api: "/api/games/mine" },
  { id: "prairie", path: "/prairie", api: "/api/games/prairie" },
  { id: "clover", path: "/clover", api: "/api/games/clover" },
];

/** What the overlay should show for a settled base spin, straight from the server result. */
function expected(id, s) {
  if (id === "buckshot" || id === "bounty") return { n: s.winCents > 0 ? 1 : 0, scatter: false };
  if (id === "prairie") return { n: (s.wins?.length ?? 0) + (s.scatterWinCents > 0 ? 1 : 0), scatter: s.scatterWinCents > 0 };
  const lines = (s.lineWins ?? []).filter((w) => w.winCents > 0).length;
  return { n: lines + (s.scatterWinCents > 0 ? 1 : 0), scatter: s.scatterWinCents > 0 };
}
const FEATURE = ".mine-modal:not(.mine-story):not(.pr-story):not(.cl-story), .mine-fs-bar, .cl-wheel, .pr-hold, .mine-carts, .mine-trigger, .mine-summary";
async function drainFeatures() {
  const t0 = Date.now();
  let calm = 0;
  while (Date.now() - t0 < 180000) {
    const busy = await p.evaluate((sel) => !!document.querySelector(sel) || !!document.querySelector(".slot-cabinet.is-spinning"), FEATURE);
    if (!busy) { if (++calm >= 3) return true; await W(500); continue; }
    calm = 0;
    for (const t of ["Spin the Rainbow Wheel", "Skip to total", "On to free spins", "Back to the reels"]) await clickX(`.//button[contains(., "${t}")]`, 300).catch(() => {});
    await clickX('.//button[starts-with(normalize-space(.), "Collect")]', 300).catch(() => {});
    await p.$eval(".mine-carts button:not(:disabled)", (e) => e.click()).catch(() => {});
    await W(700);
  }
  return false;
}
const toCab = async () => { await p.$eval(".slot-cabinet", (e) => { e.scrollIntoView({ block: "start" }); window.scrollBy(0, -60); }); await W(250); };
const overlay = () => p.evaluate(() => {
  const h = document.querySelector(".wl-host.on");
  if (!h) return null;
  const lab = h.querySelector("[data-win-label]");
  const lr = lab?.getBoundingClientRect(), wr = h.getBoundingClientRect();
  return {
    kind: h.dataset.winShow, idx: Number(h.dataset.winIndex), count: Number(h.dataset.winCount),
    label: lab?.textContent ?? "", lines: h.querySelectorAll(".wl-stroke line, polyline.wl-stroke").length,
    frames: h.querySelectorAll(".wl-frame").length, dims: h.querySelectorAll(".wl-dim").length,
    labelInside: !!lr && lr.left >= wr.left - 0.5 && lr.right <= wr.right + 0.5 && lr.top >= wr.top - 0.5 && lr.bottom <= wr.bottom + 0.5,
    labelOneLineOrTwo: !!lr && lr.height < 44,
    anim: getComputedStyle(h.querySelector(".wl-frame") || h).animationName,
  };
});

const report = {};
for (const g of GAMES) {
  if (ONLY && !ONLY.includes(g.id)) continue;
  const r = (report[g.id] = { spins: 0, win: null, multi: null, scatter: null, ways: null, mismatches: [], noWinClean: null });
  await p.goto(BASE + g.path, { waitUntil: "networkidle2" }); await W(800);
  for (const t of ["Head into the mine", "Ride out", "Cross the bridge", "Got it"]) await clickX(`.//button[contains(., "${t}")]`, 800).catch(() => {});
  await p.$eval(".rl-toggle input", (e) => { if (!e.checked) e.click(); }).catch(() => {}); // turbo
  while (r.spins < MAX && !(r.win && r.multi && (r.scatter || r.spins > 60))) {
    r.spins++;
    const res = p.waitForResponse((x) => x.url().includes(g.api) && x.request().method() === "POST", { timeout: 30000 });
    await p.$eval("[data-cab-spin]", (e) => e.click());
    const body = await (await res).json();
    const s = body.spin;
    if (!s) { log(g.id, "spin error", JSON.stringify(body).slice(0, 200)); break; }
    if (!(await drainFeatures())) { log(g.id, "feature stuck"); break; }
    await W(450);
    const exp = expected(g.id, s);
    let ov = await overlay();
    if (exp.n === 0) { if (ov) r.mismatches.push(`spin ${r.spins}: overlay on a non-winning spin`); else if (r.noWinClean === null) r.noWinClean = true; continue; }
    if (!ov) { await W(600); ov = await overlay(); }
    if (!ov) {
      const dom = await p.evaluate(() => ({ host: document.querySelector(".wl-host")?.className ?? null, cab: document.querySelector(".slot-cabinet")?.className ?? "", btns: [...document.querySelectorAll("button")].filter((x) => x.offsetParent).map((x) => x.textContent.trim()).filter((t) => t.length < 30).slice(0, 12) }));
      r.mismatches.push(`spin ${r.spins}: paid ${s.winCents} but no overlay (lines ${(s.lineWins ?? s.wins ?? []).length} scatter ${s.scatterWinCents} fs ${!!s.freeSpins} wheel ${!!s.wheel} hold ${!!s.hold} pick ${!!s.pick}) ${JSON.stringify(dom)}`);
      await p.screenshot({ path: `${OUT}/${g.id}-nooverlay-${r.spins}.png` });
      continue;
    }
    if (ov.count !== exp.n) r.mismatches.push(`spin ${r.spins}: overlay count ${ov.count} vs server ${exp.n}`);
    if (!ov.labelInside) r.mismatches.push(`spin ${r.spins}: label clipped`);
    const isFeature = !!(s.freeSpins || s.wheel || s.hold || s.pick);
    if (!r.win && !isFeature) {
      await toCab(); ov = await overlay();
      await p.screenshot({ path: `${OUT}/${g.id}-win.png` });
      r.win = { spin: r.spins, winCents: s.winCents, overlay: ov };
      log(g.id, "win shot", JSON.stringify(ov));
    }
    if (g.id === "prairie" && !r.ways && ov.kind === "ways" && (s.wins ?? []).some((w) => w.ways > 1)) {
      await toCab(); ov = await overlay();
      for (let k = 0; k < 30 && !(ov?.kind === "ways" && /\b([2-9]|\d\d+) ways/.test(ov.label)); k++) { await W(200); ov = await overlay(); }
      if (ov?.kind === "ways") { await p.screenshot({ path: `${OUT}/prairie-ways.png` }); r.ways = { spin: r.spins, wins: s.wins.map((w) => `${w.symbol} ${w.reels}r ${w.ways}w ${w.winCents}`), overlay: ov }; log("prairie ways shot", JSON.stringify(ov)); }
    }
    if (exp.scatter && !r.scatter) {
      await toCab();
      for (let k = 0; k < 20; k++) { ov = await overlay(); if (ov?.kind === "scatter") break; await W(250); }
      if (ov?.kind === "scatter") { await p.screenshot({ path: `${OUT}/${g.id}-scatter.png` }); r.scatter = { spin: r.spins, overlay: ov }; log(g.id, "scatter shot", JSON.stringify(ov)); if (ov.lines) r.mismatches.push("scatter drew a line"); }
    }
    if (exp.n >= 2 && !r.multi) {
      await toCab();
      const seen = [];
      for (let k = 0; k < 40 && seen.length < 2; k++) {
        ov = await overlay();
        if (ov && !seen.some((x) => x.idx === ov.idx) && ov.kind !== "scatter") { await p.screenshot({ path: `${OUT}/${g.id}-multi-${seen.length + 1}.png` }); seen.push(ov); }
        await W(200);
      }
      r.multi = { spin: r.spins, n: exp.n, frames: seen };
      log(g.id, "multi shots", JSON.stringify(seen.map((x) => x.label)));
    }
  }
  // the next spin clears the lines while the reels move
  const res = p.waitForResponse((x) => x.url().includes(g.api) && x.request().method() === "POST", { timeout: 30000 });
  await p.$eval("[data-cab-spin]", (e) => e.click());
  await W(120);
  r.clearsOnSpin = !(await p.$(".wl-host.on"));
  await res; await drainFeatures();
  log(g.id, "done", JSON.stringify({ spins: r.spins, win: !!r.win, multi: !!r.multi, scatter: !!r.scatter, mismatches: r.mismatches, clearsOnSpin: r.clearsOnSpin }));
}
report.overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
report.errors = errors;
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
await b.close();
