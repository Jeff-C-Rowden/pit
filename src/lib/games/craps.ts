import { randInt, newId } from "../rng";

export type ComeBet = { id: string; amount: number; point: number | null; odds: number };
export type PlaceAction =
  | { type: "pass" | "dontPass" | "come" | "dontCome" | "field" | "anySeven" | "anyCraps" | "yo"; amount: number }
  | { type: "passOdds" | "dontPassOdds"; amount: number }
  | { type: "place" | "hard"; number: 4 | 5 | 6 | 8 | 9 | 10; amount: number }
  | { type: "comeOdds" | "dontComeOdds"; id: string; amount: number };

export type CrapsState = {
  id: string;
  point: number | null;
  pass: number;
  passOdds: number;
  dontPass: number;
  dontPassOdds: number;
  come: ComeBet[];
  dontCome: ComeBet[];
  place: Record<string, number>;
  field: number;
  anySeven: number;
  anyCraps: number;
  yo: number;
  hard: Record<string, number>;
  lastRoll: [number, number] | null;
  lastTotal: number | null;
  log: string[];
  pendingChips: PlaceAction[];
  lastRound: PlaceAction[];
  alwaysRepeat: boolean;
};

const PLACE_NUMS = [4, 5, 6, 8, 9, 10];

export function newCrapsTable(): CrapsState {
  return {
    id: newId(),
    point: null,
    pass: 0,
    passOdds: 0,
    dontPass: 0,
    dontPassOdds: 0,
    come: [],
    dontCome: [],
    place: { "4": 0, "5": 0, "6": 0, "8": 0, "9": 0, "10": 0 },
    field: 0,
    anySeven: 0,
    anyCraps: 0,
    yo: 0,
    hard: { "4": 0, "6": 0, "8": 0, "10": 0 },
    lastRoll: null,
    lastTotal: null,
    log: ["Come-out roll. Place bets are off."],
    pendingChips: [],
    lastRound: [],
    alwaysRepeat: false,
  };
}


export function applyBet(s: CrapsState, a: PlaceAction): number {
  const amt = Math.round(Number("amount" in a ? a.amount : 0));
  if (!Number.isInteger(amt) || amt <= 0) throw new Error("invalid bet");
  if (amt > 5_000_00) throw new Error("max bet $5,000");
  if ("number" in a) (a as { number: number }).number = Number((a as { number: unknown }).number) as 4 | 5 | 6 | 8 | 9 | 10;
  switch (a.type) {
    case "pass":
      if (s.point != null) throw new Error("pass line only on come-out");
      s.pass += amt;
      s.log.push(`Pass line +${amt}`);
      return amt;
    case "dontPass":
      if (s.point != null) throw new Error("don't pass only on come-out");
      s.dontPass += amt;
      s.log.push(`Don't pass +${amt}`);
      return amt;
    case "come":
      if (s.point == null) throw new Error("come bets after a point is on");
      s.come.push({ id: newId(), amount: amt, point: null, odds: 0 });
      s.log.push(`Come +${amt}`);
      return amt;
    case "dontCome":
      if (s.point == null) throw new Error("don't come after a point is on");
      s.dontCome.push({ id: newId(), amount: amt, point: null, odds: 0 });
      s.log.push(`Don't come +${amt}`);
      return amt;
    case "passOdds":
      if (s.point == null || s.pass <= 0) throw new Error("no pass bet to take odds");
      s.passOdds += amt;
      return amt;
    case "dontPassOdds":
      if (s.point == null || s.dontPass <= 0) throw new Error("no don't pass to lay odds");
      s.dontPassOdds += amt;
      return amt;
    case "comeOdds": {
      const c = s.come.find((x) => x.id === a.id);
      if (!c || c.point == null) throw new Error("come odds only on numbered come");
      c.odds += amt;
      return amt;
    }
    case "dontComeOdds": {
      const c = s.dontCome.find((x) => x.id === a.id);
      if (!c || c.point == null) throw new Error("don't come odds only on numbered bet");
      c.odds += amt;
      return amt;
    }
    case "place":
      if (!PLACE_NUMS.includes(a.number)) throw new Error("invalid place number");
      s.place[String(a.number)] = (s.place[String(a.number)] || 0) + amt;
      return amt;
    case "hard":
      if (![4, 6, 8, 10].includes(a.number)) throw new Error("invalid hardway");
      s.hard[String(a.number)] = (s.hard[String(a.number)] || 0) + amt;
      return amt;
    case "field":
      s.field += amt;
      return amt;
    case "anySeven":
      s.anySeven += amt;
      return amt;
    case "anyCraps":
      s.anyCraps += amt;
      return amt;
    case "yo":
      s.yo += amt;
      return amt;
  }
}

