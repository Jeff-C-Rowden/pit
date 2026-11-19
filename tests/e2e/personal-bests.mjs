// SS4 live check at 390px: private "Your bests" per machine.
// 1) /api/bests is private: 401 signed out, 404 for unknown machines, no-store, and for the saved player
//    returns all 12 machines with the right labels and no ranking / comparison fields.
// 2) Every machine page shows the "Your bests" button to the signed-in player; nothing opens by itself.
// 3) Real Sundown Trail spins (smallest coin): after N spins the panel's Spins played rises by exactly N and
//    Biggest win equals max(previous best, the biggest server-settled win) — straight from the server's results.
// 4) Panel: Sandbox chip, private note, limits link + 1-800-GAMBLER, no pressure wording, fits 390px.
// Reuses a saved session; never signs up. Places a few small sandbox-chip spins.
//   BASE=https://pit-iota-puce.vercel.app JAR=/tmp/pot-jar.json OUT=/workspace/pit/screenshots node tests/e2e/personal-bests.mjs
import puppeteer from "puppeteer-core";
import { existsSync, readFileSync } from "fs";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit/screenshots";
const JAR = process.env.JAR;
const SPINS = Number(process.env.SPINS || 6);
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const check = (label, ok, detail = "") => { log.push(`${ok ? "OK  " : "FAIL"} ${label} ${detail}`); if (!ok) process.exitCode = 1; };
const MACHINES = { slot: "Sundown Trail", vault: "Antler Ridge", buckshot: "Buckshot Bars", bounty: "Bounty Bars", mine: "Canary Creek Mine", clover: "Kettle of Clover", prairie: "Thunderhoof Prairie", blackjack: "Blackjack", holdem: "Texas Hold'em", paigow: "Pai Gow Poker", roulette: "Roulette", craps: "Craps" };
const BONUS = new Set(["vault", "mine", "clover", "prairie"]);
const BANNED = /\bbeat\b|\bstreak|\bdaily\b|\bgoal|leaderboard|\brank|\btop\b|challenge|\bcan you\b|next time|keep (going|spinning|playing)|\balmost\b|so close|new (best|record)|\brecord\b|\bhot\b|\bdue\b|\blucky\b|\bunlock|\bchase|better than/i;

if (!JAR || !existsSync(JAR)) throw new Error("JAR with a saved session is required (this script never signs up)");

// 1a) signed out
const anon = await fetch(`${BASE}/api/bests?game=slot`);
check("signed out: /api/bests is 401", anon.status === 401, String(anon.status));

const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await p.setCookie(...JSON.parse(readFileSync(JAR, "utf8")));
let results = [];
p.on("response", async (r) => {
  if (r.url().endsWith("/api/games/slot") && r.request().method() === "POST") {
    try { const body = JSON.parse(r.request().postData() || "{}"); const d = await r.json(); if (d.spin) results.push({ bet: body.coinCents * 9, win: d.spin.winCents || 0 }); } catch {}
  }
});
await p.goto(BASE + "/floor", { waitUntil: "networkidle2" });
const me = await p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user ?? null);
if (!me) throw new Error("saved session expired; not signing up");

// 1b) API for all 12 machines
const api = await p.evaluate(async (ids) => {
  const out = {};
  for (const id of ids) { const r = await fetch(`/api/bests?game=${id}`, { cache: "no-store" }); out[id] = { status: r.status, cc: r.headers.get("cache-control"), body: await r.json() }; }
  const bad = await fetch("/api/bests?game=__proto__"); out.__bad = bad.status;
  return out;
}, Object.keys(MACHINES));
check("unknown machine is 404", api.__bad === 404, String(api.__bad));
for (const [id, name] of Object.entries(MACHINES)) {
  const a = api[id], d = a.body.bests;
  const ok = a.status === 200 && /no-store/.test(a.cc || "") && a.body.private === true && a.body.sandbox === true && d.name === name && Number.isInteger(d.count) && d.count >= 0
    && (BONUS.has(id) ? d.bonuses && Number.isInteger(d.bonuses.total) : d.bonuses === null)
    && (d.biggestWin === null || d.biggestWin.cents > 0)
    && !/rank|leader|percentile|others|average/i.test(Object.keys(d).join(","));
  check(`/api/bests ${id}`, ok, `count=${d?.count} best=${d?.biggestWin?.cents ?? "-"} bonuses=${d?.bonuses ? d.bonuses.total : "n/a"}`);
}

// 2) the button on every machine page, nothing auto-opened
for (const id of Object.keys(MACHINES)) {
  await p.goto(`${BASE}/${id}`, { waitUntil: "networkidle2" }); await W(600);
  const s = await p.evaluate(() => ({ btn: !!document.querySelector('[data-testid="your-bests-open"]'), panel: !!document.querySelector('[data-testid="your-bests"]'), over: document.documentElement.scrollWidth > innerWidth + 1 }));
  check(`/${id}: Your bests button, closed by default, no overflow`, s.btn && !s.panel && !s.over, JSON.stringify(s));
}

