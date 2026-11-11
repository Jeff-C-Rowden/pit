// Table tournaments on a fresh TEST account (@pit.test → users.is_test): Blackjack Chip Race
// (30 hands) and Craps Hot Roll (40 rolls). Real server hands/rolls on the tournament stack,
// a few through the felt UI and the rest through the same endpoint. Checks: wallet untouched,
// strip counts down plays, qualifies, the test account sees its own row marked "test account,
// not ranked" and is NOT counted in entrants; session time picks up tournament play.
//   BASE=https://pit-iota-puce.vercel.app OUT=/workspace/pit-shots node tests/e2e/tournaments-tables.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit-shots";
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
const email = `tables${Date.now()}@pit.test`, pass = "sandbox-pass-1";
const click = async (xp, t = 20000) => { const h = await p.waitForSelector(`xpath/${xp}`, { timeout: t }); await h.evaluate((e) => e.scrollIntoView({ block: "center" })); await W(200); await h.click(); };
const me = () => p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user ?? null);
const get = (u) => p.evaluate(async (u) => (await (await fetch(u, { cache: "no-store" })).json()), u);
const post = (u, body) => p.evaluate(async ({ u, body }) => { const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, idempotencyKey: crypto.randomUUID() }) }); return { ok: r.ok, ...(await r.json()) }; }, { u, body });
const log = [];
const vp = async (w) => p.setViewport(w === 390 ? { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { width: 1366, height: 900, deviceScaleFactor: 1 });
const tips = async () => { for (const t of ["Got it", "Dismiss", "OK"]) await click(`.//button[normalize-space(.)="${t}"]`, 600).catch(() => {}); };
const overflow = () => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const shot = async (name) => p.screenshot({ path: `${OUT}/tourn2-${name}.png` });
const strip = () => p.$eval("[data-testid=tny-strip]", (e) => e.innerText.replace(/\n/g, " ")).catch(() => "missing");

await vp(1366);
await p.goto(BASE + "/", { waitUntil: "networkidle2" });
await click('.//button[contains(@class,"home-enter")]').catch(() => {}); await W(900);
await p.goto(BASE + "/signup", { waitUntil: "networkidle2" });
await p.type("#su-name", "Table Tester"); await p.type("#su-email", email); await p.type("#su-pass", pass);
await p.$eval("input[type=checkbox]", (e) => { if (!e.checked) e.click(); });
await click('.//button[contains(., "Create account")]'); await W(2500);
await click('.//button[contains(., "welcome chips")]', 4000).catch(() => {}); await W(1500);
await click('.//button[contains(., "Skip tour")]', 3000).catch(() => {});
const u0 = await me();
log.push(`account ${email} isTest=${u0?.isTest} cash ${u0?.balanceCents}`);

const liveList = (await get("/api/tournaments?tab=live")).tournaments;
log.push(`live: ${liveList.map((t) => `${t.name} [${t.gameName}, ${t.format}, ${t.fixedPlays ?? "-"} ${t.unit}, entrants ${t.entrants}]`).join("; ")}`);
const fotd = liveList.find((t) => t.template_id === "fotd" || t.name === "Daily Freeroll");
if (fotd) log.push(`Daily Freeroll entrants now (test accounts excluded): ${fotd.entrants}`);
const up = (await get("/api/tournaments?tab=upcoming")).tournaments;
log.push(`upcoming Happy Hour games: ${[...new Set(up.filter((t) => t.name.startsWith("Happy Hour")).map((t) => t.gameName))].join(", ")}`);

// Lobby filtered to tables, both widths
for (const w of [390, 1366]) {
  await vp(w);
  await p.goto(BASE + "/tournaments", { waitUntil: "networkidle2" }); await W(1500); await tips();
  await p.waitForSelector(".tny-filter select", { timeout: 15000 }).catch(async () => { await shot(`debug-${w}`); log.push("debug: " + (await p.evaluate(() => document.body.innerText.slice(0, 300)))); console.log(log.join("\n")); });
  await p.select(".tny-filter select", "tables"); await W(500);
  log.push(`lobby ${w} tables filter: "${await p.$eval(".tny-count", (e) => e.textContent)}" overflow=${await overflow()}`);
  await shot(`lobby-tables-${w}`);
}

async function runTable(tplName, game) {
  const t = liveList.find((x) => x.name === tplName && x.game === game) || liveList.find((x) => x.game === game && x.buyinCents === 0);
  if (!t) { log.push(`FAIL no live ${game} freeroll`); return null; }
  log.push(`${game}: ${t.name} #${t.shortId} ${t.format} plays=${t.fixedPlays} qualify=${t.minQualifyingBets} mode=${t.mode}`);
  await vp(390);
  await p.goto(BASE + `/tournaments?id=${encodeURIComponent(t.id)}`, { waitUntil: "networkidle2" }); await W(1500); await tips();
  await p.$eval("#tny-detail", (e) => e.scrollIntoView({ block: "start" })); await W(400);
  await shot(`${game}-detail-390`);
  await click('.//button[@data-testid="tny-register"]'); await W(400);
  await click('.//button[@data-testid="tny-confirm"]'); await W(2000);
  const href = `${t.gameHref}?t=${encodeURIComponent(t.id)}`;
  await p.goto(BASE + href, { waitUntil: "networkidle2" }); await W(2000); await tips();
  await p.waitForSelector("[data-testid=tny-strip]", { timeout: 15000 });
  log.push(`${game} strip start: ${await strip()}`);
  await p.evaluate(() => window.scrollTo(0, 0)); await W(300);
  await shot(`${game}-start-390`);
  return { t, href };
}

// ── Blackjack Chip Race ──
const bj = await runTable("Blackjack Daily", "blackjack");
if (bj) {
  // 3 hands through the felt: Deal, then Stand until settled
  for (let h = 0; h < 3; h++) {
    await click('.//button[contains(@class,"hero-act") and (normalize-space(.)="Deal" or normalize-space(.)="Next hand")]'); await W(1600);
    for (let k = 0; k < 6; k++) {
      const label = await p.$$eval("button.hero-act", (bs) => bs.map((x) => x.textContent?.trim()));
      if (label.includes("No insurance")) { await click('.//button[normalize-space(.)="No insurance"]'); await W(1200); continue; }
      if (label.includes("Stand")) { await click('.//button[normalize-space(.)="Stand"]'); await W(1500); continue; }
      break;
    }
  }
  await p.evaluate(() => window.scrollTo(0, 0)); await W(300);
  await shot("blackjack-hand-390");
  log.push(`blackjack after UI hands: ${await strip()}`);
  // the rest via the endpoint: deal $1, stand (or decline insurance) until settled
  const res = await p.evaluate(async (tid) => {
    const call = async (body) => { const r = await fetch("/api/games/blackjack", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, tournamentId: tid, idempotencyKey: crypto.randomUUID() }) }); return { ok: r.ok, ...(await r.json()) }; };
    let hands = 0, fails = [], hud = null;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 760));
      let d = await call({ action: "deal", betCents: 100 });
      if (!d.ok) { fails.push(d.error); if (/all 30 hands/.test(d.error || "")) break; continue; }
      let g = d.game; let guard = 0;
      while (g && g.phase !== "settled" && guard++ < 8) { d = await call({ action: g.phase === "insurance" ? "insurance" : "stand", gameId: g.id, take: false }); g = d.game; }
      hands++; hud = d.tournament;
    }
    return { hands, fails: fails.slice(0, 3), hud };
  }, bj.t.id);
  log.push(`blackjack api hands=${res.hands} stop=${JSON.stringify(res.fails)} hud: playsUsed=${res.hud?.playsUsed}/${res.hud?.fixedPlays} betsMade=${res.hud?.betsMade} qualified=${res.hud?.qualified} stack=${res.hud?.stackCents} testAccount=${res.hud?.testAccount} entrants=${res.hud?.entrants}`);
}