function ensureChips(s: CrapsState) {
  if (!s.pendingChips) s.pendingChips = [];
  if (!s.lastRound) s.lastRound = [];
  if (s.alwaysRepeat == null) s.alwaysRepeat = false;
}

export function rememberChip(s: CrapsState, a: PlaceAction) {
  ensureChips(s);
  s.pendingChips.push({ ...a });
}

export function layoutActions(s: CrapsState): PlaceAction[] {
  ensureChips(s);
  const a: PlaceAction[] = [];
  if (s.pass) a.push({ type: "pass", amount: s.pass });
  if (s.passOdds) a.push({ type: "passOdds", amount: s.passOdds });
  if (s.dontPass) a.push({ type: "dontPass", amount: s.dontPass });
  if (s.dontPassOdds) a.push({ type: "dontPassOdds", amount: s.dontPassOdds });
  if (s.field) a.push({ type: "field", amount: s.field });
  if (s.anySeven) a.push({ type: "anySeven", amount: s.anySeven });
  if (s.anyCraps) a.push({ type: "anyCraps", amount: s.anyCraps });
  if (s.yo) a.push({ type: "yo", amount: s.yo });
  for (const n of [4, 5, 6, 8, 9, 10] as const) {
    const amt = s.place[String(n)] || 0;
    if (amt) a.push({ type: "place", number: n, amount: amt });
  }
  for (const n of [4, 6, 8, 10] as const) {
    const amt = s.hard[String(n)] || 0;
    if (amt) a.push({ type: "hard", number: n, amount: amt });
  }
  const comeFlat = s.come.reduce((n, c) => n + c.amount, 0);
  if (comeFlat) a.push({ type: "come", amount: comeFlat });
  const dcFlat = s.dontCome.reduce((n, c) => n + c.amount, 0);
  if (dcFlat) a.push({ type: "dontCome", amount: dcFlat });
  for (const c of s.come) {
    if (c.odds) a.push({ type: "comeOdds", id: c.id, amount: c.odds });
  }
  for (const c of s.dontCome) {
    if (c.odds) a.push({ type: "dontComeOdds", id: c.id, amount: c.odds });
  }
  return a;
}

export function currentAmount(s: CrapsState, a: PlaceAction): number {
  switch (a.type) {
    case "pass": return s.pass;
    case "dontPass": return s.dontPass;
    case "passOdds": return s.passOdds;
    case "dontPassOdds": return s.dontPassOdds;
    case "field": return s.field;
    case "anySeven": return s.anySeven;
    case "anyCraps": return s.anyCraps;
    case "yo": return s.yo;
    case "place": return s.place[String(a.number)] || 0;
    case "hard": return s.hard[String(a.number)] || 0;
    case "come": return s.come.reduce((n, c) => n + c.amount, 0);
    case "dontCome": return s.dontCome.reduce((n, c) => n + c.amount, 0);
    case "comeOdds": {
      const c = s.come.find((x) => x.id === a.id);
      return c?.odds ?? 0;
    }
    case "dontComeOdds": {
      const c = s.dontCome.find((x) => x.id === a.id);
      return c?.odds ?? 0;
    }
  }
}

/** Snapshot every chip on the felt before the roll. A locked Always-last-bet pattern is sticky. */
export function takeRoundSnapshot(s: CrapsState) {
  ensureChips(s);
  if (s.alwaysRepeat && s.lastRound.length) {
    s.pendingChips = [];
    return;
  }
  const layout = layoutActions(s);
  if (layout.length) s.lastRound = layout;
  s.pendingChips = [];
}

const REPEAT_RANK: Record<string, number> = {
  pass: 0, dontPass: 1, place: 2, hard: 3, field: 4,
  anySeven: 5, anyCraps: 6, yo: 7, come: 8, dontCome: 9,
  passOdds: 10, dontPassOdds: 11, comeOdds: 12, dontComeOdds: 13,
};

/** Map a locked bet onto what can sit right now. Pass becomes come if the point is already on. */
export function legalizeRepeatBet(s: CrapsState, a: PlaceAction): PlaceAction | null {
  if (a.type === "pass" && s.point != null) {
    if (s.pass > 0) return a;
    return { type: "come", amount: a.amount };
  }
  if (a.type === "dontPass" && s.point != null) {
    if (s.dontPass > 0) return a;
    return { type: "dontCome", amount: a.amount };
  }
  if (a.type === "passOdds" && (s.point == null || s.pass <= 0)) return null;
  if (a.type === "dontPassOdds" && (s.point == null || s.dontPass <= 0)) return null;
  if (a.type === "come" && s.point == null) return null;
  if (a.type === "dontCome" && s.point == null) return null;
  return a;
}

