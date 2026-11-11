// Polish checks: (1) blackjack dealer cards never overlap the felt's top labels (house-edge line,
// "Dealer" label, "Showing N") at phone through desktop widths, floor and tournament mode;
// (2) the session bar's bet count includes tournament bets. Fresh @pit.test account.
//   BASE=https://pit-iota-puce.vercel.app OUT=/workspace/pit-shots node tests/e2e/polish-bj-layout.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://127.0.0.1:3100";
const OUT = process.env.OUT || "/workspace/pit-shots";
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
const errors = []; p.on("pageerror", (e) => errors.push(String(e)));
const email = `polish${Date.now()}@pit.test`, pass = "sandbox-pass-1";
const click = async (xp, t = 20000) => { const h = await p.waitForSelector(`xpath/${xp}`, { timeout: t }); await h.evaluate((e) => e.scrollIntoView({ block: "center" })); await W(200); await h.click(); };
const get = (u) => p.evaluate(async (u) => (await (await fetch(u, { cache: "no-store" })).json()), u);
const post = (u, body) => p.evaluate(async ({ u, body }) => { const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, idempotencyKey: crypto.randomUUID() }) }); return { ok: r.ok, ...(await r.json()) }; }, { u, body });
const vp = (w) => p.setViewport(w <= 640 ? { width: w, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { width: w, height: 900, deviceScaleFactor: 1 });
const tips = async () => { for (const t of ["Got it", "Dismiss", "OK"]) await click(`.//button[normalize-space(.)="${t}"]`, 600).catch(() => {}); };
const log = new Proxy([], { get(t, k) { if (k === "push") return (...a) => { console.log(...a); return t.push(...a); }; return t[k]; } }); let fails = 0;
setTimeout(() => { console.log("TIMEOUT"); process.exit(2); }, 480000);

// Dealer cards vs every label at the top of the felt (house-edge line, "Dealer", "Showing N",
// printed rules, result banner), and the house-edge line vs the Dealer label. The banner may sit
// over the decorative printed rules; that is intended.
const measure = () => p.evaluate(() => {
  const R = (e) => (e ? e.getBoundingClientRect() : null);
  const hit = (a, b) => a && b && a.width && b.width && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const t = document.querySelector(".bj-table"); if (!t) return { err: "no table" };
  const cards = [...t.querySelectorAll(".dealer-booth .hand > *")].map(R);
  const L = { edge: R(t.querySelector(".math-strip")), dealer: R(t.querySelector(".dealer-booth .seat-name")), showing: R(t.querySelector(".dealer-booth .muted")),
    rulesArc: R(t.querySelector(".bj-felt-rules svg")), rulesSub: R(t.querySelector(".bj-felt-rules .bj-felt-sub")), banner: R(t.querySelector(".table-heart .result-banner")) };
  const out = [];
  for (const c of cards) for (const [n, r] of Object.entries(L)) if (hit(c, r)) out.push(`cards~${n}`);
  for (const [x, y] of [["edge", "dealer"], ["edge", "showing"], ["dealer", "showing"]]) if (hit(L[x], L[y])) out.push(`${x}~${y}`);
  return { cards: cards.length, banner: !!L.banner, overlaps: [...new Set(out)] };
});

await vp(1366);
await p.goto(BASE + "/", { waitUntil: "networkidle2" });
await click('.//button[contains(@class,"home-enter")]').catch(() => {}); await W(900);
await p.goto(BASE + "/signup", { waitUntil: "networkidle2" });
await p.type("#su-name", "Polish Tester"); await p.type("#su-email", email); await p.type("#su-pass", pass);
await p.$eval("input[type=checkbox]", (e) => { if (!e.checked) e.click(); });
await click('.//button[contains(., "Create account")]'); await W(2500);
await click('.//button[contains(., "welcome chips")]', 4000).catch(() => {}); await W(1500);
await click('.//button[contains(., "Skip tour")]', 3000).catch(() => {});

// (2) Session bar before any play, then tournament bets only.
const sessBets = async () => { await p.goto(BASE + "/craps", { waitUntil: "networkidle2" }); await W(1500); return p.$eval(".session-strip-chip", (e) => e.innerText.replace(/\n/g, " ")).catch(() => "no session bar"); };
const live = (await get("/api/tournaments?tab=live")).tournaments;
const bj = live.find((t) => t.game === "blackjack" && t.buyinCents === 0), cr = live.find((t) => t.game === "craps" && t.buyinCents === 0);
let tBets = 0;
if (cr) {
  { const rg = await post(`/api/tournaments/${encodeURIComponent(cr.id)}/register`, {}); if (!rg.ok) log.push(`register craps: ${rg.error}`); }
  for (let i = 0; i < 3; i++) { const a = await post("/api/games/craps", { tournamentId: cr.id, action: "bet", bet: { type: "field", amount: 100 } }); await W(1200); const r = await post("/api/games/craps", { tournamentId: cr.id, action: "roll" }); await W(1200); if (a.ok && r.ok) tBets++; else log.push(`craps api: ${a.error || ""} ${r.error || ""}`); }
}
const s1 = await sessBets();
const m = s1.match(/(\d+) bets?/); const shown = m ? Number(m[1]) : -1;
log.push(`session bar after ${tBets} tournament craps rolls (no wallet bets): "${s1}"`);
if (shown < tBets || tBets === 0) { fails++; log.push("FAIL session bar does not count tournament bets"); }
await p.screenshot({ path: `${OUT}/polish-session-1366.png` });
await vp(390); await p.goto(BASE + "/craps", { waitUntil: "networkidle2" }); await W(1500); await tips();
await p.screenshot({ path: `${OUT}/polish-session-390.png` });

// (1) Dealer cards vs labels, floor and tournament, phone → desktop.
async function bjCheck(url, tag, widths) {
  for (const w of widths) {
    await vp(w);
    await p.goto(BASE + url, { waitUntil: "networkidle2" }); await W(1200); await tips();
    let res = await measure();
    // Play one hand to the end (dealer cards + result banner showing), up to 3 tries.
    for (let k = 0; k < 3 && !(res.cards >= 2 && res.banner); k++) {
      await click('.//button[normalize-space(.)="Deal" or normalize-space(.)="Next hand"]', 3000).catch(() => {});
      await W(2200);
      await click('.//button[contains(., "No insurance") or contains(., "No thanks")]', 500).catch(() => {});
      await click('.//button[normalize-space(.)="Stand" or normalize-space(.)="Stand all"]', 2500).catch(() => {});
      await W(3500); res = await measure();
    }
    await p.$eval(".bj-table", (e) => { e.scrollIntoView({ block: "start" }); window.scrollBy(0, -90); }).catch(() => {}); await W(400);
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    log.push(`${tag} ${w}: dealer cards=${res.cards} banner=${res.banner} overlaps=[${(res.overlaps || []).join(",")}] page overflow=${ov}${res.err ? " " + res.err : ""}`);
    if ((res.overlaps || []).length || ov > 0 || res.cards < 2) fails++;
    if ([390, 1366].includes(w)) await p.screenshot({ path: `${OUT}/polish-bj-${tag}-${w}.png` });
  }
}
await bjCheck("/blackjack", "floor", [320, 390, 430, 640, 768, 1024, 1366, 1920]);
if (bj) { { const rg = await post(`/api/tournaments/${encodeURIComponent(bj.id)}/register`, {}); if (!rg.ok) log.push(`register bj: ${rg.error}`); } await bjCheck(`/blackjack?t=${encodeURIComponent(bj.id)}`, "tny", [390, 1366]); }
log.push(`page errors: ${errors.length ? errors.join(" | ") : "none"}`);
log.push(fails ? `FAILURES: ${fails}` : "ALL OK");

await b.close();
process.exit(fails ? 1 : 0);
