// Tournament tour on a fresh sandbox account: lobby (live tab), Daily Freeroll detail, register,
// play real qualifying Buckshot Bars spins on the tournament stack (UI spins, then the rest
// through the same game endpoint with pacing), strip shows Qualified, leaderboard shows the user.
// Nothing is staged; the board shows only real entrants.
//   BASE=https://pit-iota-puce.vercel.app OUT=/workspace/pit-shots node tests/e2e/tournaments.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit-shots";
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
const email = `tourn${Date.now()}@pit.test`, pass = "sandbox-pass-1";
const click = async (xp, t = 20000) => { const h = await p.waitForSelector(`xpath/${xp}`, { timeout: t }); await h.evaluate((e) => e.scrollIntoView({ block: "center" })); await W(200); await h.click(); };
const me = () => p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user ?? null);
const log = [];
const vp = async (w) => p.setViewport(w === 390 ? { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { width: 1366, height: 900, deviceScaleFactor: 1 });
const tips = async () => { for (const t of ["Got it", "Dismiss", "OK"]) await click(`.//button[normalize-space(.)="${t}"]`, 600).catch(() => {}); };
const overflow = () => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const shot = async (name) => p.screenshot({ path: `${OUT}/tourn-${name}.png` });

await vp(1366);
await p.goto(BASE + "/", { waitUntil: "networkidle2" });
await click('.//button[contains(@class,"home-enter")]').catch(() => {}); await W(900);
await p.goto(BASE + "/signup", { waitUntil: "networkidle2" });
await p.type("#su-name", "Tourney"); await p.type("#su-email", email); await p.type("#su-pass", pass);
await p.$eval("input[type=checkbox]", (e) => { if (!e.checked) e.click(); });
await click('.//button[contains(., "Create account")]'); await W(2500);
await click('.//button[contains(., "welcome chips")]', 4000).catch(() => {}); await W(1500);
await click('.//button[contains(., "Skip tour")]', 3000).catch(() => {});
const u0 = await me();
log.push(`account ${email} cash ${u0?.balanceCents} bonus ${u0?.bonusCents}`);

// Lobby at both widths
let list;
for (const w of [390, 1366]) {
  await vp(w);
  await p.goto(BASE + "/tournaments", { waitUntil: "networkidle2" }); await W(1500); await tips();
  list = await p.evaluate(async () => (await (await fetch("/api/tournaments?tab=live")).json()).tournaments);
  const up = await p.evaluate(async () => (await (await fetch("/api/tournaments?tab=upcoming")).json()).tournaments);
  const count = await p.$eval(".tny-count", (e) => e.textContent).catch(() => "missing");
  log.push(`lobby ${w}: "${count}" live=${list.length} upcoming=${up.length} overflow=${await overflow()}`);
  await shot(`lobby-${w}`);
}
log.push(`live: ${list.map((t) => `${t.name} [${t.gameName}, ${t.buyinCents ? "$" + t.buyinCents / 100 : "free"}, ${t.mode}, ${t.prizeType}, entrants ${t.entrants}, pool ${t.poolCents}]`).join("; ")}`);
const fr = list.find((t) => t.buyinCents === 0 && t.game === "buckshot" && Date.parse(t.regClosesAt) > Date.now()) || list.find((t) => t.buyinCents === 0 && Date.parse(t.regClosesAt) > Date.now());
if (!fr) { log.push("FAIL no open live freeroll"); console.log(log.join("\n")); await b.close(); process.exit(1); }
log.push(`joining ${fr.name} #${fr.shortId} (${fr.game}) qualify=${fr.minQualifyingBets}`);

// Detail + register (390)
await vp(390);
await p.goto(BASE + `/tournaments?id=${encodeURIComponent(fr.id)}`, { waitUntil: "networkidle2" }); await W(1800); await tips();
await p.$eval("#tny-detail", (e) => e.scrollIntoView({ block: "start" })); await W(500);
await shot("detail-390");
await click('.//button[@data-testid="tny-register"]'); await W(400);
await shot("confirm-390");
await click('.//button[@data-testid="tny-confirm"]'); await W(2000);
const u1 = await me();
log.push(`registered: cash ${u0.balanceCents}->${u1.balanceCents} (freeroll, should be unchanged)`);
await p.$eval("#tny-detail", (e) => e.scrollIntoView({ block: "start" })); await W(400);
await shot("registered-390");

// Play: a few real UI spins, then the rest via the same endpoint (700 ms server pacing)
const playUrl = `${fr.gameHref}?t=${encodeURIComponent(fr.id)}`;
await p.goto(BASE + playUrl, { waitUntil: "networkidle2" }); await W(2000); await tips();
await p.waitForSelector("[data-testid=tny-strip]", { timeout: 15000 });
const before = await p.$eval("[data-testid=tny-strip]", (e) => e.innerText.replace(/\n/g, " "));
log.push(`strip before: ${before}`);
await p.evaluate(() => window.scrollTo(0, 0)); await W(300);
await shot("strip-start-390");
const api = fr.game === "buckshot" ? "/api/games/buckshot" : fr.game === "slot" ? "/api/games/slot" : "/api/games/roulette";
const uiSpins = fr.game === "roulette" ? 0 : 5;
for (let i = 0; i < uiSpins; i++) {
  const res = p.waitForResponse((r) => r.url().includes(api) && r.request().method() === "POST", { timeout: 20000 });
  await p.$eval("[data-cab-spin]", (e) => e.click());
  const body = await (await res).json();
  if (!body.tournament) log.push(`ui spin ${i + 1}: ${JSON.stringify(body).slice(0, 200)}`);
  await p.waitForFunction(() => !document.querySelector(".bb-reel.moving"), { timeout: 20000 }).catch(() => {}); await W(900);
}
const cashBeforePlay = (await me()).balanceCents;
const need = fr.minQualifyingBets - uiSpins;
const res = await p.evaluate(async ({ api, tid, need, game }) => {
  const out = { ok: 0, fail: [], last: null };
  for (let i = 0; i < need + 3 && out.ok < need; i++) {
    await new Promise((r) => setTimeout(r, 760));
    const body = game === "buckshot" ? { coins: 1, denomCents: 25 } : game === "slot" ? { coinCents: 25 } : { bets: [{ kind: "red", label: "Red", amountCents: 25 }] };
    const r = await fetch(api, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, tournamentId: tid, idempotencyKey: crypto.randomUUID() }) });
    const j = await r.json();
    if (r.ok && j.tournament) { out.ok++; out.last = j.tournament; } else out.fail.push(j.error || r.status);
  }
  return out;
}, { api, tid: fr.id, need, game: fr.game });
log.push(`api spins ok=${res.ok} fails=${JSON.stringify(res.fail.slice(0, 5))} hud: betsMade=${res.last?.betsMade} qualified=${res.last?.qualified} stack=${res.last?.stackCents} rank=${res.last?.rank}`);
const cashAfterPlay = (await me()).balanceCents;
log.push(`wallet untouched by tournament play: ${cashBeforePlay === cashAfterPlay ? "OK" : `MISMATCH ${cashBeforePlay}->${cashAfterPlay}`}`);

