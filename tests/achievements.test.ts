import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  ACHIEVEMENTS, applyEvent, emptyProgress, markToasted, parseProgress, pendingToasts, summary, toastText, unlockedIds,
} from "@/lib/achievements";
import { GAME_PATHS } from "@/lib/lobby";

describe("exploration achievements", () => {
  it("starts empty and survives corrupt storage", () => {
    expect(unlockedIds(emptyProgress())).toEqual([]);
    expect(parseProgress("{nope")).toEqual(emptyProgress());
    expect(parseProgress(JSON.stringify({ tables: ["/wallet", "/slot", 3], rules: "yes", toasted: ["bogus", "rules"] })))
      .toEqual({ tables: ["/slot"], rules: false, coach: false, limit: false, toasted: ["rules"] });
  });
  it("first seat unlocks once; non-game paths count for nothing", () => {
    let r = applyEvent(emptyProgress(), { kind: "seat", href: "/floor" });
    expect(r.unlocked).toEqual([]);
    r = applyEvent(r.next, { kind: "seat", href: "/roulette" });
    expect(r.unlocked).toEqual(["first-seat"]);
    r = applyEvent(r.next, { kind: "seat", href: "/roulette" });
    expect(r.unlocked).toEqual([]);
    expect(r.next.tables).toEqual(["/roulette"]);
  });
  it("every table needs all nine games (incl. Bounty Bars), in any order", () => {
    let p = emptyProgress();
    const order = [...GAME_PATHS].reverse();
    let last: string[] = [];
    for (const h of order) { const r = applyEvent(p, { kind: "seat", href: h }); p = r.next; last = r.unlocked; }
    expect(GAME_PATHS).toHaveLength(9);
    expect(last).toEqual(["every-table"]);
    expect(summary(p)).toMatchObject({ tablesSeen: 9, tablesTotal: 9, done: 2, total: 5 });
  });
  it("rules, coach and limit unlock independently", () => {
    let p = emptyProgress();
    for (const k of ["rules", "coach", "limit"] as const) {
      const r = applyEvent(p, { kind: k }); p = r.next;
      expect(r.unlocked).toEqual([k]);
      expect(applyEvent(p, { kind: k }).unlocked).toEqual([]);
    }
  });
  it("toasts each unlock at most once", () => {
    let p = applyEvent(emptyProgress(), { kind: "rules" }).next;
    expect(pendingToasts(p)).toEqual(["rules"]);
    p = markToasted(p, ["rules"]);
    expect(pendingToasts(p)).toEqual([]);
    expect(toastText(["rules"])).toBe("Achievement: Read the house rules");
    expect(toastText([])).toBeNull();
  });
  it("never rewards losses, betting volume, streaks, time, or chips", () => {
    const text = ACHIEVEMENTS.map((a) => `${a.id} ${a.title} ${a.hint}`).join(" ").toLowerCase();
    for (const bad of ["loss", "lose", "wager", "streak", "minute", "hour", "spin 1", "win ", "chips", "$"]) expect(text).not.toContain(bad);
    const src = readFileSync("src/lib/achievements.ts", "utf8");
    expect(src).not.toMatch(/\/api\/|fetch\(|balance|credit/i);
  });
  it("Floor strip is labeled sandbox, device-only, original art and non-modal toast", () => {
    const c = readFileSync("src/components/Achievements.tsx", "utf8");
    expect(c).toContain("Sandbox / test chips");
    expect(c).toContain("no chips, never for bets or losses");
    expect(c).toContain("<svg");
    expect(c).not.toMatch(/<img|https?:\/\/(?!www\.w3)/);
    expect(c).toContain('role="status"');
    expect(c).not.toContain('role="dialog"');
    expect(readFileSync("src/app/floor/page.tsx", "utf8")).toContain("<AchievementStrip />");
    expect(readFileSync("src/app/rules/page.tsx", "utf8")).toContain('<RecordAchievement kind="rules" />');
    expect(readFileSync("src/components/Shell.tsx", "utf8")).toContain('recordAchievement({ kind: "seat"');
    expect(readFileSync("src/components/TableUX.tsx", "utf8")).toContain('recordAchievement({ kind: "coach" })');
    expect(readFileSync("src/components/LimitsPanel.tsx", "utf8")).toContain('recordAchievement({ kind: "limit" })');
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{ \.ach-toast \{ animation: none/);
    // sr-only labels inside the scrollable strip must not widen the phone page (390px overflow regression)
    expect(css).toMatch(/\.ach-badge \{ position: relative;/);
    expect(css).toMatch(/\.ach-card \{ min-width: 0; max-width: 100%;/);
    // toast sits above fixed bet docks
    expect(css).toMatch(/\.ach-toast-wrap \{[^}]*top: calc[^}]*z-index: 1000/);
  });
});
