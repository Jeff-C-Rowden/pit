// Research #5 slice live check at 390px: Thunderhoof Prairie Hold & Spin resumes after a refresh, with live odds.
// 1) Real server spins at the minimum coin are played against /api/games/prairie on the saved sandbox account
//    (real debits and credits) until one triggers Hold & Spin. Nothing is intercepted or forced.
// 2) /prairie then finds that unfinished feature on the server by itself (GET ?resume=1) and opens its
//    player-paced intro, with the cabinet's coin trigger animation and the win held off the Balance.
// 3) Start, watch at least one respin, check the live odds line against the visible board, wait for the server
//    to record the place, then RELOAD. The welcome-back card must name the same respin, Resume must continue
//    from that board, and the summary/collect must match the server's settled spin. After Collect a reload
//    shows no resume card and the server reports no open feature.
// Reuses a saved session; never signs up.
//   BASE=https://pit-iota-puce.vercel.app JAR=/tmp/pot-jar.json OUT=/workspace/pit/screenshots node tests/e2e/feature-resume.mjs
import puppeteer from "puppeteer-core";
import { existsSync, readFileSync } from "fs";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit/screenshots";
const JAR = process.env.JAR;
const MAX = Number(process.env.MAX || 600);
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (c) => `$${Math.floor(c / 100).toLocaleString("en-US")}.${String(c % 100).padStart(2, "0")}`;
const pct = (p) => { if (!(p > 0)) return "0%"; if (p >= 1) return "100%"; const v = p * 100; if (v < 0.1) return "<0.1%"; if (v < 10) return `${(Math.round(v * 10) / 10).toFixed(1)}%`; return `${Math.round(v)}%`; };
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
if (!JAR || !existsSync(JAR)) throw new Error("JAR with a saved session is required (this script never signs up)");
await p.setCookie(...JSON.parse(readFileSync(JAR, "utf8")));
await p.goto(BASE + "/", { waitUntil: "networkidle2" });
const u0 = await p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user ?? null);
if (!u0) throw new Error("saved session expired; not signing up");
console.error("account", u0.email, "balance", u0.balanceCents);
const resumeState = () => p.evaluate(async () => (await (await fetch("/api/games/prairie?resume=1", { cache: "no-store", credentials: "include" })).json()));
const ledNum = () => p.evaluate(() => Number((document.querySelector(".cab-led-blue .cab-led-num")?.textContent || "").replace(/[^0-9]/g, "")));
const dismiss = async () => { for (const t of ["Ride out", "Got it"]) await p.$(`xpath/.//button[contains(., "${t}")]`).then((h) => h?.evaluate((e) => e.click())).catch(() => {}); };

const found = await p.evaluate(async (MAX) => {
  for (let i = 1; i <= MAX; i++) {
    const r = await fetch("/api/games/prairie", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ coinCents: 25, idempotencyKey: crypto.randomUUID() }) });
    const d = await r.json();
    if (!r.ok) return { err: d.error || r.status, i };
    if (d.spin.hold && d.spin.hold.respins.length >= 3 && !d.spin.freeSpins) return { d, i };
  }
  return { err: "no Hold & Spin in " + MAX, i: MAX };
}, MAX);
if (!found.d) { console.log(JSON.stringify({ ok: false, found })); await b.close(); process.exit(1); }
const d = found.d, s = d.spin, h = s.hold;
console.error(`Hold & Spin after ${found.i} real spins: ${h.start.length} coins, ${h.respins.length} respins, win ${s.winCents}, balance ${d.user.balanceCents}`);
const r = { realSpins: found.i, win: s.winCents, coins0: h.start.length, respins: h.respins.length };
const postBet = d.user.balanceCents - s.winCents;

const s0 = await resumeState();
r.serverOpen = s0.feature?.spin?.id === s.id && s0.feature.progress.phase === "intro";

