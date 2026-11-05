// Browser layout check for the roulette table (run manually; not part of `npm test`).
//   npm i --no-save puppeteer-core   (or have it resolvable), then
//   BASE=http://127.0.0.1:3000 CHROME=/usr/bin/google-chrome node tests/e2e/roulette-layout.mjs
// Signs up a throwaway sandbox account, then at each width checks:
//   - no sideways page scroll and no element past the viewport edge
//   - the table has no hidden internal horizontal scroll
//   - the old Session/Hottest stats panel is gone; "Recent numbers" panel is present
//   - every bet spot (cells, splits, corners, streets, six-lines) is the top element at its centre (tappable)
//   - tapping each inside spot lights exactly the numbers it pays on, and those numbers touch the tap point
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE || "http://127.0.0.1:3000";
const WIDTHS = (process.env.W || "360,390,430,768,1024,1280,1440").split(",").map(Number);
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.goto(BASE + "/", { waitUntil: "networkidle2" });
await p.evaluate(async () => {
  const j = { "content-type": "application/json" };
  await fetch("/api/auth/me", { method: "POST", headers: j, body: JSON.stringify({ age: 21 }) });
  await fetch("/api/auth/signup", { method: "POST", headers: j, body: JSON.stringify({ email: `layout${Date.now()}@pit.test`, password: "password1", displayName: "Layout" }) });
  localStorage.setItem("pit-rl-hint-v1", "1");
});
let failed = 0;
for (const w of WIDTHS) {
  const phone = w < 700;
  await p.setViewport({ width: w, height: 860, isMobile: phone, hasTouch: phone, deviceScaleFactor: 1 });
  await p.goto(BASE + "/roulette", { waitUntil: "networkidle2" });
  await p.waitForSelector(".rl-grid", { timeout: 30000 });
  const layout = await p.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const over = [...document.querySelectorAll("body *")].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.right > vw + 0.5 || r.left < -0.5);
    }).map((e) => `${e.tagName}.${String(e.className).slice(0, 40)}`);
    const cloth = document.querySelector(".rl-cloth");
    return {
      vw, scrollW: document.documentElement.scrollWidth, bodyW: document.body.scrollWidth,
      clothOverflow: cloth.scrollWidth - cloth.clientWidth,
      oldPanel: !!document.querySelector(".rl-stats") || /Hottest|Session ·/.test(document.body.innerText),
      recent: !!document.querySelector("details.rl-recent"),
      over: over.slice(0, 6),
    };
  });
  // Tappability: each bet target must be the top element at its centre.
  const spots = await p.$$(".rl-grid .rl-cell, .rl-grid .rl-spot");
  const blocked = [];
  const mapErr = [];
  for (const el of spots) {
    await el.evaluate((e) => e.scrollIntoView({ block: "center", inline: "center" }));
    const res = await el.evaluate((e) => {
      const r = e.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y)?.closest("button");
      return { ok: top === e, x, y, cls: e.className, title: e.title || e.textContent.trim().slice(0, 12), got: top ? (top.title || top.className) : "none" };
    });
    if (!res.ok) { blocked.push(`${res.title} -> ${res.got}`); continue; }
    if (!String(res.cls).includes("rl-spot")) continue;
    // Mapping: the numbers lit by the tap must match the title and sit next to the tap point.
    await p.mouse.click(res.x, res.y);
    const m = await p.evaluate(({ x, y }) => {
      const lit = [...document.querySelectorAll(".rl-grid .rl-cell.n.covered")];
      const dist = (e) => { const r = e.getBoundingClientRect(); const dx = Math.max(r.left - x, 0, x - r.right); const dy = Math.max(r.top - y, 0, y - r.bottom); return Math.hypot(dx, dy); };
      return { lit: lit.map((e) => Number(e.textContent.match(/\d+/)[0])).sort((a, c) => a - c), near: lit.map(dist) };
    }, res);
    const want = (res.title.match(/(\d+(?:-\d+)+)/)?.[1] || "").split("-").map(Number);
    const kind = res.title.split(" ")[0];
    let expectN = want;
    if (kind === "Six-line") { const lo = want[0], hi = want[want.length - 1]; expectN = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i); }
    const same = JSON.stringify(m.lit) === JSON.stringify([...expectN].sort((a, c) => a - c));
    const maxNear = kind === "Corner" || kind === "Split" ? Math.max(...m.near) : Math.min(...m.near);
    if (!same || maxNear > 24) mapErr.push(`${res.title}: lit ${m.lit.join(",")} near ${maxNear.toFixed(1)}`);
  }
  const ok = layout.scrollW <= layout.vw && layout.bodyW <= layout.vw && layout.clothOverflow <= 0 && !layout.over.length && !layout.oldPanel && layout.recent && !blocked.length && !mapErr.length;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${w}px  page=${layout.scrollW}/${layout.vw} clothOverflow=${layout.clothOverflow} oldPanel=${layout.oldPanel} recent=${layout.recent} targets=${spots.length} blocked=${blocked.length} mapErr=${mapErr.length}`);
  for (const s of [...layout.over, ...blocked.slice(0, 5), ...mapErr.slice(0, 5)]) console.log("   ", s);
  if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/rl-${w}.png`, fullPage: true });
}
await b.close();
process.exit(failed ? 1 : 0);
