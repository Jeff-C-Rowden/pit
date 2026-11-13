// Research #5 slice 2 live check at 390px: Canary Creek Mine (Mine Cart pick) and Kettle of Clover (kettle free
// spins) resume after a refresh, exactly as drawn.
// 1) Real server spins at the minimum coin are played on the saved sandbox account (real debits and credits) until
//    the wanted feature triggers. Nothing is intercepted or forced.
// 2) The cabinet page finds the unfinished feature on the server by itself (GET ?resume=1) and opens its intro,
//    with the win held off the Balance.
// 3) Mine: open two chosen carts, wait for the server to save them, RELOAD; the welcome-back card names 2 carts,
//    Resume reopens the same two carts with the same values. Clover: watch free spins until the server saves
//    free spin 6 (or 1 for short rounds), RELOAD; the card names that spin and Resume continues there with the
//    same running total. Both then finish; summary = the server's win, Collect shows it on the Balance, a reload
//    shows no card and the server reports no open feature.
// Reuses a saved session; never signs up.
//   BASE=https://pit-iota-puce.vercel.app JAR=/tmp/pot-jar.json OUT=/workspace/pit/screenshots node tests/e2e/feature-resume-slots.mjs
import puppeteer from "puppeteer-core";
import { existsSync, readFileSync } from "fs";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit/screenshots";
const JAR = process.env.JAR;
const MAX = Number(process.env.MAX || 900);
const GAMES = (process.env.GAMES || "mine,clover").split(",");
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (c) => `$${Math.floor(c / 100).toLocaleString("en-US")}.${String(c % 100).padStart(2, "0")}`;
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
const ledNum = () => p.evaluate(() => Number((document.querySelector(".cab-led-blue .cab-led-num")?.textContent || "").replace(/[^0-9]/g, "")));
const dismiss = async () => { for (const t of ["Head into the mine", "Cross the bridge", "Got it"]) await p.$(`xpath/.//button[contains(., "${t}")]`).then((h) => h?.evaluate((e) => e.click())).catch(() => {}); };
const cardInfo = (id) => p.evaluate((id) => { const c = document.querySelector(`[data-testid=${id}]`); if (!c) return null; const rc = c.getBoundingClientRect(); return { text: c.innerText.replace(/\s+/g, " "), focus: document.activeElement?.dataset?.testid, chip: /no cash value/i.test(c.textContent), fits: rc.left >= 0 && rc.right <= innerWidth + 1 && rc.top >= 0 && rc.bottom <= innerHeight + 1 }; }, id);
const out = [];