// ── Craps Hot Roll ──
const cr = await runTable("Craps Daily", "craps");
if (cr) {
  await vp(1366);
  await p.goto(BASE + cr.href, { waitUntil: "networkidle2" }); await W(1800); await tips();
  for (let i = 0; i < 3; i++) {
    await p.$eval("button.cr-field", (e) => e.click()); await W(900);
    await click('.//button[contains(@class,"hero-act") and normalize-space(.)="Roll"]'); await W(1800);
  }
  await p.evaluate(() => window.scrollTo(0, 0)); await W(300);
  await shot("craps-roll-1366");
  log.push(`craps after UI rolls: ${await strip()}`);
  const res = await p.evaluate(async (tid) => {
    const call = async (body) => { const r = await fetch("/api/games/craps", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, tournamentId: tid, idempotencyKey: crypto.randomUUID() }) }); return { ok: r.ok, ...(await r.json()) }; };
    let rolls = 0, fails = [], hud = null, pts = 0, last = null;
    for (let i = 0; i < 45; i++) {
      await new Promise((r) => setTimeout(r, 760));
      const bt = await call({ action: "bet", bet: { type: "field", amount: 100 } });
      if (!bt.ok) { fails.push(bt.error); if (/all 40 rolls/.test(bt.error || "")) break; continue; }
      const d = await call({ action: "roll" });
      if (!d.ok) { fails.push(d.error); continue; }
      rolls++; pts += d.points || 0; hud = d.tournament; last = d.lastRoll;
    }
    return { rolls, fails: fails.slice(0, 3), hud, pts, last };
  }, cr.t.id);
  log.push(`craps api rolls=${res.rolls} stop=${JSON.stringify(res.fails)} finalRollFlag=${res.last} hud: playsUsed=${res.hud?.playsUsed}/${res.hud?.fixedPlays} betsMade=${res.hud?.betsMade} qualified=${res.hud?.qualified} score=${res.hud?.score} stack=${res.hud?.stackCents} testAccount=${res.hud?.testAccount} entrants=${res.hud?.entrants}`);
}

