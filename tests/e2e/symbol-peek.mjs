// Slot Scout S2 live check at 390px: long-press a stopped-reel symbol on
// Sundown Trail, Thunderhoof Prairie and Kettle of Clover; the peek must show
// pays at the current bet, stay on screen, and dismiss on release. Also open
// the Info sheet on Sundown. Reuses a saved session; never signs up.
//   BASE=https://pit-iota-puce.vercel.app JAR=/tmp/pot-jar.json OUT=/workspace/pit-shots/s2 node tests/e2e/symbol-peek.mjs
import puppeteer from "puppeteer-core";
import { existsSync, mkdirSync, readFileSync } from "fs";

const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit-shots/s2";
const JAR = process.env.JAR;
const W = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

if (!JAR || !existsSync(JAR)) throw new Error("JAR with a saved session is required (this script never signs up)");

const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await p.setCookie(...JSON.parse(readFileSync(JAR, "utf8")));
await p.goto(BASE + "/", { waitUntil: "networkidle2" });
const u = await p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user ?? null);
if (!u) throw new Error("saved session expired; not signing up");
console.error("account", u.email, "balance", u.balanceCents);

async function dismissChrome() {
  for (const t of ["Head into the mine", "Ride out", "Cross the bridge", "Got it", "I am 21 or older", "Enter", "Start playing"]) {
    await p.$(`xpath/.//button[contains(., "${t}")]`).then((h) => h?.evaluate((e) => e.click())).catch(() => {});
  }
  await p.$eval(".rl-toggle input", (e) => { if (!e.checked) e.click(); }).catch(() => {});
}

async function longPressPeek() {
  await p.waitForSelector(".slot-cabinet.is-idle [data-peek-symbol]", { timeout: 15000 });
  await p.$eval(".slot-cabinet", (e) => { e.scrollIntoView({ block: "start" }); window.scrollBy(0, -40); });
  await W(200);
  const started = await p.evaluate(() => {
    const el = document.querySelector(".slot-cabinet.is-idle [data-peek-symbol]");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "touch", pointerId: 7, clientX: x, clientY: y }));
    return { symbol: el.getAttribute("data-peek-symbol"), label: el.getAttribute("data-peek-label"), x, y };
  });
  if (!started) throw new Error("no peekable symbol");
  await W(550);
  const open = await p.evaluate(() => {
    const box = document.querySelector("[data-testid='symbol-peek']");
    if (!box) return null;
    const r = box.getBoundingClientRect();
    const cs = getComputedStyle(box);
    return {
      symbol: box.getAttribute("data-peek-symbol"),
      kind: box.getAttribute("data-peek-kind"),
      mode: box.getAttribute("data-peek-mode"),
      text: box.textContent,
      left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height,
      font: parseFloat(cs.fontSize),
      clipped: r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1,
    };
  });
  return { started, open };
}

async function releasePeek(started) {
  await p.evaluate(({ x, y }) => {
    const el = document.querySelector(".slot-cabinet [data-peek-symbol]");
    const ev = { bubbles: true, cancelable: true, pointerType: "touch", pointerId: 7, clientX: x, clientY: y };
    (el || document).dispatchEvent(new PointerEvent("pointerup", ev));
  }, started);
  await W(200);
  return p.evaluate(() => !!document.querySelector("[data-testid='symbol-peek']"));
}

const GAMES = [
  { path: "/slot", name: "sundown", shot: "s2-sundown-peek.png" },
  { path: "/prairie", name: "prairie", shot: "s2-prairie-peek.png" },
  { path: "/clover", name: "clover", shot: "s2-clover-peek.png" },
];

const result = { errors, games: {} };

for (const g of GAMES) {
  await p.goto(BASE + g.path, { waitUntil: "networkidle2" });
  await W(800);
  await dismissChrome();
  await W(400);
  const spinning = await p.evaluate(() => document.querySelector(".slot-cabinet")?.classList.contains("is-spinning"));
  if (spinning) throw new Error(`${g.name}: cabinet was spinning before any press`);
  const { started, open } = await longPressPeek();
  if (!open) throw new Error(`${g.name}: peek did not open after long-press of ${started.label}`);
  if (open.symbol !== started.symbol) throw new Error(`${g.name}: peek symbol ${open.symbol} != tile ${started.symbol}`);
  if (open.mode !== "hold") throw new Error(`${g.name}: expected hold mode, got ${open.mode}`);
  if (open.clipped) throw new Error(`${g.name}: peek clipped ${JSON.stringify(open)}`);
  if (!/\$\d/.test(open.text || "") && !/No (line|way) pay/i.test(open.text || "") && !/No pay/.test(open.text || "")) {
    throw new Error(`${g.name}: peek has no amount or 'no pay' copy: ${open.text}`);
  }
  const stillIdle = await p.evaluate(() => {
    const cab = document.querySelector(".slot-cabinet");
    const btn = document.querySelector("[data-cab-spin]");
    return { spinning: cab?.classList.contains("is-spinning"), busy: btn?.disabled && cab?.classList.contains("is-spinning") };
  });
  if (stillIdle.spinning) throw new Error(`${g.name}: long-press started a spin`);
  await p.screenshot({ path: `${OUT}/${g.shot}` });
  const stillOpen = await releasePeek(started);
  if (stillOpen) throw new Error(`${g.name}: peek stayed open after release`);
  result.games[g.name] = { symbol: started.symbol, label: started.label, kind: open.kind, text: open.text, box: { left: open.left, top: open.top, right: open.right, bottom: open.bottom } };
  console.error(g.name, JSON.stringify(result.games[g.name]));
}

// Info sheet on Sundown (one plain screen: RTP + feature)
await p.goto(BASE + "/slot", { waitUntil: "networkidle2" });
await W(600);
await dismissChrome();
await p.waitForSelector(".cab-info-btn", { timeout: 10000 });
await p.$eval(".cab-info-btn", (e) => e.click());
await p.waitForSelector("[data-testid='game-info-sheet']", { timeout: 5000 });
const info = await p.evaluate(() => document.querySelector("[data-testid='game-info-sheet']")?.textContent ?? "");
if (!/RTP 95\.53%/.test(info)) throw new Error(`info sheet missing published RTP: ${info}`);
await p.screenshot({ path: `${OUT}/s2-sundown-info.png` });
result.info = info.slice(0, 400);
console.error("info", result.info);

if (errors.length) throw new Error("page errors: " + errors.join(" | "));
console.log(JSON.stringify({ ok: true, out: OUT, result }, null, 2));
await b.close();
