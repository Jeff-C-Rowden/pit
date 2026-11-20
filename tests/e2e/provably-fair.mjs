// JD2 live check at 390px: provably fair hidden trigger in the Antler Ridge pot sheet.
//  - GET /api/games/slot-progressive/fairness: Mini/Minor/Major each have an open cycle with a 64-hex
//    SHA-256 commitment and NO trigger/salt; Grand is "mystery" with none. The main meters API carries
//    no trigger/salt keys anywhere.
//  - Every revealed (ended) cycle re-hashes (Node crypto, independent of the app) to its commitment,
//    its point is inside [seed, cap] and the paying spin crossed it.
//  - Optional SPINS=N: real $9 sandbox spins on the saved test account until a must-hit pot pays (stops at
//    N spins or a $15 balance floor). Any cycle that ended since the first read must be revealed with the
//    commitment published before, and the next cycle must be committed at its start.
//  - UI: the pot sheet shows the same commitment, honest mid-cycle wording when flagged, the browser
//    re-hash button reports Verified for a reveal, sandbox chip, limits link + 1-800-GAMBLER · 21+,
//    neutral wording, nothing overflows at 390px.
// Reuses a saved session; never signs up.
//   BASE=https://pit-iota-puce.vercel.app JAR=/tmp/turso-jar.json SPINS=300 OUT=/workspace/pit/screenshots node tests/e2e/provably-fair.mjs
import puppeteer from "puppeteer-core";
import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const OUT = process.env.OUT || "/workspace/pit/screenshots";
const JAR = process.env.JAR;
const SPINS = Number(process.env.SPINS || 0);
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const check = (label, ok, detail = "") => { log.push(`${ok ? "OK  " : "FAIL"} ${label} ${detail}`); if (!ok) process.exitCode = 1; };
const BANNED = /\b(due|hot|almost|about to hit|overdue|soon|streak|close|ready|lucky)\b/i;
const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const keysDeep = (o, out = []) => { if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { out.push(k); keysDeep(v, out); } return out; };

const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
if (!JAR || !existsSync(JAR)) throw new Error("JAR with a saved session is required (this script never signs up)");
await p.setCookie(...JSON.parse(readFileSync(JAR, "utf8")));
await p.goto(BASE + "/vault", { waitUntil: "networkidle2" });
const me = await p.evaluate(async () => (await (await fetch("/api/auth/me", { cache: "no-store" })).json()).user ?? null);
if (!me) throw new Error("saved session expired; not signing up");
const getJ = (path) => p.evaluate(async (u) => { for (let i = 0; i < 4; i++) { const r = await fetch(u, { cache: "no-store" }); if (r.ok) return r.json(); await new Promise((x) => setTimeout(x, 800)); } return null; }, path);
const fair = () => getJ("/api/games/slot-progressive/fairness");

let F = await fair();
check("fairness API answers with 4 tiers", F?.tiers?.length === 4, F?.format);
const config = (await getJ("/api/games/slot-progressive")).info.tiers;
function verifyApi(F, tag) {
  for (const t of F.tiers) {
    const cfg = config.find((c) => c.id === t.tierId);
    if (t.kind === "mystery") { check(`${tag} ${t.name}: mystery, no commitment`, t.current === null && t.revealed.length === 0); continue; }
    const c = t.current;
    check(`${tag} ${t.name}: open cycle has a 64-hex SHA-256 commitment`, /^[0-9a-f]{64}$/.test(c?.commitment ?? ""), c?.commitment);
    const ck = keysDeep(c);
    check(`${tag} ${t.name}: open cycle exposes no trigger / salt / preimage`, !ck.some((k) => /trigger|salt|preimage/i.test(k)), ck.join(","));
    for (const r of t.revealed) {
      const pre = `${r.triggerCents}|${r.salt}|${r.cycleId}`;
      const ok = r.preimage === pre && sha(pre) === r.commitment && r.triggerCents >= cfg.seedCents && r.triggerCents <= cfg.ceilingCents
        && (r.reason !== "hit" || (r.meterBeforeCents < r.triggerCents && r.hitAmountCents >= r.triggerCents));
      check(`${tag} ${t.name}: revealed cycle ${r.cycleId.slice(0, 8)} re-hashes to its commitment, point in range, crossed on the paying spin`, ok, `${r.reason} T=${r.triggerCents}`);
      check(`${tag} ${t.name}: revealed cycle is not the open one`, r.cycleId !== c.cycleId);
    }
  }
}
verifyApi(F, "API");
const main = await getJ("/api/games/slot-progressive");
const mk = keysDeep({ meters: main.meters, recentHits: main.recentHits, hitHistory: main.hitHistory, hitSamples: main.hitSamples });
check("meters API carries no trigger / salt keys", !mk.some((k) => /trigger|salt/i.test(k)));
const F2 = await fair();
const stable = F.tiers.every((t) => !t.current || F2.tiers.find((x) => x.tierId === t.tierId).current?.cycleId === t.current.cycleId || F2.tiers.find((x) => x.tierId === t.tierId).revealed.some((r) => r.commitment === t.current.commitment));
check("commitments stay fixed across reads (only change when that pot pays)", stable);