/** Chips to add so the table matches the locked pattern as closely as the puck allows. */
export function repeatPlan(s: CrapsState, pattern?: PlaceAction[]): PlaceAction[] {
  ensureChips(s);
  const src = ((pattern && pattern.length) ? pattern : s.lastRound).map((x) => ({ ...x })) as PlaceAction[];
  if (src.length) s.lastRound = src.map((x) => ({ ...x }));
  const ordered = [...src].sort((a, b) => (REPEAT_RANK[a.type] ?? 50) - (REPEAT_RANK[b.type] ?? 50));
  const out: PlaceAction[] = [];
  const ghost: Record<string, number> = {};
  const keyOf = (a: PlaceAction) => a.type === "place" || a.type === "hard"
    ? `${a.type}:${a.number}`
    : a.type === "comeOdds" || a.type === "dontComeOdds"
      ? `${a.type}:${a.id}`
      : a.type;
  for (const raw of ordered) {
    const a = legalizeRepeatBet(s, raw);
    if (!a) continue;
    const k = keyOf(a);
    const have = (ghost[k] ?? 0) + currentAmount(s, a);
    const need = raw.amount - have;
    if (need <= 0) continue;
    const bet = withAmount(a, need);
    out.push(bet);
    ghost[k] = (ghost[k] ?? 0) + need;
  }
  return out;
}

export function lockCurrentLayout(s: CrapsState) {
  ensureChips(s);
  const layout = layoutActions(s);
  if (layout.length) s.lastRound = layout;
}


function withAmount(a: PlaceAction, amount: number): PlaceAction {
  return { ...a, amount } as PlaceAction;
}

/** Bets from lastRound that are short on the current table. */
export function repeatShortfall(s: CrapsState): PlaceAction[] {
  ensureChips(s);
  const out: PlaceAction[] = [];
  for (const a of s.lastRound) {
    const need = a.amount - currentAmount(s, a);
    if (need > 0) out.push(withAmount(a, need));
  }
  return out;
}

function sub(cur: number, amt: number) {
  const next = cur - amt;
  if (next < 0) throw new Error("nothing to take back");
  return next;
}

export function undoLastChip(s: CrapsState): PlaceAction {
  ensureChips(s);
  const a = s.pendingChips.pop();
  if (!a) throw new Error("no chip to take back");
  const amt = a.amount;
  switch (a.type) {
    case "pass":
      s.pass = sub(s.pass, amt);
      break;
    case "dontPass":
      s.dontPass = sub(s.dontPass, amt);
      break;
    case "passOdds":
      s.passOdds = sub(s.passOdds, amt);
      break;
    case "dontPassOdds":
      s.dontPassOdds = sub(s.dontPassOdds, amt);
      break;
    case "field":
      s.field = sub(s.field, amt);
      break;
    case "anySeven":
      s.anySeven = sub(s.anySeven, amt);
      break;
    case "anyCraps":
      s.anyCraps = sub(s.anyCraps, amt);
      break;
    case "yo":
      s.yo = sub(s.yo, amt);
      break;
    case "place":
      s.place[String(a.number)] = sub(s.place[String(a.number)] || 0, amt);
      break;
    case "hard":
      s.hard[String(a.number)] = sub(s.hard[String(a.number)] || 0, amt);
      break;
    case "come": {
      const i = [...s.come].map((c, idx) => ({ c, idx })).reverse().find((x) => x.c.amount === amt && x.c.point == null);
      if (!i) throw new Error("that come bet already moved");
      s.come.splice(i.idx, 1);
      break;
    }
    case "dontCome": {
      const i = [...s.dontCome].map((c, idx) => ({ c, idx })).reverse().find((x) => x.c.amount === amt && x.c.point == null);
      if (!i) throw new Error("that don't come bet already moved");
      s.dontCome.splice(i.idx, 1);
      break;
    }
    case "comeOdds": {
      const c = s.come.find((x) => x.id === a.id);
      if (!c) throw new Error("come odds gone");
      c.odds = sub(c.odds, amt);
      break;
    }
    case "dontComeOdds": {
      const c = s.dontCome.find((x) => x.id === a.id);
      if (!c) throw new Error("don't come odds gone");
      c.odds = sub(c.odds, amt);
      break;
    }
  }
  s.log.push(`Took back last chip (${a.type} ${amt})`);
  return a;
}

