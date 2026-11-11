// Phones: the cabinet deck (LEDs + Bet−/Bet+/Max/Auto/Spin) must scroll fully clear of the
// fixed quick-bet bar, the bar keeps chips/Custom/Repeat but no duplicate Spin, and the
// achievement toast sits below the top bar. Saves cab-fix-<game>-<w>.png.
//   BASE=https://pit-iota-puce.vercel.app node tests/e2e/slot-cabinet-phone.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit-shots";
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const email = `cabp${Date.now()}@pit.test`;
const click = async (xp, t = 20000) => { const h = await p.waitForSelector(`xpath/${xp}`, { timeout: t }); await h.evaluate((e) => e.scrollIntoView({ block: "center" })); await W(200); await h.click(); };
const log = [];
const check = (label, ok, detail = "") => { log.push(`${ok ? "OK  " : "FAIL"} ${label} ${detail}`); if (!ok) process.exitCode = 1; };
await p.goto(BASE + "/", { waitUntil: "networkidle2" });
await click('.//button[contains(., "I am 21 or older")]'); await W(800);
await p.goto(BASE + "/signup", { waitUntil: "networkidle2" });
await p.type("#su-name", "Cab"); await p.type("#su-email", email); await p.type("#su-pass", "sandbox-pass-1");
await p.$eval("input[type=checkbox]", (e) => { if (!e.checked) e.click(); });
await click('.//button[contains(., "Create account")]'); await W(2500);
await click('.//button[contains(., "welcome chips")]').catch(() => {}); await W(1500);
await click('.//button[contains(., "Skip tour")]', 3000).catch(() => {});

for (const [w, h] of [[390, 844], [360, 780]]) {
  await p.setViewport({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  for (const game of ["slot", "vault"]) {
    const name = game === "slot" ? "sundown" : "ridge";
    await p.goto(`${BASE}/${game}`, { waitUntil: "networkidle2" }); await W(1500);
    // toast (if any) must not overlap the top bar
    const toastOk = await p.evaluate(() => {
      const t = document.querySelector(".ach-toast"), bar = document.querySelector(".topbar");
      if (!t || !bar) return true;
      return t.getBoundingClientRect().top >= bar.getBoundingClientRect().bottom - 1;
    });
    check(`${name} ${w}: achievement toast below the top bar`, toastOk);
    // scroll so the deck's bottom sits just above the dock
    await p.evaluate(() => {
      const deck = document.querySelector(".cab-deck"), dock = document.querySelector(".action-dock");
      const gap = deck.getBoundingClientRect().bottom - dock.getBoundingClientRect().top + 8;
      window.scrollBy(0, gap);
    });
    await W(500);
    const m = await p.evaluate(() => {
      const r = (s) => document.querySelector(s)?.getBoundingClientRect();
      const deck = r(".cab-deck"), dock = r(".action-dock"), leds = r(".cab-leds"), bar = r(".topbar");
      const dockSpin = document.querySelector(".action-dock .btn.hero-act");
      const chips = [...document.querySelectorAll(".action-dock .quick-bet .clay-chip-btn")].map((e) => e.getBoundingClientRect());
      return {
        deckBottom: deck.bottom, dockTop: dock.top, ledsTop: leds.top, barBottom: bar.bottom, dockH: dock.height,
        dockSpinShown: !!dockSpin && getComputedStyle(dockSpin).display !== "none",
        chipsVisible: chips.length >= 5 && chips.every((c) => c.top >= dock.top - 16 && c.bottom <= innerHeight && c.right <= innerWidth + 1 && c.left >= -1),
        custom: !!document.querySelector(".action-dock .custom-wager"),
        overflowX: document.documentElement.scrollWidth > innerWidth + 1,
      };
    });
    check(`${name} ${w}: deck ends above the bottom bar`, m.deckBottom <= m.dockTop + 0.5, `deck ${m.deckBottom.toFixed(0)} dock ${m.dockTop.toFixed(0)} (dock h ${m.dockH.toFixed(0)})`);
    check(`${name} ${w}: LED meters below the top bar`, m.ledsTop >= m.barBottom, `leds ${m.ledsTop.toFixed(0)} bar ${m.barBottom.toFixed(0)}`);
    check(`${name} ${w}: no duplicate Spin in the bottom bar`, !m.dockSpinShown);
    check(`${name} ${w}: chip picker fully on screen, Custom $ present`, m.chipsVisible && m.custom);
    check(`${name} ${w}: no sideways scroll`, !m.overflowX);
    await p.screenshot({ path: `${OUT}/cab-fix-${name}-${w}.png` });
    // Repeat stays reachable: spin once at $0.50 coin via the deck, then select $1 → Repeat shows
    if (w === 390) {
      await p.$eval('.action-dock .clay-chip-btn:nth-child(2)', (e) => e.click()); await W(200);
      await p.$eval("[data-cab-spin]", (e) => e.click());
      await p.waitForFunction(() => !document.querySelector(".reel.is-spinning") && !document.querySelector(".action-dock.is-busy"), { timeout: 25000 }); await W(800);
      await p.$eval('.action-dock .clay-chip-btn:nth-child(3)', (e) => e.click()); await W(300);
      const rep = await p.evaluate(() => { const e = document.querySelector(".action-dock .repeat-bet"); if (!e) return null; const r = e.getBoundingClientRect(); return { text: e.textContent, on: r.bottom <= innerHeight && r.top >= 0 && r.width > 0 }; });
      check(`${name} ${w}: Repeat reachable in the bottom bar`, !!rep?.on, rep?.text ?? "missing");
      await p.evaluate(() => {
        const deck = document.querySelector(".cab-deck"), dock = document.querySelector(".action-dock");
        window.scrollBy(0, deck.getBoundingClientRect().bottom - dock.getBoundingClientRect().top + 8);
      }); await W(400);
      await p.screenshot({ path: `${OUT}/cab-fix-${name}-${w}-repeat.png` });
    }
  }
}
console.log(email + "\n" + log.join("\n"));
await b.close();