// Every cycle seen open earlier that has since ended must be revealed with the SAME commitment.
const openBefore = F2.tiers.filter((t) => t.current).map((t) => ({ tierId: t.tierId, name: t.name, ...t.current }));
function checkEnded(Fnow, tag) {
  for (const o of openBefore) {
    const t = Fnow.tiers.find((x) => x.tierId === o.tierId);
    if (t.current?.cycleId === o.cycleId) continue;
    const rev = t.revealed.find((x) => x.cycleId === o.cycleId);
    check(`${tag} ${o.name}: the cycle published before it paid is revealed with the same commitment`, !!rev && rev.commitment === o.commitment && rev.committedAt === o.committedAt);
    check(`${tag} ${o.name}: the next cycle is committed at its start (meter = seed)`, t.current && !t.current.midCycle && t.current.meterAtCommitCents === t.seedCents);
  }
}
// Optional: real $9 sandbox spins until any must-hit pot pays (or N spins / balance floor).
if (SPINS > 0) {
  // The free daily sandbox chips (a normal Pit feature) top the test account up if they are available.
  const daily = await p.evaluate(async () => { const r = await fetch("/api/wallet/daily", { method: "POST" }); return { status: r.status, body: await r.json().catch(() => null) }; });
  log.push(`INFO daily sandbox chips claim: ${daily.status} ${daily.body?.amountCents ?? daily.body?.error ?? ""}`);
  const r = await p.evaluate(async (max) => {
    let n = 0, hit = null, bal = null, err = null;
    for (; n < max; n++) {
      const res = await fetch("/api/games/slot-progressive", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ coinCents: 100, idempotencyKey: `jd2-${Date.now()}-${n}` }) });
      if (!res.ok) { if (res.status === 503) { await new Promise((x) => setTimeout(x, 800)); continue; } err = `${res.status} ${await res.text()}`; break; }
      const j = await res.json(); bal = j.balanceCents;
      const h = (j.spin.progressiveHits || []).find((x) => x.tierId !== "vault-grand");
      if (h) { hit = h; n++; break; }
      if (bal < 1500) { err = "balance floor"; break; }
    }
    return { n, hit, bal, err };
  }, SPINS);
  log.push(`INFO spun ${r.n} real $9 spins, must-hit pay=${JSON.stringify(r.hit)}, balance=${r.bal}, stop=${r.err}`);
  if (r.hit) {
    F = await fair();
    const rev = F.tiers.find((t) => t.tierId === r.hit.tierId).revealed[0];
    check(`${r.hit.name} paid ${r.hit.awardCents}: revealed point ≤ paid amount and amount matches the hit`, rev && rev.hitAmountCents === r.hit.awardCents && rev.triggerCents <= rev.hitAmountCents, `T=${rev?.triggerCents} paid=${rev?.hitAmountCents}`);
  }
}
F = await fair();
checkEnded(F, "after");
verifyApi(F, "after");

