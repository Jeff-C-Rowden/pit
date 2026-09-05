const BASE = "http://127.0.0.1:3000";

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

async function call(j, path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const h = j.header();
  if (h) headers.cookie = h;
  if (opts.body && !headers["content-type"]) headers["content-type"] = "application/json";
  const res = await fetch(BASE + path, { ...opts, headers });
  j.eat(res);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const out = [];
function log(s) { out.push(s); console.log(s); }

const a = jar();
let r = await call(a, "/api/auth/me", { method: "POST", body: JSON.stringify({ age: 21 }) });
assert(r.status === 200 && r.data.age === 21, "age gate " + JSON.stringify(r));
log("age ok");

const email = `jeff${Date.now()}@pit.test`;
r = await call(a, "/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password: "password1", displayName: "Jeff" }) });
assert(r.status === 200 && r.data.user, "signup " + JSON.stringify(r));
log("signup " + email + " bal=" + r.data.user.balanceCents);

r = await call(a, "/api/wallet/deposit", { method: "POST", body: JSON.stringify({ amountCents: 10000 }) });
assert(r.data.user.balanceCents === 10000, "deposit " + JSON.stringify(r));
log("deposit 100.00");

r = await call(a, "/api/games/slot", { method: "POST", body: JSON.stringify({ coinCents: 100 }) });
assert(r.status === 200 && r.data.spin, "slot " + JSON.stringify(r));
const afterSlot = r.data.user.balanceCents;
assert(afterSlot === 10000 - r.data.spin.betCents + r.data.spin.winCents, "slot ledger");
log("slot bet=" + r.data.spin.betCents + " win=" + r.data.spin.winCents + " bal=" + afterSlot);

r = await call(a, "/api/games/blackjack", { method: "POST", body: JSON.stringify({ action: "deal", betCents: 500 }) });
assert(r.status === 200 && r.data.game, "bj deal " + JSON.stringify(r.data.error || r.data.game?.phase));
log("bj phase=" + r.data.game.phase + " bal=" + r.data.user.balanceCents);
if (r.data.game.phase === "play") {
  r = await call(a, "/api/games/blackjack", { method: "POST", body: JSON.stringify({ action: "stand", gameId: r.data.game.id }) });
  log("bj stand result=" + r.data.game.result + " pay=" + r.data.game.payoutCents);
} else if (r.data.game.phase === "insurance") {
  r = await call(a, "/api/games/blackjack", { method: "POST", body: JSON.stringify({ action: "insurance", take: false, gameId: r.data.game.id }) });
  if (r.data.game.phase === "play") {
    r = await call(a, "/api/games/blackjack", { method: "POST", body: JSON.stringify({ action: "stand", gameId: r.data.game.id }) });
  }
  log("bj after ins " + r.data.game.phase + " " + r.data.game.result);
}

r = await call(a, "/api/games/roulette", { method: "POST", body: JSON.stringify({ bets: [{ kind: "red", numbers: [], amountCents: 100 }] }) });
assert(r.status === 200 && r.data.spin.pocket, "roulette " + JSON.stringify(r));
log("roulette pocket=" + r.data.spin.pocket + " pay=" + r.data.spin.payoutCents);

r = await call(a, "/api/games/craps", { method: "POST", body: JSON.stringify({ action: "bet", bet: { type: "pass", amount: 100 } }) });
assert(r.status === 200, "craps bet " + JSON.stringify(r));
r = await call(a, "/api/games/craps", { method: "POST", body: JSON.stringify({ action: "roll" }) });
assert(r.status === 200 && r.data.roll, "craps roll " + JSON.stringify(r));
log("craps roll=" + r.data.roll + " pay=" + r.data.payoutCents);

r = await call(a, "/api/games/holdem", { method: "POST", body: JSON.stringify({ action: "deal" }) });
assert(r.status === 200 && r.data.game, "holdem " + JSON.stringify(r.data.error || r.status));
log("holdem street=" + r.data.game.street + " toAct=" + r.data.game.toAct + " pot=" + r.data.game.pot);
if (r.data.game.toAct === "player") {
  const gid = r.data.game.id;
  if (r.data.game.toCall > 0) {
    r = await call(a, "/api/games/holdem", { method: "POST", body: JSON.stringify({ action: "call", gameId: gid }) });
  } else {
    r = await call(a, "/api/games/holdem", { method: "POST", body: JSON.stringify({ action: "check", gameId: gid }) });
  }
  log("holdem after act street=" + r.data.game?.street + " err=" + (r.data.error || ""));
}

r = await call(a, "/api/games/paigow", { method: "POST", body: JSON.stringify({ action: "deal", betCents: 500 }) });
assert(r.status === 200 && r.data.game, "paigow deal " + JSON.stringify(r));
r = await call(a, "/api/games/paigow", { method: "POST", body: JSON.stringify({ action: "houseway", gameId: r.data.game.id }) });
assert(r.status === 200 && r.data.game.phase === "settled", "paigow set " + JSON.stringify(r.data.error || r.data.game?.result));
log("paigow " + r.data.game.result + " pay=" + r.data.game.payoutCents);

const balBeforeWd = r.data.user.balanceCents;
r = await call(a, "/api/wallet/withdraw", { method: "POST", body: JSON.stringify({ amountCents: 1000 }) });
assert(r.status === 200 && r.data.withdrawal.status === "pending", "wd " + JSON.stringify(r));
assert(r.data.user.balanceCents === balBeforeWd - 1000, "wd debit");
log("withdraw pending, bal=" + r.data.user.balanceCents);

// tamper: try to credit via fake payout-like body
r = await call(a, "/api/games/slot", { method: "POST", body: JSON.stringify({ coinCents: 100, winCents: 999999, balanceCents: 999999 }) });
assert(r.status === 200, "tamper request should still play a real spin");
assert(r.data.user.balanceCents < 500000, "tamper did not credit 999999, bal=" + r.data.user.balanceCents);
log("tamper ignored, bal=" + r.data.user.balanceCents);

// second user
const b = jar();
await call(b, "/api/auth/me", { method: "POST", body: JSON.stringify({ age: 21 }) });
const email2 = `other${Date.now()}@pit.test`;
r = await call(b, "/api/auth/signup", { method: "POST", body: JSON.stringify({ email: email2, password: "password1", displayName: "Other" }) });
assert(r.data.user.balanceCents === 0, "user2 starts at 0");
r = await call(b, "/api/auth/me");
assert(r.data.user.balanceCents === 0, "user2 cannot see user1 wallet");
log("user2 isolated bal=0");

r = await call(b, "/api/wallet/deposit", { method: "POST", body: JSON.stringify({ amountCents: 2500 }) });
const u2 = r.data.user.balanceCents;
r = await call(a, "/api/auth/me");
assert(r.data.user.balanceCents !== u2, "balances differ");
log("user1 bal=" + r.data.user.balanceCents + " user2 bal=" + u2);

log("E2E_OK");