for (const w of [390, 1366]) {
  await vp(w);
  await p.goto(BASE + playUrl, { waitUntil: "networkidle2" }); await W(2000); await tips();
  await p.waitForSelector("[data-testid=tny-strip]", { timeout: 15000 });
  const s = await p.$eval("[data-testid=tny-strip]", (e) => e.innerText.replace(/\n/g, " "));
  log.push(`strip ${w}: ${s} overflow=${await overflow()}`);
  await p.evaluate(() => window.scrollTo(0, 0)); await W(300);
  await shot(`strip-qualified-${w}`);
  await p.goto(BASE + `/tournaments?id=${encodeURIComponent(fr.id)}`, { waitUntil: "networkidle2" }); await W(2000); await tips();
  await p.$eval(".tny-board", (e) => e.scrollIntoView({ block: "center" })); await W(400);
  const mine = await p.$eval("[data-testid=tny-my-row]", (e) => e.innerText.replace(/\s+/g, " ")).catch(() => "missing");
  log.push(`leaderboard ${w}: my row "${mine}" overflow=${await overflow()}`);
  await shot(`leaderboard-${w}`);
}
await vp(1366);
await p.goto(BASE + "/tournaments?tab=upcoming", { waitUntil: "networkidle2" }); await W(1500);
await shot("upcoming-1366");
log.push(`page errors: ${errors.length ? errors.join(" | ") : "none"}`);
console.log(log.join("\n"));
await b.close();