// 3) real spins move the figures by exactly what the server settled
await p.goto(BASE + "/slot", { waitUntil: "networkidle2" });
await p.evaluate(() => document.querySelector(".first-tip-ok")?.click()); await W(400);
for (let i = 0; i < 8; i++) { const ok = await p.$eval('button[aria-label="Coin value down"]', (e) => { if (e.disabled) return false; e.click(); return true; }); if (!ok) break; await W(150); }
async function readPanel() {
  await p.$eval('[data-testid="your-bests-open"]', (e) => e.click());
  await p.waitForFunction(() => document.querySelector('[data-testid="yb-count"], [data-testid="yb-empty"]'), { timeout: 15000 });
  const v = await p.evaluate(() => {
    const t = (s) => document.querySelector(s)?.textContent || "";
    const cents = (s) => { const m = s.replace(/,/g, "").match(/\$(\d+)\.(\d\d)/); return m ? Number(m[1]) * 100 + Number(m[2]) : null; };
    const count = document.querySelector('[data-testid="yb-empty"]') ? 0 : Number(t('[data-testid="yb-count"] .yb-big').replace(/,/g, ""));
    return { count, best: cents(t('[data-testid="yb-win"] .yb-big')), text: document.querySelector('[data-testid="your-bests"]').innerText };
  });
  return v;
}
const before = await readPanel();
check("panel matches the API before spinning", before.count === api.slot.body.bests.count && before.best === (api.slot.body.bests.biggestWin?.cents ?? null), JSON.stringify({ count: before.count, best: before.best }));
await p.click(".yb-close"); await W(200);
results = [];
for (let i = 0; i < SPINS; i++) {
  const n = results.length;
  await p.click('button[aria-label="Spin"]');
  for (let k = 0; k < 80 && results.length === n; k++) await W(100);
  await p.waitForFunction(() => !document.querySelector('button[aria-label="Stop reels"]'), { timeout: 15000 });
  await W(1200);
}
check(`${SPINS} real spins settled by the server`, results.length === SPINS, JSON.stringify(results));
const maxWin = Math.max(0, ...results.map((r) => r.win));
const after = await readPanel();
check("Spins played rose by exactly the spins played", after.count === before.count + results.length, `${before.count} → ${after.count}`);
const wantBest = Math.max(before.best ?? 0, maxWin) || null;
check("Biggest win = max(previous best, biggest server-settled win)", after.best === wantBest, `want ${wantBest} got ${after.best} (session max ${maxWin})`);

// 4) panel content + layout
const txt = after.text;
check("panel shows the three figures", /Biggest win/i.test(txt) && /Bonuses triggered/i.test(txt) && /Spins played/i.test(txt));
check("Sundown Trail says it has no bonus round (no fake zero)", /no bonus round/i.test(txt));
check("private note: only you, never compared", /Only you can see this/.test(txt) && /never compared/.test(txt));
check("Sandbox chip inside the panel", await p.$eval('[data-testid="your-bests"]', (e) => !!e.querySelector('[data-testid="sandbox-chip"]')));
check("limits link + 1-800-GAMBLER · 21+", /Limits & breaks/.test(txt) && /1-800-GAMBLER/.test(txt) && /21\+/.test(txt));
check("no pressure / comparison wording", !BANNED.test(txt), (txt.match(BANNED) || [""])[0]);
const fit = await p.$eval('[data-testid="your-bests"]', (e) => { const r = e.getBoundingClientRect(); const cells = [...e.querySelectorAll(".yb-cell")].every((c) => c.scrollWidth <= c.clientWidth + 1); return { inside: r.left >= 0 && r.right <= innerWidth + 0.5, page: document.documentElement.scrollWidth <= innerWidth, cells }; });
check("panel fits 390px (no page or cell overflow)", fit.inside && fit.page && fit.cells, JSON.stringify(fit));
await p.$eval('[data-testid="your-bests"]', (e) => e.scrollIntoView({ block: "center" })); await W(400);
await p.screenshot({ path: `${OUT}/ss4-personal-bests-390.png` });

// a bonus machine's panel shows a real count with its kinds
await p.goto(BASE + "/mine", { waitUntil: "networkidle2" }); await W(500);
await p.evaluate(() => document.querySelector(".first-tip-ok")?.click());
await p.$eval('[data-testid="your-bests-open"]', (e) => e.click());
await p.waitForFunction(() => document.querySelector('[data-testid="yb-count"], [data-testid="yb-empty"]'), { timeout: 15000 }).catch(async () => console.log("MINE DEBUG", await p.evaluate(() => document.querySelector('[data-testid="your-bests"]')?.innerText ?? "no panel")));
const mine = await p.evaluate(() => document.querySelector('[data-testid="your-bests"]').innerText);
const mApi = api.mine.body.bests;
check("Mine panel bonus count matches the API", mApi.count === 0 ? /Nothing here yet/.test(mine) : new RegExp(`Bonuses triggered\\s*${mApi.bonuses.total.toLocaleString("en-US")}`, "i").test(mine), mine.replace(/\s+/g, " ").slice(0, 160));
check("no page errors", errors.length === 0, errors.join(" | "));
await b.close();
console.log(log.join("\n"));
console.log(`${log.filter((l) => l.startsWith("OK")).length}/${log.length} checks passed`);