// UI: open each must-hit pot sheet on /vault.
await p.goto(BASE + "/vault", { waitUntil: "networkidle2" }); await W(1500);
await p.evaluate(() => { document.querySelector(".first-tip-ok")?.click(); document.querySelector(".ach-toast-x")?.click(); }); await W(300);
const openSheet = async (name) => {
  for (let i = 0; i < 8 && !(await p.$('[data-testid="pot-sheet"]')); i++) {
    await p.$eval(`.prog-tier.prog-tier-${name}`, (e) => { e.scrollIntoView({ block: "center" }); e.click(); }).catch(() => {});
    await W(900);
  }
  await p.waitForSelector('[data-testid="pot-fair"][data-tier]', { timeout: 15000 }); await W(300);
};
let shotTier = null;
for (const name of ["mini", "minor", "major", "grand"]) {
  await openSheet(name);
  const t = F.tiers.find((x) => x.tierId === `vault-${name}`);
  const ui = await p.evaluate(() => {
    const s = document.querySelector('[data-testid="pot-sheet"]'), f = s.querySelector('[data-testid="pot-fair"]');
    return {
      commitment: f.querySelector('[data-testid="pf-commitment"]')?.textContent ?? null,
      mid: f.querySelector(".pf-current")?.dataset.mid ?? null,
      reveals: f.querySelectorAll('[data-testid="pf-reveal"]').length,
      text: f.textContent, sheetText: s.textContent,
      limits: !!f.querySelector('a[href="/wallet#time"]'), chip: !!s.querySelector(".sandbox-chip"),
      fits: [...f.querySelectorAll(".pf-hash")].every((e) => e.scrollWidth <= e.clientWidth + 1),
      overflowX: document.documentElement.scrollWidth > innerWidth + 1,
      box: (() => { const r = s.getBoundingClientRect(); return [r.left, r.right, innerWidth]; })(),
    };
  });
  if (t.kind === "mystery") {
    check(`UI Grand: says it has no hidden point, no fingerprint`, ui.commitment === null && /no hidden point/.test(ui.text));
  } else {
    check(`UI ${t.name}: sheet shows the live commitment`, ui.commitment === t.current.commitment, ui.commitment?.slice(0, 12));
    check(`UI ${t.name}: honest start/mid-cycle wording`, t.current.midCycle ? ui.mid === "1" && /began before fingerprints were published/.test(ui.text) && /next reset/.test(ui.text) : ui.mid === "0" && /at the start of this cycle/.test(ui.text));
    check(`UI ${t.name}: one row per revealed cycle`, ui.reveals === t.revealed.length, `${ui.reveals}`);
    if (t.revealed.length) {
      await p.$eval('[data-testid="pf-reveal"] .pf-verify', (e) => { e.scrollIntoView({ block: "center" }); e.click(); });
      await p.waitForSelector('[data-testid="pf-result"]', { timeout: 5000 });
      const res = await p.$eval('[data-testid="pf-result"]', (e) => ({ ok: e.dataset.ok, text: e.textContent }));
      check(`UI ${t.name}: browser re-hash says Verified`, res.ok === "1" && /^Verified/.test(res.text), res.text);
      if (!shotTier) shotTier = name;
    }
  }
  check(`UI ${name}: sandbox chip + limits link + 1-800-GAMBLER · 21+`, ui.chip && ui.limits && /1-800-GAMBLER · 21\+/.test(ui.text));
  check(`UI ${name}: neutral wording`, !BANNED.test(ui.text), BANNED.exec(ui.text)?.[0] ?? "");
  check(`UI ${name}: 390px no overflow, hashes wrap inside the sheet`, !ui.overflowX && ui.fits && ui.box[0] >= -1 && ui.box[1] <= ui.box[2] + 1, JSON.stringify(ui.box));
  await p.keyboard.press("Escape"); await W(300);
}
// Screenshot: the sheet scrolled to the provably fair block (a tier with a verified reveal if any).
await openSheet(shotTier ?? "mini");
if (shotTier) { await p.$eval('[data-testid="pf-reveal"] .pf-verify', (e) => e.click()); await W(400); }
await p.$eval('[data-testid="pot-fair"]', (e) => e.scrollIntoView({ block: "start" })); await W(500);
await p.screenshot({ path: `${OUT}/jd2-provably-fair-390.png` });
check("no page errors", errors.length === 0, errors.join(" | "));
console.log(log.join("\n"));
const res = log.filter((l) => !l.startsWith("INFO"));
console.log(`${res.filter((l) => l.startsWith("OK")).length}/${res.length} passed`);
await b.close();