for (const game of GAMES) {
  const api = `/api/games/${game}`;
  const state = () => p.evaluate(async (api) => (await (await fetch(api + "?resume=1", { cache: "no-store", credentials: "include" })).json()), api);
  const found = await p.evaluate(async (api, game, MAX) => {
    for (let i = 1; i <= MAX; i++) {
      const r = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ coinCents: 25, idempotencyKey: crypto.randomUUID() }) });
      const d = await r.json();
      if (!r.ok) return { err: d.error || r.status, i };
      if (game === "mine" && d.spin.pick && d.spin.pick.reveals.length >= 3) return { d, i };
      if (game === "clover" && d.spin.freeSpins && !d.spin.wheel) return { d, i };
    }
    return { err: "no feature in " + MAX, i: MAX };
  }, api, game, MAX);
  if (!found.d) { out.push({ game, ok: false, found }); continue; }
  const d = found.d, s = d.spin;
  const postBet = d.user.balanceCents - s.winCents;
  const r = { game, realSpins: found.i, win: s.winCents };
  console.error(game, `feature after ${found.i} real spins`, s.pick ? `pick ${s.pick.reveals.length}` : "", s.freeSpins ? `fs ${s.freeSpins.spins.length}` : "", "win", s.winCents);
  r.serverOpen = (await state()).feature?.spin?.id === s.id;

  await p.goto(BASE + "/" + game, { waitUntil: "networkidle2" }); await W(900); await dismiss();
  if (game === "clover") await p.evaluate(() => { try { localStorage.setItem("pit_story_v1:clover", "1"); } catch {} });
  await p.waitForSelector("[data-testid=bonus-intro]", { timeout: 30000 });
  r.introText = (await cardInfo("bonus-intro")).text.slice(0, 160);
  r.introBal = await ledNum();
  await p.$eval("[data-testid=bonus-intro-act]", (e) => e.click());
  let saved = null, expectWhere = "";
  if (game === "mine") {
    await p.waitForSelector(".mine-cart-btn", { timeout: 10000 });
    const carts = [5, 2];
    for (const c of carts) { await p.evaluate((c) => document.querySelectorAll(".mine-cart-btn")[c].click(), c); await W(400); }
    for (let k = 0; k < 20 && !saved; k++) { const st = await state(); if (st.feature?.progress?.phase === "pick" && st.feature.progress.step === 2) saved = st.feature.progress; else await W(400); }
    r.savedCarts = saved?.picked;
    expectWhere = "2 carts opened";
  } else {
    const want = s.freeSpins.spins.length > 5 ? 5 : 0;
    for (let k = 0; k < 60 && !saved; k++) { const st = await state(); if (st.feature?.progress?.phase === "kettleFs" && st.feature.progress.step >= want) saved = st.feature.progress; else await W(500); }
    expectWhere = saved ? `free spin ${saved.step + 1} of ${s.freeSpins.spins.length}` : "?";
  }
  r.saved = saved;
  await p.reload({ waitUntil: "networkidle2" }); await W(900); await dismiss();
  await p.waitForSelector("[data-testid=bonus-resume]", { timeout: 30000 });
  r.resumeCard = await cardInfo("bonus-resume");
  r.resumeBal = await ledNum();
  await W(2500);
  r.stillThere = !!(await p.$("[data-testid=bonus-resume]"));
  await p.screenshot({ path: `${OUT}/r5s2-resume-${game}-390.png` });
  await p.$eval("[data-testid=bonus-resume-act]", (e) => e.click());
  if (game === "mine") {
    await p.waitForSelector(".mine-cart-btn", { timeout: 10000 });
    await W(300);
    r.reopened = await p.evaluate(() => [...document.querySelectorAll(".mine-cart-btn")].map((e, i) => (e.classList.contains("open") ? `${i}:${e.querySelector(".mine-cart-val")?.textContent}` : null)).filter(Boolean));
    const val = (it) => (it.kind === "prize" ? `${it.x}×` : "COLLECT");
    r.expectedOpen = [5, 2].map((c, k) => `${c}:${val(s.pick.reveals[k])}`).sort();
    r.sameCarts = JSON.stringify([...r.reopened].sort()) === JSON.stringify(r.expectedOpen);
    await p.screenshot({ path: `${OUT}/r5s2-mine-pick-resumed-390.png` });
  } else {
    await W(120);
    r.fsBar = await p.evaluate(() => document.querySelector(".mine-fs-bar, .cl-fs-bar, [role=status]")?.innerText.replace(/\s+/g, " ") ?? "");
    const before = s.freeSpins.spins.slice(0, saved?.step ?? 0).reduce((a, x) => a + x.winCents, 0);
    r.expectedWonBefore = fmt(before);
    r.continued = r.fsBar.includes(`Spin ${(saved?.step ?? 0) + 1} of`) && r.fsBar.includes(`Won ${fmt(before)}`);
  }
  for (let k = 0; k < 60; k++) {
    if (await p.$("[data-testid=bonus-summary]")) break;
    if (await p.$("[data-testid=bonus-intro-act]")) await p.$eval("[data-testid=bonus-intro-act]", (e) => e.click()).catch(() => {});
    for (const t of ["Reveal the rest", "Skip to total", "Collect"]) await p.$(`xpath/.//button[contains(., "${t}") and not(@disabled) and not(@data-cab-spin) and not(@data-testid="bonus-summary-act")]`).then((x) => x?.evaluate((e) => e.click())).catch(() => {});
    await W(700);
  }
  await p.waitForSelector("[data-testid=bonus-summary]", { timeout: 20000 });
  r.summaryTotal = await p.$eval("[data-testid=bonus-summary-total]", (e) => e.textContent);
  r.summaryBal = await ledNum();
  await p.$eval("[data-testid=bonus-summary-act]", (e) => e.click());
  await W(1500);
  r.afterBal = await ledNum();
  r.closedOnServer = (await state()).feature === null;
  await p.reload({ waitUntil: "networkidle2" }); await W(2500); await dismiss();
  r.noCardAfter = !(await p.$("[data-testid=bonus-resume]")) && !(await p.$("[data-testid=bonus-intro]"));
  const u1 = await p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user);
  r.checks = {
    serverOpen: r.serverOpen,
    introOnFreshVisit: game === "mine" ? /Mine Cart/i.test(r.introText) : /free spins/i.test(r.introText),
    heldBalance: r.introBal === postBet && r.resumeBal === postBet && r.summaryBal === postBet,
    placeSaved: !!saved && (game !== "mine" || JSON.stringify(saved.picked) === "[5,2]"),
    resumeCard: r.resumeCard.focus === "bonus-resume-act" && r.resumeCard.chip && r.resumeCard.fits && r.resumeCard.text.includes(expectWhere) && /Refreshing never changes a result/.test(r.resumeCard.text) && r.stillThere,
    resumedFromPlace: game === "mine" ? r.sameCarts : r.continued,
    summary: r.summaryTotal === fmt(s.winCents),
    collected: r.afterBal === d.user.balanceCents && r.closedOnServer && r.noCardAfter,
    balanceUntouched: u1.balanceCents === d.user.balanceCents,
  };
  r.ok = Object.values(r.checks).every(Boolean);
  out.push(r);
}
const ok = out.length === GAMES.length && out.every((x) => x.ok) && errors.length === 0;
console.log(JSON.stringify({ ok, errors, out }, null, 1));
await b.close();
process.exit(ok ? 0 : 1);
