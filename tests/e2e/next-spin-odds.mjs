// JD1 live check at 390px: next-spin odds under each Antler Ridge meter.
// 1) /vault: one .nso-line per meter (Mini/Minor/Major/Grand); each line's exact ratio (data-num/den) and
//    text equal an independent re-derivation from the LIVE meter values (GET /api/games/slot-progressive,
//    read in the same instant) and the current bet: must-hit = E[min(c+d, N)]/N with c the unbiased
//    contribution (floor(bet*bps/1e4) +1 w.p. remainder), N = C-V (or C-S+1 at a fresh reseed, d=1),
//    capped at 1; Grand = bet / (mysteryOddsPerSpin * 900). Display never above the exact chance.
// 2) Tapping "Coin value up" updates every line to the new bet. Note + "Sandbox / test chips" present,
//    no due/hot/almost wording, no horizontal overflow, the strip fits at 390px.
// 3) /floor lobby strip shows the same lines at the $9 reference bet.
// Reuses a saved session; never signs up; places no bets.
//   BASE=https://pit-iota-puce.vercel.app JAR=/tmp/pot-jar.json OUT=/workspace/pit/screenshots node tests/e2e/next-spin-odds.mjs
import puppeteer from "puppeteer-core";
import { existsSync, readFileSync } from "fs";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit/screenshots";
const JAR = process.env.JAR;
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const check = (label, ok, detail = "") => { log.push(`${ok ? "OK  " : "FAIL"} ${label} ${detail}`); if (!ok) process.exitCode = 1; };
const BANNED = /\b(due|hot|almost|about to hit|overdue|soon|streak)\b/i;

function expected(meter, tier, bet) {
  if (tier.ceilingCents == null) {
    const M = tier.mysteryOddsPerSpin * 900;
    return bet >= M ? [1, 1] : [bet, M];
  }
  const V = meter.progressiveCents, S = meter.seedCents, C = meter.ceilingCents;
  const d = V <= S ? 1 : 0;
  const N = C - (d ? S - 1 : V);
  if (N <= 0) return [1, 1];
  const exact = bet * tier.contributionBps, base = Math.floor(exact / 1e4), rem = exact - base * 1e4;
  const num = (1e4 - rem) * Math.min(base + d, N) + rem * Math.min(base + 1 + d, N);
  return num >= 1e4 * N ? [1, 1] : [num, 1e4 * N];
}
function fmt([n, d]) {
  if (n >= d) return "100%";
  if (n * 10 >= d) return `${Math.floor((n * 100) / d)}%`;
  if (n * 100 >= d) return `${(Math.floor((n * 1000) / d) / 10).toFixed(1)}%`;
  return `1 in ${Math.ceil(d / n).toLocaleString("en-US")}`;
}
function shown(s) { const m = s.match(/^(\d+(?:\.\d)?)%$/); if (m) return +m[1] / 100; return 1 / +s.replace(/^1 in /, "").replace(/,/g, ""); }

const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
if (!JAR || !existsSync(JAR)) throw new Error("JAR with a saved session is required (this script never signs up)");
await p.setCookie(...JSON.parse(readFileSync(JAR, "utf8")));
await p.goto(BASE + "/vault", { waitUntil: "networkidle2" });
const u0 = await p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user ?? null);
if (!u0) throw new Error("saved session expired; not signing up");
await p.evaluate(() => document.querySelector(".first-tip-ok")?.click()); await W(300);
await p.waitForSelector(".nso-line", { timeout: 20000 }); await W(3200);

async function snapshot() {
  // Read live meters from the API and the page's lines; retry until the page has caught up (polls every 2.5s).
  for (let tries = 0; tries < 6; tries++) {
    const s = await p.evaluate(async () => {
      const api = await (await fetch("/api/games/slot-progressive", { cache: "no-store" })).json();
      await new Promise((r) => setTimeout(r, 2800));
      const api2 = await (await fetch("/api/games/slot-progressive", { cache: "no-store" })).json();
      const lines = [...document.querySelectorAll(".prog-strip .nso-line")].map((e) => ({ tier: e.dataset.tier, num: +e.dataset.num, den: +e.dataset.den, text: e.querySelector(".nso-val").textContent.trim(), label: e.textContent.trim() }));
      const note = document.querySelector(".nso-note")?.textContent || "";
      return { meters: api2.meters, same: JSON.stringify(api.meters) === JSON.stringify(api2.meters), tiers: api2.info.tiers, lines, note };
    });
    if (s.same) return s;
  }
  throw new Error("meters kept moving; could not get a stable read");
}
const betFromNote = (note) => Math.round(parseFloat(note.match(/for a \$([\d,.]+) bet/)[1].replace(/,/g, "")) * 100);

