import { describe, it, expect } from "vitest";
import {
  newCrapsTable, applyBet, resolveRoll, rememberChip, undoLastChip,
  takeRoundSnapshot, repeatShortfall, layoutActions, repeatPlan, lockCurrentLayout,
} from "../src/lib/games/craps";

describe("craps", () => {
  it("pass wins 7 and 11 on come-out, loses 2/3/12", () => {
    const t = newCrapsTable();
    applyBet(t, { type: "pass", amount: 1000 });
    const w = resolveRoll(t, [3, 4]);
    expect(w.payoutCents).toBe(1000);
    expect(t.pass).toBe(1000);
    const t2 = newCrapsTable();
    applyBet(t2, { type: "pass", amount: 1000 });
    const l = resolveRoll(t2, [1, 1]);
    expect(l.payoutCents).toBe(0);
    expect(t2.pass).toBe(0);
  });

  it("don't pass bars 12", () => {
    const t = newCrapsTable();
    applyBet(t, { type: "dontPass", amount: 500 });
    const r = resolveRoll(t, [6, 6]);
    expect(r.payoutCents).toBe(0);
    expect(t.dontPass).toBe(500);
  });

  it("establishes a point then seven-out takes pass", () => {
    const t = newCrapsTable();
    applyBet(t, { type: "pass", amount: 1000 });
    resolveRoll(t, [4, 4]);
    expect(t.point).toBe(8);
    applyBet(t, { type: "passOdds", amount: 1000 });
    const seven = resolveRoll(t, [3, 4]);
    expect(t.point).toBeNull();
    expect(t.pass).toBe(0);
    expect(seven.payoutCents).toBe(0);
  });

  it("point hit pays pass and true odds on 8 (6:5)", () => {
    const t = newCrapsTable();
    applyBet(t, { type: "pass", amount: 1000 });
    resolveRoll(t, [5, 3]);
    expect(t.point).toBe(8);
    applyBet(t, { type: "passOdds", amount: 1000 });
    const hit = resolveRoll(t, [2, 6]);
    expect(t.point).toBeNull();
    expect(hit.payoutCents).toBe(3200);
  });

  it("field pays 3:1 on 12 including stake", () => {
    const t = newCrapsTable();
    applyBet(t, { type: "field", amount: 100 });
    const r = resolveRoll(t, [6, 6]);
    expect(r.payoutCents).toBe(400);
  });

  it("undo takes back the last chip", () => {
    const t = newCrapsTable();
    const a = { type: "field" as const, amount: 500 };
    applyBet(t, a);
    rememberChip(t, a);
    applyBet(t, { type: "pass", amount: 1000 });
    rememberChip(t, { type: "pass", amount: 1000 });
    expect(t.pass).toBe(1000);
    expect(t.field).toBe(500);
    const u = undoLastChip(t);
    expect(u.type).toBe("pass");
    expect(t.pass).toBe(0);
    expect(t.field).toBe(500);
  });

  it("snapshot keeps the full layout, not just new chips", () => {
    const t = newCrapsTable();
    applyBet(t, { type: "pass", amount: 1000 });
    rememberChip(t, { type: "pass", amount: 1000 });
    resolveRoll(t, [4, 4]);
    expect(t.point).toBe(8);
    applyBet(t, { type: "field", amount: 500 });
    rememberChip(t, { type: "field", amount: 500 });
    takeRoundSnapshot(t);
    const types = t.lastRound.map((x) => x.type).sort();
    expect(types).toEqual(["field", "pass"]);
  });

  it("empty roll does not wipe the last pattern", () => {
    const t = newCrapsTable();
    applyBet(t, { type: "field", amount: 200 });
    takeRoundSnapshot(t);
    expect(t.lastRound).toHaveLength(1);
    t.field = 0;
    takeRoundSnapshot(t);
    expect(t.lastRound).toHaveLength(1);
    expect(t.lastRound[0]!.type).toBe("field");
  });

  it("repeat tops up field after a roll without doubling working pass", () => {
    const t = newCrapsTable();
    applyBet(t, { type: "pass", amount: 1000 });
    applyBet(t, { type: "field", amount: 500 });
    takeRoundSnapshot(t);
    resolveRoll(t, [5, 3]); // point 8, field loses (8 not a field number)
    expect(t.pass).toBe(1000);
    expect(t.field).toBe(0);
    const need = repeatShortfall(t);
    expect(need).toHaveLength(1);
    expect(need[0]!.type).toBe("field");
    expect(need[0]!.amount).toBe(500);
  });

  it("repeat restores pass after seven-out", () => {
    const t = newCrapsTable();
    applyBet(t, { type: "pass", amount: 1000 });
    resolveRoll(t, [4, 4]);
    applyBet(t, { type: "field", amount: 200 });
    takeRoundSnapshot(t);
    resolveRoll(t, [3, 4]); // seven-out
    expect(t.pass).toBe(0);
    const need = repeatShortfall(t);
    const types = need.map((x) => x.type).sort();
    expect(types).toEqual(["field", "pass"]);
  });

  it("layout lists working place bets", () => {
    const t = newCrapsTable();
    applyBet(t, { type: "place", number: 6, amount: 600 });
    const layout = layoutActions(t);
    expect(layout).toEqual([{ type: "place", number: 6, amount: 600 }]);
  });

  it("accepts place numbers that arrived as strings", () => {
    const t = newCrapsTable();
    applyBet(t, { type: "place", number: "6" as unknown as 6, amount: 600 });
    expect(t.place["6"]).toBe(600);
  });

  it("repeat plan restores field without doubling working pass", () => {
    const t = newCrapsTable();
    applyBet(t, { type: "pass", amount: 1000 });
    applyBet(t, { type: "field", amount: 500 });
    lockCurrentLayout(t);
    resolveRoll(t, [5, 3]);
    const plan = repeatPlan(t);
    expect(plan).toEqual([{ type: "field", amount: 500 }]);
  });

  it("always last bet keeps the full pattern through seven-out, then puts odds up once a point is on", () => {
    const t = newCrapsTable();
    t.alwaysRepeat = true;
    applyBet(t, { type: "pass", amount: 1000 });
    resolveRoll(t, [4, 4]);
    applyBet(t, { type: "passOdds", amount: 1000 });
    applyBet(t, { type: "field", amount: 500 });
    lockCurrentLayout(t);
    expect(t.lastRound.map((x) => x.type).sort()).toEqual(["field", "pass", "passOdds"]);
    takeRoundSnapshot(t);
    resolveRoll(t, [3, 4]);
    expect(t.pass).toBe(0);
    expect(t.lastRound.map((x) => x.type).sort()).toEqual(["field", "pass", "passOdds"]);
    const first = repeatPlan(t);
    expect(first.map((x) => x.type).sort()).toEqual(["field", "pass"]);
    for (const a of first) applyBet(t, a);
    expect(t.pass).toBe(1000);
    expect(t.field).toBe(500);
    resolveRoll(t, [5, 3]);
    expect(t.point).toBe(8);
    const second = repeatPlan(t);
    expect(second.some((x) => x.type === "passOdds" && x.amount === 1000)).toBe(true);
    expect(second.some((x) => x.type === "field" && x.amount === 500)).toBe(true);
  });

  it("late repeat turns a locked pass into come when the point is already on", () => {
    const t = newCrapsTable();
    applyBet(t, { type: "pass", amount: 1000 });
    applyBet(t, { type: "place", number: 6, amount: 600 });
    lockCurrentLayout(t);
    resolveRoll(t, [4, 4]);
    t.pass = 0;
    const plan = repeatPlan(t);
    expect(plan.some((x) => x.type === "come" && x.amount === 1000)).toBe(true);
    expect(t.place["6"]).toBe(600);
  });
});
