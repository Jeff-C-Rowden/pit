// Turso ledger live check at 390px. PHASE=signup: fresh visitor -> 21+ gate -> sign up an @pit.test
// account -> $100 welcome chips -> real Sundown Trail spin through the UI -> screenshot, save JAR + balance.
// PHASE=verify (after a redeploy / cold start): the saved session still signs in and balance + bet rows match.
//   BASE=https://pit-iota-puce.vercel.app JAR=/tmp/turso-jar.json PHASE=signup node tests/e2e/turso-live.mjs
import puppeteer from "puppeteer-core";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit/screenshots";
const JAR = process.env.JAR || "/tmp/turso-jar.json";
const STATE = JAR + ".state.json";
const PHASE = process.env.PHASE || "signup";
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const check = (label, ok, detail = "") => { log.push(`${ok ? "OK  " : "FAIL"} ${label} ${detail}`); if (!ok) process.exitCode = 1; };
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const click = async (xp, t = 20000) => { const h = await p.waitForSelector(`xpath/${xp}`, { timeout: t }); await h.evaluate((e) => e.scrollIntoView({ block: "center" })); await W(200); await h.click(); };
const me = () => p.evaluate(async () => { const r = await fetch("/api/auth/me", { cache: "no-store" }); return { status: r.status, body: await r.json() }; });
const ledger = () => p.evaluate(async () => { const r = await fetch("/api/wallet/ledger", { cache: "no-store" }); return { status: r.status, body: await r.json().catch(() => null) }; });
const count = (l) => { const rows = l.body?.recent ?? []; return rows.length; };

if (PHASE === "signup") {
  await p.goto(BASE + "/", { waitUntil: "networkidle2" });
  await click('.//button[contains(@class,"home-enter")]'); await W(900);
  await p.goto(BASE + "/signup", { waitUntil: "networkidle2" });
  const email = `turso${Date.now()}@pit.test`;
  await p.type("#su-name", "Turso"); await p.type("#su-email", email); await p.type("#su-pass", "sandbox-pass-1");
  await p.$eval("input[type=checkbox]", (e) => { if (!e.checked) e.click(); });
  await click('.//button[contains(., "Create account")]'); await W(2500);
  await click('.//button[contains(., "welcome chips")]', 6000).catch(() => {}); await W(1500);
  await click('.//button[contains(., "Skip tour")]', 3000).catch(() => {});
  let m = await me();
  check("signed up and signed in", m.status === 200 && m.body.user?.email === email, `${m.status} ${m.body.user?.email}`);
  check("ledger mode is turso", m.body.ledger === "turso", m.body.ledger);
  const before = m.body.user?.balanceCents;
  check("welcome chips credited", before > 0, String(before));
  await p.goto(BASE + "/slot", { waitUntil: "networkidle2" }); await W(1500);
  await p.evaluate(() => { for (const t of ["Skip tour", "Skip chips"]) [...document.querySelectorAll("button, a")].find((x) => x.textContent.trim() === t)?.click(); document.querySelector(".first-tip-ok")?.click(); }); await W(500);
  await p.$eval("[data-cab-spin]", (e) => e.click());
  await W(1000);
  await p.waitForFunction(() => !document.querySelector(".reel.is-spinning") && !document.querySelector(".action-dock.is-busy"), { timeout: 30000 }).catch(() => {});
  await W(2500);
  m = await me();
  const after = m.body.user?.balanceCents;
  check("spin settled on the server (balance changed)", after !== before, `${before} -> ${after}`);
  const l = await ledger();
  check("wallet ledger readable", l.status === 200, String(l.status));
  await p.screenshot({ path: `${OUT}/turso-live-390.png` });
  writeFileSync(JAR, JSON.stringify(await p.cookies()));
  writeFileSync(STATE, JSON.stringify({ email, balanceCents: after, ledgerRows: count(l), ledgerBody: JSON.stringify(l.body).length }));
} else {
  const st = JSON.parse(readFileSync(STATE, "utf8"));
  await p.setCookie(...JSON.parse(readFileSync(JAR, "utf8")));
  await p.goto(BASE + "/floor", { waitUntil: "networkidle2" });
  const m = await me();
  check("saved session still signed in after redeploy", m.body.user?.email === st.email, String(m.body.user?.email));
  check("balance persisted", m.body.user?.balanceCents === st.balanceCents, `${m.body.user?.balanceCents} vs ${st.balanceCents}`);
  const l = await ledger();
  check("wallet ledger rows persisted", count(l) === st.ledgerRows, `${count(l)} vs ${st.ledgerRows}`);
  check("ledger mode is turso", m.body.ledger === "turso", m.body.ledger);
}
await b.close();
console.log(log.join("\n"));