async function verify(tag) {
  const s = await snapshot();
  const bet = betFromNote(s.note);
  check(`${tag}: four odds lines`, s.lines.length === 4, s.lines.map((l) => l.tier).join(","));
  for (const l of s.lines) {
    const m = s.meters.find((x) => x.id === l.tier), t = s.tiers.find((x) => x.id === l.tier);
    const [en, ed] = expected(m, t, bet);
    const ok = l.num * ed === en * l.den;
    const txt = fmt([en, ed]);
    check(`${tag}: ${t.name} exact chance = formula at bet $${(bet / 100).toFixed(2)}, meter $${(m.progressiveCents / 100).toFixed(2)}`, ok, `${l.num}/${l.den} vs ${en}/${ed}`);
    check(`${tag}: ${t.name} text "${l.text}" = "${txt}" and not above exact`, l.text === txt && shown(l.text) <= en / ed + 1e-15);
    check(`${tag}: ${t.name} neutral wording`, !BANNED.test(l.label));
  }
  check(`${tag}: note present, neutral, says every spin has this chance`, /Every spin has this chance/.test(s.note) && !BANNED.test(s.note), s.note.slice(0, 60));
  return bet;
}

const bet1 = await verify("vault");
const sandbox = await p.evaluate(() => document.querySelector(".cab-topper, .vault-page")?.textContent.includes("Sandbox"));
check("sandbox chip / label in topper", !!sandbox);
check("note says Sandbox / test chips", await p.$eval(".nso-note", (e) => e.textContent.includes("Sandbox / test chips")));
await p.evaluate(() => document.querySelector('button[aria-label="Coin value up"]')?.click()); await W(600);
const bet2 = await verify("after coin up");
check("bet changed and lines followed", bet2 > bet1, `$${bet1 / 100} → $${bet2 / 100}`);
await p.evaluate(() => document.querySelector('button[aria-label="Coin value down"]')?.click()); await W(400);

const fit = await p.evaluate(() => {
  const strip = document.querySelector(".prog-strip").getBoundingClientRect();
  const lines = [...document.querySelectorAll(".prog-strip .nso-line")].map((e) => {
    const r = e.getBoundingClientRect(), tile = e.closest(".prog-tier").getBoundingClientRect(), v = e.querySelector(".nso-val");
    return r.left >= tile.left - 1 && r.right <= tile.right + 1 && v.scrollWidth <= v.clientWidth + 1;
  });
  return { overflowX: document.documentElement.scrollWidth > innerWidth + 1, left: strip.left, right: strip.right, iw: innerWidth, lines };
});
check("390px: no page overflow, strip in viewport, each line fits its tile untruncated", !fit.overflowX && fit.left >= -1 && fit.right <= fit.iw + 1 && fit.lines.every(Boolean), JSON.stringify(fit));
await p.$eval(".prog-strip", (e) => e.scrollIntoView({ block: "start" })); await p.evaluate(() => window.scrollBy(0, -70)); await W(500);
await p.screenshot({ path: `${OUT}/jd1-next-spin-odds-390.png` });

// Lobby strip at the $9 reference bet.
await p.goto(BASE + "/floor", { waitUntil: "networkidle2" });
await p.waitForSelector(".vault-lobby-tier .nso-line", { timeout: 20000 }); await W(1500);
const lob = await p.evaluate(async () => {
  const api = await (await fetch("/api/games/slot-progressive", { cache: "no-store" })).json();
  await new Promise((r) => setTimeout(r, 4500));
  const lines = [...document.querySelectorAll(".vault-lobby-tier .nso-line")].map((e) => ({ tier: e.dataset.tier, num: +e.dataset.num, den: +e.dataset.den, text: e.querySelector(".nso-val").textContent.trim() }));
  return { meters: api.meters, tiers: api.info.tiers, lines, note: document.querySelector(".vault-lobby-prog .nso-note")?.textContent || "", overflowX: document.documentElement.scrollWidth > innerWidth + 1 };
});
check("lobby: four lines", lob.lines.length === 4);
check("lobby: note at $9.00 reference with sandbox label", /\$9\.00 bet/.test(lob.note) && lob.note.includes("Sandbox / test chips") && !BANNED.test(lob.note));
for (const l of lob.lines) {
  const m = lob.meters.find((x) => x.id === l.tier), t = lob.tiers.find((x) => x.id === l.tier);
  const [en, ed] = expected(m, t, 900);
  check(`lobby: ${t.name} = formula at $9`, l.num * ed === en * l.den && l.text === fmt([en, ed]), `${l.text}`);
}
check("lobby 390px: no overflow", !lob.overflowX);
check("no page errors", errors.length === 0, errors.join(" | "));
console.log(log.join("\n"));
await b.close();