function oddsPay(point: number, oddsAmt: number, isLay: boolean): number {
  // true odds. Returns profit only? We'll return total return including stake for winner.
  if (!isLay) {
    if (point === 4 || point === 10) return oddsAmt + oddsAmt * 2;
    if (point === 5 || point === 9) return oddsAmt + Math.floor(oddsAmt * 3 / 2);
    if (point === 6 || point === 8) return oddsAmt + Math.floor(oddsAmt * 6 / 5);
  } else {
    // lay odds: 4/10 1:2, 5/9 2:3, 6/8 5:6
    if (point === 4 || point === 10) return oddsAmt + Math.floor(oddsAmt / 2);
    if (point === 5 || point === 9) return oddsAmt + Math.floor(oddsAmt * 2 / 3);
    if (point === 6 || point === 8) return oddsAmt + Math.floor(oddsAmt * 5 / 6);
  }
  return oddsAmt;
}

function placePay(n: number, amt: number): number {
  // returns total including stake
  if (n === 4 || n === 10) return amt + Math.floor(amt * 9 / 5);
  if (n === 5 || n === 9) return amt + Math.floor(amt * 7 / 5);
  if (n === 6 || n === 8) return amt + Math.floor(amt * 7 / 6);
  return 0;
}

export function rollDice(): [number, number] {
  return [randInt(6) + 1, randInt(6) + 1];
}

