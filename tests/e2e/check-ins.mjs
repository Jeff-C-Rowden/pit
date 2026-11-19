// SS5 live check at 390px: opt-in check-ins (time played + session net, Keep playing / Take a break).
// 1) /api/session is private (401 signed out) and reports the budget check-in setting + its choices.
// 2) The Cage (/wallet#time) has the "Session budget check-in" row; the script turns on the smallest budget ($10).
// 3) Real Sundown Trail spins until this session's ledger net reaches −$10 (or MAX spins); then the card shows,
//    and its Time played / Session net equal the server's session figures exactly.
// 4) Card: sandbox chip, limits link + 1-800-GAMBLER · 21+, equal buttons, no countdown / pressure wording,
//    fits 390px; Reduced Motion = no animation. Keep playing hides it and stays hidden after reload.
// 5) Take a break starts the real server pause: card becomes "On a break you chose", new bets are refused.
// Reuses a saved session; never signs up. Places small sandbox-chip spins, and leaves the account on a
// 30-minute break and the budget check-in switching off after the 24-hour cooling-off.
//   BASE=https://pit-iota-puce.vercel.app JAR=/tmp/pot-jar.json OUT=/workspace/pit/screenshots node tests/e2e/check-ins.mjs
import puppeteer from "puppeteer-core";
import { existsSync, readFileSync } from "fs";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit/screenshots";
const JAR = process.env.JAR;
const MAX = Number(process.env.MAX || 120);
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const check = (label, ok, detail = "") => { log.push(`${ok ? "OK  " : "FAIL"} ${label} ${detail}`); if (!ok) process.exitCode = 1; };
const BANNED = /countdown|seconds? left|\bhurry\b|don'?t miss|last chance|win (it )?back|\bchase|\balmost\b|so close|\bdue\b|\bhot\b|\blucky\b|\bstreak|now or never|\bexpires?\b/i;
const fmtNet = (c) => { const a = `$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; return c > 0 ? `+${a}` : c < 0 ? `−${a}` : a; };
const fmtPlayed = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr ${m % 60} min`);

if (!JAR || !existsSync(JAR)) throw new Error("JAR with a saved session is required (this script never signs up)");
const anon = await fetch(`${BASE}/api/session`);
check("signed out: /api/session is 401", anon.status === 401, String(anon.status));

const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await p.setCookie(...JSON.parse(readFileSync(JAR, "utf8")));
await p.goto(BASE + "/floor", { waitUntil: "networkidle2" });
const me = await p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user ?? null);
if (!me) throw new Error("saved session expired; not signing up");
// first-visit sheets (welcome tour) can sit over the page on a fresh device; close them like a player would
const skipTour = async () => { await p.evaluate(() => { for (const t of ["Skip tour", "Skip chips"]) [...document.querySelectorAll("button, a")].find((x) => x.textContent.trim() === t)?.click(); document.querySelector(".first-tip-ok")?.click(); }); await W(400); };
const sess = () => p.evaluate(async () => (await fetch("/api/session", { cache: "no-store" })).json());

// 1) API shape
let s = await sess();
check("API reports the budget check-in + choices", s.budget && "cents" in s.budget && JSON.stringify(s.choices.budget) === "[1000,2500,5000,10000,25000]", JSON.stringify(s.budget));
if (s.breakUntil) { console.log(`Account is already on a break until ${s.breakUntil}; rerun after it ends.`); await b.close(); process.exit(2); }

// 2) Cage row + turn on $10 through the real UI
await p.goto(BASE + "/wallet#time", { waitUntil: "networkidle2" }); await W(800);
const row = await p.$('[data-testid="budget-row"]');
check("Cage shows the Session budget check-in row", !!row);
if (row) {
  const txt = await p.$eval('[data-testid="budget-row"]', (e) => e.innerText);
  check("Cage row: off unless chosen, from the ledger, no countdown", /Off unless you choose/.test(txt) && /ledger/.test(txt) && /No countdown/.test(txt), txt.replace(/\s+/g, " ").slice(0, 120));
  await p.select('select[aria-label="Session budget check-in amount"]', "1000");
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.textContent === "Save time settings")?.click());
  await W(1500);
}
s = await sess();
check("budget check-in is on at $10 (server)", s.budget.cents === 1000, JSON.stringify(s.budget));