const u1 = await me();
log.push(`wallet untouched: ${u1.balanceCents === u0.balanceCents && u1.bonusCents === u0.bonusCents ? "OK" : `MISMATCH ${u0.balanceCents}->${u1.balanceCents}`}`);
const sess = await get("/api/session");
log.push(`session after tournament play: active=${sess.session.active} minutes=${sess.session.minutes} net=${sess.session.netCents}`);

for (const [x, game] of [[bj, "blackjack"], [cr, "craps"]]) {
  if (!x) continue;
  for (const w of [390, 1366]) {
    await vp(w);
    await p.goto(BASE + x.href, { waitUntil: "networkidle2" }); await W(2000); await tips();
    await p.waitForSelector("[data-testid=tny-strip]", { timeout: 15000 });
    log.push(`${game} strip ${w}: ${await strip()} overflow=${await overflow()}`);
    await p.evaluate(() => window.scrollTo(0, 0)); await W(300);
    await shot(`${game}-done-${w}`);
    await p.goto(BASE + `/tournaments?id=${encodeURIComponent(x.t.id)}`, { waitUntil: "networkidle2" }); await W(2000); await tips();
    await p.$eval(".tny-board", (e) => e.scrollIntoView({ block: "center" })); await W(400);
    const mine = await p.$eval("[data-testid=tny-my-row]", (e) => e.innerText.replace(/\s+/g, " ")).catch(() => "missing");
    const ent = await p.$eval(".tny-pool", (e) => e.innerText.replace(/\s+/g, " ")).catch(() => "?");
    log.push(`${game} leaderboard ${w}: my row "${mine}" | ${ent} | overflow=${await overflow()}`);
    await shot(`${game}-board-${w}`);
  }
}
log.push(`page errors: ${errors.length ? errors.join(" | ") : "none"}`);
console.log(log.join("\n"));
await b.close();