export function resolveRoll(s: CrapsState, dice: [number, number]): { payoutCents: number; notes: string[] } {
  const [d1, d2] = dice;
  const t = d1 + d2;
  s.lastRoll = [d1, d2];
  s.lastTotal = t;
  const notes: string[] = [];
  let pay = 0;
  const hard = d1 === d2;

  // one-roll props always working
  if (s.field) {
    if ([3, 4, 9, 10, 11].includes(t)) {
      pay += s.field * 2;
      notes.push("field wins");
    } else if (t === 2) {
      pay += s.field * 3;
      notes.push("field 2 pays 2:1");
    } else if (t === 12) {
      pay += s.field * 4;
      notes.push("field 12 pays 3:1");
    } else notes.push("field loses");
    s.field = 0;
  }
  if (s.anySeven) {
    if (t === 7) { pay += s.anySeven * 5; notes.push("any 7"); } else notes.push("any 7 loses");
    s.anySeven = 0;
  }
  if (s.anyCraps) {
    if ([2, 3, 12].includes(t)) { pay += s.anyCraps * 8; notes.push("any craps"); } else notes.push("any craps loses");
    s.anyCraps = 0;
  }
  if (s.yo) {
    if (t === 11) { pay += s.yo * 16; notes.push("yo 11"); } else notes.push("yo loses");
    s.yo = 0;
  }
  for (const n of [4, 6, 8, 10]) {
    const amt = s.hard[String(n)] || 0;
    if (!amt) continue;
    if (t === 7) { s.hard[String(n)] = 0; notes.push(`hard ${n} seven-out`); }
    else if (t === n && hard) {
      const odds = n === 4 || n === 10 ? 7 : 9;
      pay += amt * (odds + 1);
      s.hard[String(n)] = 0;
      notes.push(`hard ${n} hits`);
    } else if (t === n && !hard) {
      s.hard[String(n)] = 0;
      notes.push(`easy ${n} takes hardway`);
    }
  }

  const comeOut = s.point == null;

  if (comeOut) {
    if (t === 7 || t === 11) {
      if (s.pass) { pay += s.pass; notes.push("pass wins 1:1 (bet stays)"); }
      if (s.dontPass) { notes.push("don't pass loses"); s.dontPass = 0; s.dontPassOdds = 0; }
    } else if (t === 2 || t === 3) {
      if (s.pass) { notes.push("pass loses craps"); s.pass = 0; s.passOdds = 0; }
      if (s.dontPass) { pay += s.dontPass; notes.push("don't pass wins 1:1 (bet stays)"); }
    } else if (t === 12) {
      if (s.pass) { notes.push("pass loses 12"); s.pass = 0; s.passOdds = 0; }
      if (s.dontPass) notes.push("don't pass bar 12 (push)");
    } else {
      s.point = t;
      notes.push(`point is ${t}`);
    }
  } else {
    // place bets working when point is on
    if (PLACE_NUMS.includes(t)) {
      const amt = s.place[String(t)] || 0;
      if (amt) {
        pay += placePay(t, amt) - amt;
        notes.push(`place ${t} wins (bet stays)`);
      }
    }
    if (t === 7) {
      notes.push("seven-out");
      if (s.pass) { s.pass = 0; s.passOdds = 0; notes.push("pass loses"); }
      if (s.dontPass) {
        pay += s.dontPass + (s.dontPassOdds ? oddsPay(s.point!, s.dontPassOdds, true) : 0);
        notes.push("don't pass wins");
        s.dontPassOdds = 0;
      }
      for (const n of PLACE_NUMS) {
        if (s.place[String(n)]) notes.push(`place ${n} loses`);
        s.place[String(n)] = 0;
      }
      // come numbered lose, don't come numbered win
      for (const c of s.come) {
        if (c.point != null) notes.push("come point loses");
        else {
          pay += c.amount * 2;
          notes.push("come wins 7 (taken down)");
        }
      }
      s.come = [];
      for (const c of s.dontCome) {
        if (c.point != null) {
          pay += c.amount * 2 + (c.odds ? oddsPay(c.point, c.odds, true) : 0);
          notes.push("don't come number wins");
        } else notes.push("don't come loses 7");
      }
      s.dontCome = [];
      s.point = null;
    } else if (t === s.point) {
      notes.push("point hit");
      if (s.pass) {
        pay += s.pass + (s.passOdds ? oddsPay(s.point, s.passOdds, false) : 0);
        notes.push("pass wins 1:1 (bet stays)");
      }
      if (s.dontPass) { s.dontPass = 0; s.dontPassOdds = 0; notes.push("don't pass loses"); }
      // come bets on this number win
      const remainC: ComeBet[] = [];
      for (const c of s.come) {
        if (c.point === t) {
          pay += c.amount * 2 + (c.odds ? oddsPay(c.point, c.odds, false) : 0);
          notes.push("come point wins");
        } else remainC.push(c);
      }
      s.come = remainC;
      const remainD: ComeBet[] = [];
      for (const c of s.dontCome) {
        if (c.point === t) notes.push("don't come number loses");
        else remainD.push(c);
      }
      s.dontCome = remainD;
      s.point = null;
      s.passOdds = 0;
      s.dontPassOdds = 0;
    } else if (t === 11) {
      // come / dont come like come-out
    } else if ([2, 3, 12].includes(t)) {
      // come craps
    }

    // unresolved come box (point-null come bets) behave like pass on this roll
    if (t !== 7) {
      const nextCome: ComeBet[] = [];
      for (const c of s.come) {
        if (c.point != null) { nextCome.push(c); continue; }
        if (t === 7 || t === 11) {
          pay += c.amount * 2;
          notes.push("come wins");
        } else if ([2, 3, 12].includes(t)) {
          notes.push("come loses craps");
        } else {
          c.point = t;
          notes.push(`come moves to ${t}`);
          nextCome.push(c);
        }
      }
      s.come = nextCome;
      const nextDc: ComeBet[] = [];
      for (const c of s.dontCome) {
        if (c.point != null) { nextDc.push(c); continue; }
        if (t === 7 || t === 11) {
          notes.push("don't come loses");
        } else if (t === 2 || t === 3) {
          pay += c.amount * 2;
          notes.push("don't come wins");
        } else if (t === 12) {
          notes.push("don't come bar 12");
          nextDc.push(c);
        } else {
          c.point = t;
          notes.push(`don't come moves to ${t}`);
          nextDc.push(c);
        }
      }
      s.dontCome = nextDc;
    }
  }

  s.log.push(`Roll ${d1}+${d2}=${t}. ${notes.join("; ") || "no action"}`);
  if (s.log.length > 40) s.log = s.log.slice(-40);
  return { payoutCents: pay, notes };
}

export function publicCraps(s: CrapsState) {
  return {
    id: s.id,
    point: s.point,
    comeOut: s.point == null,
    pass: s.pass,
    passOdds: s.passOdds,
    dontPass: s.dontPass,
    dontPassOdds: s.dontPassOdds,
    come: s.come,
    dontCome: s.dontCome,
    place: s.place,
    field: s.field,
    anySeven: s.anySeven,
    anyCraps: s.anyCraps,
    yo: s.yo,
    hard: s.hard,
    lastRoll: s.lastRoll,
    lastTotal: s.lastTotal,
    log: s.log,
    canUndo: (s.pendingChips || []).length > 0,
    canRepeat: (s.lastRound || []).length > 0,
    lastRound: s.lastRound || [],
    alwaysRepeat: !!s.alwaysRepeat,
    payouts: {
      pass: "1:1",
      odds: "4/10 2:1 · 5/9 3:2 · 6/8 6:5",
      place: "6/8 7:6 · 5/9 7:5 · 4/10 9:5",
      field: "2 pays 2:1, 12 pays 3:1, others 1:1",
      anySeven: "4:1",
      anyCraps: "7:1",
      yo: "15:1",
      hard: "4/10 7:1 · 6/8 9:1",
    },
  };
}