// 3) real spins until the session's ledger net reaches −$10
let spins = 0;
while (spins < MAX && !(s.session.active && s.session.netCents <= -1000)) {
  const r = await p.evaluate(async (k) => { const r = await fetch("/api/games/slot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ coinCents: 100, idempotencyKey: k }) }); return { status: r.status, body: await r.json() }; }, `ss5-${Date.now()}-${spins}`);
  if (r.status !== 200) { check("spin accepted", false, JSON.stringify(r).slice(0, 200)); break; }
  spins++;
  if (spins % 5 === 0) s = await sess();
}
s = await sess();
check(`session net reached the $10 budget after ${spins} real spins`, s.session.active && s.session.netCents <= -1000, `net=${s.session.netCents}`);

await p.goto(BASE + "/floor", { waitUntil: "networkidle2" });
await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("pit.checkin.") || k.startsWith("pit.rc.")) localStorage.removeItem(k); });
await p.reload({ waitUntil: "networkidle2" });
await p.waitForSelector('[data-testid="checkin-card"]', { timeout: 15000 }).catch(() => {});
await skipTour();
s = await sess();
const card = await p.evaluate(() => {
  const c = document.querySelector('[data-testid="checkin-card"]');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { text: c.innerText, played: c.querySelector('[data-testid="ci-played"]')?.textContent, net: c.querySelector('[data-testid="ci-net"]')?.textContent,
    cents: Number(c.querySelector('[data-testid="ci-net"]')?.getAttribute("data-cents")), chip: !!c.querySelector('[data-testid="sandbox-chip"]'),
    link: !!c.querySelector('a[href="/wallet#time"]'), btns: [...c.querySelectorAll(".reality-acts button")].map((x) => [x.textContent, x.className]),
    anim: getComputedStyle(c).animationName, fits: r.left >= 0 && r.right <= innerWidth + 0.5 && document.documentElement.scrollWidth <= innerWidth };
});
check("check-in card shows", !!card);
if (card) {
  check("Session net = server ledger net", card.cents === s.session.netCents && card.net === fmtNet(s.session.netCents), `${card.net} vs ${fmtNet(s.session.netCents)}`);
  check("Time played = server session minutes", card.played === fmtPlayed(s.session.minutes) || card.played === fmtPlayed(s.session.minutes - 1), `${card.played} vs ${s.session.minutes} min`);
  check("says why: the $10 budget the player set", /session budget check-in of \$10/.test(card.text), card.text.replace(/\s+/g, " ").slice(0, 200));
  check("Sandbox chip + limits link + 1-800-GAMBLER · 21+", card.chip && card.link && /1-800-GAMBLER · 21\+/.test(card.text));
  check("equal Keep playing / Take a break buttons", card.btns.length === 2 && card.btns[0][0] === "Keep playing" && card.btns[1][0] === "Take a break" && card.btns[0][1] === card.btns[1][1], JSON.stringify(card.btns));
  check("no countdown / pressure wording", !BANNED.test(card.text) && /no timer/.test(card.text), (card.text.match(BANNED) || [""])[0]);
  check("fits 390px", card.fits);
  check("gentle fade-in when motion is allowed", card.anim === "ci-in", card.anim);
  await p.$eval('[data-testid="checkin-card"]', (e) => e.scrollIntoView({ block: "start" })); await W(700);
  await p.screenshot({ path: `${OUT}/ss5-check-in-390.png` });
}
await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
await p.reload({ waitUntil: "networkidle2" }); await p.waitForSelector('[data-testid="checkin-card"]', { timeout: 15000 }).catch(() => {});
const rm = await p.evaluate(() => { const c = document.querySelector('[data-testid="checkin-card"]'); return c ? getComputedStyle(c).animationName : "missing"; });
check("Reduced Motion: no animation", rm === "none", rm);
await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);

// Keep playing: hides and stays hidden for this budget step
await skipTour();
await p.click('[data-testid="ci-keep"]').catch((e) => console.log("keep click:", e.message)); await W(400);
const gone = await p.evaluate(() => !document.querySelector('[data-testid="checkin-card"]'));
await p.reload({ waitUntil: "networkidle2" }); await W(2500);
const still = await p.evaluate(() => !document.querySelector('[data-testid="checkin-card"]'));
check("Keep playing hides it, and it stays hidden after reload", gone && still);

// 5) Take a break: bring the card back (clear the remembered acknowledgement) and tap it
await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("pit.checkin.")) localStorage.removeItem(k); });
await p.reload({ waitUntil: "networkidle2" }); await p.waitForSelector('[data-testid="ci-break"]', { timeout: 15000 }).catch(() => {});
await skipTour();
await p.click('[data-testid="ci-break"]').catch((e) => console.log("break click:", e.message));
await p.waitForSelector('[data-testid="break-note"]', { timeout: 15000 }).catch(() => {});
const note = await p.evaluate(() => document.querySelector('[data-testid="break-note"]')?.innerText ?? "");
s = await sess();
const mins = s.breakUntil ? (Date.parse(s.breakUntil) - Date.now()) / 60000 : 0;
check("Take a break: server pause of about 30 minutes started", s.breakKind === "break" && mins > 28 && mins <= 31, `${s.breakUntil} (${mins.toFixed(1)} min)`);
check("card turns into 'On a break you chose' with the reopening time (no countdown)", /On a break you chose/.test(note) && /New bets open at/.test(note) && !BANNED.test(note), note.replace(/\s+/g, " ").slice(0, 160));
const refused = await p.evaluate(async () => { const r = await fetch("/api/games/slot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ coinCents: 100, idempotencyKey: `ss5-brk-${Date.now()}` }) }); return { status: r.status, body: await r.text() }; });
check("new bets are refused during the break", refused.status >= 400 && /break/i.test(refused.body), `${refused.status} ${refused.body.slice(0, 120)}`);

// cleanup: ask to turn the budget check-in off (applies after the 24-hour cooling-off, by design)
const off = await p.evaluate(async () => (await (await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ budgetCents: null }) })).json()));
check("turning it off follows the 24-hour cooling-off", off.result?.budget?.applied === "pending" && off.budget?.pending?.cents === null, JSON.stringify(off.budget));
check("no page errors", errors.length === 0, errors.join(" | "));
await b.close();
console.log(log.join("\n"));
console.log(`${log.filter((l) => l.startsWith("OK")).length}/${log.length} checks passed`);
