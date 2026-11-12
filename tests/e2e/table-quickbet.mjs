// #7 follow-up: quick bet row on Blackjack and Pai Gow docks (phone width).
// Reuses an existing session (JAR) — never signs up. Deals a few $5 sandbox hands.
//   BASE=https://pit-iota-puce.vercel.app JAR=/tmp/pot-jar.json OUT=/workspace/pit/screenshots node tests/e2e/table-quickbet.mjs
import puppeteer from "puppeteer-core";
import { existsSync, readFileSync } from "node:fs";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit/screenshots";
const JAR = process.env.JAR;
if (!JAR || !existsSync(JAR)) { console.error("JAR with a valid session required (it never creates accounts)"); process.exit(2); }
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await p.setCookie(...JSON.parse(readFileSync(JAR, "utf8")));
const check = (label, ok, detail = "") => { console.log(`${ok ? "OK  " : "FAIL"} ${label} ${detail}`); if (!ok) process.exitCode = 1; };
const posts = [];
p.on("request", (r) => { if (r.method() === "POST" && /\/api\/games\/(blackjack|paigow)$/.test(r.url())) { try { posts.push(JSON.parse(r.postData() || "{}")); } catch {} } });
const tapX = async (xp, t = 15000) => { const h = await p.waitForSelector(`xpath/${xp}`, { timeout: t }); await h.evaluate((e) => { e.scrollIntoView({ block: "center" }); e.click(); }); await W(400); };
const dock = () => p.evaluate(() => {
  const q = document.querySelector(".action-dock .quick-bet.table-quick");
  const chips = q ? [...q.querySelectorAll(".quick-chips .clay-chip-btn")] : [];
  const deal = document.querySelector(".action-dock .btn.hero-act");
  const rep = q?.querySelector(".repeat-bet");
  const dr = deal?.getBoundingClientRect(); const qr = q?.getBoundingClientRect();
  return {
    has: !!q, chips: chips.length, // the selected chip lifts a few px, so allow less than half a chip of spread
    oneRow: chips.length > 0 && (Math.max(...chips.map((c) => c.getBoundingClientRect().top)) - Math.min(...chips.map((c) => c.getBoundingClientRect().top))) < chips[0].getBoundingClientRect().height / 2,
    group: q?.querySelector(".quick-chips")?.getAttribute("aria-label"),
    dealH: dr ? Math.round(dr.height) : 0, dealW: dr ? Math.round(dr.width) : 0, dealBelow: dr && qr ? dr.top >= qr.bottom - 1 : false,
    dealText: deal?.textContent?.trim(), dealDisabled: !!deal?.disabled,
    repeat: rep ? { text: rep.textContent.trim(), disabled: rep.disabled } : null,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    sandbox: /sandbox/i.test(document.body.textContent),
  };
});
async function finishHand(game) {
  for (let i = 0; i < 6; i++) {
    const phase = await p.evaluate(() => [...document.querySelectorAll(".action-dock button")].map((x) => x.textContent.trim()).join("|"));
    if (game === "paigow" && phase.includes("House way")) await tapX('//div[contains(@class,"action-dock")]//button[contains(., "House way")]');
    else if (game === "blackjack" && phase.includes("No insurance")) await tapX('//div[contains(@class,"action-dock")]//button[contains(., "No insurance")]');
    else if (game === "blackjack" && phase.includes("Stand")) await tapX('//div[contains(@class,"action-dock")]//button[normalize-space(.)="Stand"]');
    else return;
    await W(1800);
  }
}
for (const [game, path] of [["blackjack", "/blackjack"], ["paigow", "/paigow"]]) {
  await p.goto(BASE + path, { waitUntil: "networkidle2" }); await W(1500);
  await finishHand(game); // leftover open hand from an earlier run
  await p.evaluate(() => { try { localStorage.removeItem("pit.lastBet.v1"); } catch {} });
  await p.reload({ waitUntil: "networkidle2" }); await W(1500);
  let d = await dock();
  check(`${game} quick row present`, d.has && d.chips === 5, `${d.chips} chips`);
  check(`${game} chips on one row at 390`, d.oneRow);
  check(`${game} table labels`, d.group === "Bet size per hand (sandbox chips)", d.group);
  check(`${game} thumb-reach Deal`, d.dealH >= 64 && d.dealW >= 300 && d.dealBelow, `${d.dealW}x${d.dealH}`);
  check(`${game} no Repeat before any bet`, d.repeat === null);
  check(`${game} no horizontal overflow`, !d.overflow);
  check(`${game} sandbox label`, d.sandbox);
  // $100 chip is more than this test balance ($51): Deal must refuse.
  await tapX('//div[contains(@class,"quick-chips")]//button[contains(@aria-label,"Bet 100.00")]');
  d = await dock();
  check(`${game} Deal disabled when balance can't cover`, d.dealDisabled, d.dealText);
  // Deal $5, finish the hand, pick $10 → Repeat $5.00 offered.
  await tapX('//div[contains(@class,"quick-chips")]//button[contains(@aria-label,"Bet 5.00")]');
  posts.length = 0;
  await tapX('//div[contains(@class,"action-dock")]//button[contains(@class,"hero-act")]'); await W(2500);
  check(`${game} deal sent $5`, posts.some((x) => x.action === "deal" && x.betCents === 500));
  await finishHand(game);
  await tapX('//div[contains(@class,"quick-chips")]//button[contains(@aria-label,"Bet 10.00")]');
  d = await dock();
  check(`${game} Repeat offered for last accepted bet`, d.repeat?.text?.includes("Repeat $5.00") && !d.repeat.disabled, JSON.stringify(d.repeat));
  await p.screenshot({ path: `${OUT}/table-quickbet-${game}-390.png` });
  posts.length = 0;
  await tapX('//div[contains(@class,"action-dock")]//button[contains(@class,"repeat-bet")]'); await W(2500);
  check(`${game} Repeat deals $5 through the server`, posts.some((x) => x.action === "deal" && x.betCents === 500), JSON.stringify(posts.map((x) => [x.action, x.betCents])));
  await finishHand(game);
  d = await dock();
  check(`${game} after Repeat the pick is $5 again (Repeat hidden)`, d.repeat === null);
}
await b.close();
