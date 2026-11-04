#!/usr/bin/env node
/**
 * HTTP cookie-jar driver for Pit verification (extends e2e.mjs patterns).
 * Usage:
 *   node drive.mjs --feature signup-cage [--evidence DIR]
 *   node drive.mjs --feature blackjack [--evidence DIR]
 *   node drive.mjs --feature gilded-track [--evidence DIR]
 *   node drive.mjs --feature canopy-spire [--evidence DIR]
 *   node drive.mjs --feature roulette [--evidence DIR]
 *
 * Reads base URL from VERIFY_PIT_BASE or run/state.env next to this skill.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(__dirname, "..");
const RUN_DIR = process.env.VERIFY_PIT_RUN_DIR || path.join(SKILL, "run");
const STATE = path.join(RUN_DIR, "state.env");

function loadState() {
  const env = {};
  if (fs.existsSync(STATE)) {
    for (const line of fs.readFileSync(STATE, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2];
    }
  }
  return env;
}

const state = loadState();
const BASE = process.env.VERIFY_PIT_BASE || state.VERIFY_PIT_BASE || "http://127.0.0.1:3000";

function jar() {
  const cookies = new Map();
  return {
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    eat(res) {
      const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
      const single = res.headers.get("set-cookie");
      const list = raw.length ? raw : single ? [single] : [];
      for (const s of list) {
        const [nv] = s.split(";");
        const i = nv.indexOf("=");
        cookies.set(nv.slice(0, i), nv.slice(i + 1));
      }
    },
  };
}

async function call(j, p, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const h = j.header();
  if (h) headers.cookie = h;
  if (opts.body && !headers["content-type"]) headers["content-type"] = "application/json";
  const res = await fetch(BASE + p, { ...opts, headers });
  j.eat(res);
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { _raw: text };
  }
  return { status: res.status, data, text };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function parseArgs(argv) {
  const out = { feature: null, evidence: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--feature") out.feature = argv[++i];
    else if (argv[i] === "--evidence") out.evidence = argv[++i];
  }
  return out;
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function ensureEvidenceDir(feature, override) {
  const dir =
    override ||
    path.join(SKILL, "evidence", feature, stamp());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeJson(dir, name, obj) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
  return p;
}

async function ageGate(j, log) {
  const r = await call(j, "/api/auth/me", { method: "POST", body: JSON.stringify({ age: 21 }) });
  assert(r.status === 200 && r.data.age === 21, "age gate " + JSON.stringify(r));
  log("age ok");
  return r;
}

async function signupFresh(j, log, displayName = "Verify") {
  const email = `verify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@pit.test`;
  const password = "password1";
  const r = await call(j, "/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName }),
  });
  assert(r.status === 200 && r.data.user, "signup " + JSON.stringify(r));
  assert(r.data.user.balanceCents === 0, "fresh signup balance must be 0");
  log(`signup ${email} bal=${r.data.user.balanceCents}`);
  return { email, password, user: r.data.user, response: r };
}

async function deposit(j, log, amountCents = 10000) {
  const r = await call(j, "/api/wallet/deposit", {
    method: "POST",
    body: JSON.stringify({ amountCents }),
  });
  assert(r.status === 200 && r.data.user, "deposit " + JSON.stringify(r));
  assert(r.data.sandbox === true || r.data.user.balanceCents >= amountCents, "sandbox deposit");
  log(`deposit ${amountCents} bal=${r.data.user.balanceCents}`);
  return r;
}

async function featureSignupCage(j, log, evDir) {
  const steps = [];
  const age = await ageGate(j, log);
  steps.push({ step: "age-gate", status: age.status, data: age.data });
  writeJson(evDir, "01-age-gate.json", age);

  const signed = await signupFresh(j, log);
  steps.push({ step: "signup", email: signed.email, user: signed.user });
  writeJson(evDir, "02-signup.json", { email: signed.email, user: signed.user, status: signed.response.status });

  const status = await call(j, "/api/wallet/status");
  assert(status.status === 200 && status.data.mode === "sandbox", "wallet status sandbox " + JSON.stringify(status));
  steps.push({ step: "wallet-status", data: status.data });
  writeJson(evDir, "03-wallet-status.json", status);

  const before = signed.user.balanceCents;
  const dep = await deposit(j, log, 10000);
  assert(dep.data.user.balanceCents === before + 10000, "balance after deposit");
  steps.push({ step: "deposit", before, after: dep.data.user.balanceCents, data: dep.data });
  writeJson(evDir, "04-deposit.json", dep);

  const me = await call(j, "/api/auth/me");
  assert(me.data.user && me.data.user.balanceCents === before + 10000, "me balance " + JSON.stringify(me));
  steps.push({ step: "me-confirm", user: me.data.user });
  writeJson(evDir, "05-me-confirm.json", me);

  // Side effect: second user isolation (wallet isolation)
  const j2 = jar();
  await ageGate(j2, log);
  const other = await signupFresh(j2, log, "Other");
  assert(other.user.balanceCents === 0, "other starts 0");
  const me1 = await call(j, "/api/auth/me");
  assert(me1.data.user.balanceCents === before + 10000, "user1 balance unchanged by user2");
  steps.push({ step: "isolation", user1: me1.data.user.balanceCents, user2: other.user.balanceCents });
  writeJson(evDir, "06-isolation.json", { user1Bal: me1.data.user.balanceCents, user2Bal: other.user.balanceCents });

  const summary = {
    feature: "signup-cage",
    base: BASE,
    ok: true,
    email: signed.email,
    balanceCents: me1.data.user.balanceCents,
    steps: steps.map((s) => s.step),
  };
  writeJson(evDir, "SUMMARY.json", summary);
  fs.writeFileSync(path.join(evDir, "transcript.txt"), log.lines.join("\n") + "\n");
  return summary;
}

async function featureBlackjack(j, log, evDir) {
  await ageGate(j, log);
  const signed = await signupFresh(j, log, "BJVerify");
  writeJson(evDir, "01-signup.json", { email: signed.email, user: signed.user });
  const dep = await deposit(j, log, 10000);
  writeJson(evDir, "02-deposit.json", dep);

  let r = await call(j, "/api/games/blackjack", {
    method: "POST",
    body: JSON.stringify({ action: "deal", betCents: 500 }),
  });
  assert(r.status === 200 && r.data.game, "bj deal " + JSON.stringify(r.data.error || r.data));
  writeJson(evDir, "03-deal.json", r);
  log(`bj phase=${r.data.game.phase} bal=${r.data.user.balanceCents}`);

  if (r.data.game.phase === "insurance") {
    r = await call(j, "/api/games/blackjack", {
      method: "POST",
      body: JSON.stringify({ action: "insurance", take: false, gameId: r.data.game.id }),
    });
    writeJson(evDir, "04-insurance.json", r);
    log(`bj after ins phase=${r.data.game?.phase}`);
  }

  if (r.data.game?.phase === "play") {
    r = await call(j, "/api/games/blackjack", {
      method: "POST",
      body: JSON.stringify({ action: "stand", gameId: r.data.game.id }),
    });
    writeJson(evDir, "05-stand.json", r);
    log(`bj stand result=${r.data.game?.result} pay=${r.data.game?.payoutCents}`);
  }

  assert(r.data.game, "bj game present after actions");
  // Natural blackjack settles on deal — also OK
  assert(
    ["settled", "play", "insurance"].includes(r.data.game.phase) || r.data.game.phase === "settled",
    "unexpected phase " + r.data.game.phase
  );

  // If still in play somehow after stand attempt, one more stand; else settle proof
  if (r.data.game.phase === "play") {
    r = await call(j, "/api/games/blackjack", {
      method: "POST",
      body: JSON.stringify({ action: "stand", gameId: r.data.game.id }),
    });
  }

  const finalGame = r.data.game;
  assert(finalGame.phase === "settled" || finalGame.result, "hand should settle or have result");
  writeJson(evDir, "06-final.json", r);

  const me = await call(j, "/api/auth/me");
  writeJson(evDir, "07-me.json", me);

  const summary = {
    feature: "blackjack",
    base: BASE,
    ok: true,
    phase: finalGame.phase,
    result: finalGame.result || null,
    payoutCents: finalGame.payoutCents ?? null,
    balanceCents: me.data.user.balanceCents,
  };
  writeJson(evDir, "SUMMARY.json", summary);
  fs.writeFileSync(path.join(evDir, "transcript.txt"), log.lines.join("\n") + "\n");
  return summary;
}

async function featureGildedTrack(j, log, evDir) {
  await ageGate(j, log);
  const signed = await signupFresh(j, log, "SlotVerify");
  writeJson(evDir, "01-signup.json", { email: signed.email, user: signed.user });
  await deposit(j, log, 10000);

  const r = await call(j, "/api/games/slot", {
    method: "POST",
    body: JSON.stringify({ coinCents: 100 }),
  });
  assert(r.status === 200 && r.data.spin, "slot " + JSON.stringify(r));
  const after = r.data.user.balanceCents;
  assert(after === 10000 - r.data.spin.betCents + r.data.spin.winCents, "slot ledger");
  writeJson(evDir, "02-spin.json", r);
  log(`slot bet=${r.data.spin.betCents} win=${r.data.spin.winCents} bal=${after}`);

  const summary = {
    feature: "gilded-track",
    base: BASE,
    ok: true,
    betCents: r.data.spin.betCents,
    winCents: r.data.spin.winCents,
    balanceCents: after,
  };
  writeJson(evDir, "SUMMARY.json", summary);
  fs.writeFileSync(path.join(evDir, "transcript.txt"), log.lines.join("\n") + "\n");
  return summary;
}

async function featureCanopySpire(j, log, evDir) {
  await ageGate(j, log);
  const signed = await signupFresh(j, log, "VaultVerify");
  writeJson(evDir, "01-signup.json", { email: signed.email, user: signed.user });
  await deposit(j, log, 25000);

  const meters = await call(j, "/api/games/slot-progressive");
  assert(meters.status === 200 && meters.data.meters?.length, "meters " + JSON.stringify(meters));
  writeJson(evDir, "02-meters-before.json", meters);
  log(`meters tiers=${meters.data.meters.map((m) => m.name).join(",")}`);

  const beforeBal = (await call(j, "/api/auth/me")).data.user.balanceCents;
  const r = await call(j, "/api/games/slot-progressive", {
    method: "POST",
    body: JSON.stringify({ coinCents: 100 }),
  });
  assert(r.status === 200 && r.data.spin, "vault spin " + JSON.stringify(r.data.error || r));
  writeJson(evDir, "03-spin.json", r);
  log(`vault bet=${r.data.spin.betCents} win=${r.data.spin.winCents} bal=${r.data.user.balanceCents}`);

  assert(r.data.user.balanceCents === beforeBal - r.data.spin.betCents + r.data.spin.winCents, "vault ledger");
  assert(r.data.meters?.length, "meters after present");

  const summary = {
    feature: "canopy-spire",
    base: BASE,
    ok: true,
    betCents: r.data.spin.betCents,
    winCents: r.data.spin.winCents,
    progressiveAwardCents: r.data.spin.progressiveAwardCents ?? 0,
    balanceCents: r.data.user.balanceCents,
    meterNames: (r.data.meters || []).map((m) => m.name),
  };
  writeJson(evDir, "SUMMARY.json", summary);
  fs.writeFileSync(path.join(evDir, "transcript.txt"), log.lines.join("\n") + "\n");
  return summary;
}

async function featureRoulette(j, log, evDir) {
  await ageGate(j, log);
  const signed = await signupFresh(j, log, "RLVerify");
  writeJson(evDir, "01-signup.json", { email: signed.email, user: signed.user });
  await deposit(j, log, 10000);

  const r = await call(j, "/api/games/roulette", {
    method: "POST",
    body: JSON.stringify({ bets: [{ kind: "red", numbers: [], amountCents: 100 }] }),
  });
  assert(r.status === 200 && r.data.spin?.pocket != null, "roulette " + JSON.stringify(r));
  writeJson(evDir, "02-spin.json", r);
  log(`roulette pocket=${r.data.spin.pocket} pay=${r.data.spin.payoutCents} bal=${r.data.user.balanceCents}`);

  const summary = {
    feature: "roulette",
    base: BASE,
    ok: true,
    pocket: r.data.spin.pocket,
    payoutCents: r.data.spin.payoutCents,
    balanceCents: r.data.user.balanceCents,
  };
  writeJson(evDir, "SUMMARY.json", summary);
  fs.writeFileSync(path.join(evDir, "transcript.txt"), log.lines.join("\n") + "\n");
  return summary;
}

const FEATURES = {
  "signup-cage": featureSignupCage,
  blackjack: featureBlackjack,
  "gilded-track": featureGildedTrack,
  "canopy-spire": featureCanopySpire,
  roulette: featureRoulette,
};

async function main() {
  const args = parseArgs(process.argv);
  if (!args.feature || !FEATURES[args.feature]) {
    console.error(
      "Usage: node drive.mjs --feature <" + Object.keys(FEATURES).join("|") + "> [--evidence DIR]"
    );
    process.exit(2);
  }
  const lines = [];
  const log = (s) => {
    lines.push(s);
    log.lines = lines;
    console.log(s);
  };
  log.lines = lines;

  const evDir = ensureEvidenceDir(args.feature, args.evidence);
  console.log(`drive: feature=${args.feature} base=${BASE} evidence=${evDir}`);

  const j = jar();
  try {
    const summary = await FEATURES[args.feature](j, log, evDir);
    console.log("DRIVE_OK " + JSON.stringify(summary));
    console.log("evidence: " + evDir);
  } catch (e) {
    const errPath = path.join(evDir, "FAILURE.json");
    fs.writeFileSync(
      errPath,
      JSON.stringify({ feature: args.feature, error: String(e && e.message ? e.message : e), stack: e?.stack }, null, 2) +
        "\n"
    );
    fs.writeFileSync(path.join(evDir, "transcript.txt"), lines.join("\n") + "\n" + String(e) + "\n");
    console.error("DRIVE_FAIL", e);
    console.error("evidence (failure): " + evDir);
    process.exit(1);
  }
}

main();