// 1) a fresh visit finds the unfinished feature on its own
await p.goto(BASE + "/prairie", { waitUntil: "networkidle2" }); await W(800); await dismiss();
await p.waitForSelector("[data-testid=bonus-intro]", { timeout: 30000 });
r.introTrigger = await p.evaluate(() => !!document.querySelector(".pr-trig-hold"));
r.introText = await p.evaluate(() => document.querySelector("[data-testid=bonus-intro]").innerText.replace(/\s+/g, " ").slice(0, 200));
r.introBal = await ledNum();
await p.$eval("[data-testid=bonus-intro-act]", (e) => e.click());
await p.waitForSelector(".pr-hold-grid", { timeout: 10000 });
await p.waitForFunction(() => Number(document.querySelector(".pr-hold-meter .pr-respins")?.textContent) >= 0 && document.querySelectorAll(".pr-hold-cell.fresh").length >= 0, { timeout: 5000 });
await W(1300); // at least one respin shown (1s per respin)
// live odds vs the visible board
r.odds = await p.evaluate(() => {
  const coins = Number((document.querySelector(".pr-hold-meter")?.innerText.match(/Coins\s*(\d+)/) || [])[1]);
  const left = Number(document.querySelector(".pr-hold-meter .pr-respins")?.textContent);
  return { coins, left, next: document.querySelector("[data-testid=hold-odds-next]")?.textContent ?? null, full: document.querySelector("[data-testid=hold-odds-full]")?.textContent ?? null, text: document.querySelector("[data-testid=hold-odds]")?.innerText ?? "" };
});
r.oddsOk = r.odds.next === null ? /Round over/.test(r.odds.text) : r.odds.next === pct(1 - 0.95 ** (15 - r.odds.coins));
await p.evaluate(() => { const el = document.querySelector(".pr-hold-bar"); if (el) window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 8); });
await W(250);
await p.screenshot({ path: `${OUT}/r5-hold-odds-390.png` });
// wait for the server to record the place, then refresh mid-round
let saved = null;
for (let k = 0; k < 20 && !saved; k++) { const st = await resumeState(); if (st.feature?.progress?.phase === "hold" && st.feature.progress.step >= 1) saved = st.feature.progress; else if (st.feature?.progress?.phase === "holdDone") saved = st.feature.progress; else await W(400); }
r.saved = saved;
await p.reload({ waitUntil: "networkidle2" }); await W(800); await dismiss();
await p.waitForSelector("[data-testid=bonus-resume]", { timeout: 30000 });
const st1 = await resumeState();
r.resumeCard = await p.evaluate(() => { const c = document.querySelector("[data-testid=bonus-resume]"); const rc = c.getBoundingClientRect(); return { text: c.innerText.replace(/\s+/g, " "), focus: document.activeElement?.dataset?.testid, chip: /no cash value/i.test(c.textContent), fits: rc.left >= 0 && rc.right <= innerWidth + 1 && rc.top >= 0 && rc.bottom <= innerHeight + 1 }; });
r.resumeBal = await ledNum();
const sp = st1.feature?.progress;
r.placeMatches = !!sp && (sp.phase === "hold" ? r.resumeCard.text.includes(sp.step === 0 ? "the first respin" : `respin ${sp.step + 1}, with`) : /round-up total/.test(r.resumeCard.text));
await W(2500);
r.stillThere = !!(await p.$("[data-testid=bonus-resume]")); // no auto-advance
await p.screenshot({ path: `${OUT}/r5-resume-390.png` });
await p.$eval("[data-testid=bonus-resume-act]", (e) => e.click());
await W(300);
r.resumedBoard = await p.evaluate(() => Number((document.querySelector(".pr-hold-meter")?.innerText.match(/Coins\s*(\d+)/) || [])[1] || 0));
const boardAt = (step) => { const set = new Set(h.start.map((c) => c.cell)); h.respins.slice(0, step).forEach((x) => x.landed.forEach((c) => set.add(c.cell))); return set.size; };
r.resumedFromPlace = sp?.phase === "hold" ? r.resumedBoard === boardAt(sp.step) : true;
// finish: skip, collect hold card, summary
for (let k = 0; k < 40; k++) {
  if (await p.$("[data-testid=bonus-summary]")) break;
  for (const t of ["Skip to total", "Collect"]) await p.$(`xpath/.//button[contains(., "${t}") and not(@disabled) and not(@data-cab-spin) and not(@data-testid="bonus-summary-act")]`).then((x) => x?.evaluate((e) => e.click())).catch(() => {});
  await W(700);
}
await p.waitForSelector("[data-testid=bonus-summary]", { timeout: 20000 });
r.summaryTotal = await p.$eval("[data-testid=bonus-summary-total]", (e) => e.textContent);
r.summaryBal = await ledNum();
await p.$eval("[data-testid=bonus-summary-act]", (e) => e.click());
await W(1500);
r.afterBal = await ledNum();
const st2 = await resumeState();
r.closedOnServer = st2.feature === null;
await p.reload({ waitUntil: "networkidle2" }); await W(2500); await dismiss();
r.noCardAfter = !(await p.$("[data-testid=bonus-resume]")) && !(await p.$("[data-testid=bonus-intro]"));
const u1 = await p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user);
r.checks = {
  serverOpen: r.serverOpen,
  introOnFreshVisit: /Hold & Spin/.test(r.introText) && r.introTrigger,
  heldBalance: r.introBal === postBet && r.resumeBal === postBet && r.summaryBal === postBet,
  liveOdds: r.oddsOk,
  placeSaved: !!saved,
  resumeCard: r.resumeCard.focus === "bonus-resume-act" && r.resumeCard.chip && r.resumeCard.fits && r.placeMatches && r.stillThere,
  resumedFromPlace: r.resumedFromPlace,
  summary: r.summaryTotal === fmt(s.winCents),
  collected: r.afterBal === d.user.balanceCents && r.closedOnServer && r.noCardAfter,
  balanceUntouched: u1.balanceCents === d.user.balanceCents,
  noErrors: errors.length === 0,
};
r.ok = Object.values(r.checks).every(Boolean);
console.log(JSON.stringify({ ok: r.ok, errors, r }, null, 1));
await b.close();
process.exit(r.ok ? 0 : 1);
