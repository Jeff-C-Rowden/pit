/**
 * S2 symbol paytable peek: every amount is computed from the server paytables.
 * No duplicated pay numbers, no invented odds. Presentation only.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatCents } from "../src/lib/money";
import { gameMath, MINE_FEATURE_LINE, PRAIRIE_FEATURE_LINE, CLOVER_FEATURE_LINE } from "../src/lib/gameMath";
import { PAYTABLE } from "../src/lib/games/slot";
import { VS_PAYTABLE, VS_DISPLAY_PAYTABLE } from "../src/lib/games/slotProgressive";
import { MINE_PAYTABLE, MINE_SCATTER_PAY, MINE_FS_AWARD, MINE_LINES, MINE_CART_REELS } from "../src/lib/games/mine";
import { PR_PAYTABLE, PR_SCATTER_PAY, PR_FS_AWARD, PR_BET_COINS, PR_HS_TRIGGER, PR_COIN_VALUES } from "../src/lib/games/prairie";
import { CL_PAYTABLE, CL_SCATTER_PAY, CL_FS_AWARD, CL_LINES, CL_RAINBOW_REELS, CL_WHEEL_FS } from "../src/lib/games/clover";
import { BB_TABLE, BB_BOUNTY_TABLE } from "../src/lib/games/buckshot";
import { SUNDOWN_ART, RIDGE_ART, BUCKSHOT_ART } from "../src/components/WesternSymbols";
import { MINE_ART } from "../src/components/MineSymbols";
import { PRAIRIE_ART } from "../src/components/PrairieSymbols";
import { CLOVER_ART } from "../src/components/CloverSymbols";
import {
  LONG_PRESS_MS,
  PEEK_GAMES,
  PEEK_TITLES,
  PEEK_WIDTH,
  PEEK_PAD,
  gameInfo,
  peekAmountText,
  peekBetCents,
  peekTileProps,
  placePeek,
  symbolPeek,
  symbolTitle,
  type PeekGame,
} from "../src/lib/symbolPeek";

const ROOT = join(__dirname, "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

const CABINETS = [
  "src/components/SlotMachine.tsx",
  "src/components/VaultSpireMachine.tsx",
  "src/components/MineMachine.tsx",
  "src/components/PrairieMachine.tsx",
  "src/components/CloverMachine.tsx",
  "src/components/BuckshotMachine.tsx",
] as const;

describe("Sundown Trail pays at the current coin, from PAYTABLE", () => {
  it("3/4/5 of a kind are paytable × coin, and scale when the coin changes", () => {
    for (const coin of [25, 100, 500]) {
      const peek = symbolPeek("slot", "CROWN", { coinCents: coin })!;
      expect(peek.rows.map((r) => r.amountCents)).toEqual(PAYTABLE.CROWN.map((p) => p * coin));
      expect(peek.title).toBe("STAR");
      expect(peek.kind).toBe("pay");
    }
    const wild = symbolPeek("slot", "WILD", { coinCents: 25 })!;
    expect(wild.kind).toBe("wild");
    expect(wild.rows.map((r) => r.amountCents)).toEqual(PAYTABLE.WILD.map((p) => p * 25));
    expect(wild.note).toMatch(/wild/i);
  });

  it("rejects symbols that are not on this machine", () => {
    expect(symbolPeek("slot", "BUFFALO", { coinCents: 25 })).toBeNull();
  });
});

describe("Antler Ridge uses the display paytable (no 3/4/5-wild row)", () => {
  it("pay symbols match VS_DISPLAY_PAYTABLE × coin", () => {
    const peek = symbolPeek("vault", "MONKEY", { coinCents: 100 })!;
    expect(peek.title).toBe("BADGE");
    expect(peek.rows.map((r) => r.amountCents)).toEqual(VS_DISPLAY_PAYTABLE.MONKEY.map((p) => p * 100));
  });

  it("wild has no line-pay rows and does not leak the unlandable 50/200/800 row", () => {
    const wild = symbolPeek("vault", "WILD", { coinCents: 25 })!;
    expect(wild.kind).toBe("wild");
    expect(wild.rows).toEqual([]);
    expect(wild.note).toMatch(/reels 1, 3 and 5/);
    const leaked = VS_PAYTABLE.WILD.some((p) => wild.note?.includes(String(p)) || wild.rows.some((r) => r.amountCents === p * 25));
    expect(leaked).toBe(false);
  });
});

describe("story slots: line/ways + scatter + feature, from official tables", () => {
  it("Canary Creek Mine line pays and dynamite scatter (× total bet + official free-spin awards)", () => {
    const coin = 25;
    const line = symbolPeek("mine", "NUGGET", { coinCents: coin })!;
    expect(line.rows.map((r) => r.amountCents)).toEqual(MINE_PAYTABLE.NUGGET.map((p) => p * coin));
    const bet = peekBetCents("mine", { coinCents: coin });
    expect(bet).toBe(coin * MINE_LINES);
    const dyn = symbolPeek("mine", "DYNAMITE", { coinCents: coin })!;
    expect(dyn.kind).toBe("scatter");
    expect(dyn.rows.map((r) => r.amountCents)).toEqual([3, 4, 5].map((k) => MINE_SCATTER_PAY[k]! * bet));
    expect(dyn.rows.map((r) => r.extra)).toEqual([3, 4, 5].map((k) => `+ ${MINE_FS_AWARD[k]} free spins`));
    const cart = symbolPeek("mine", "CART", { coinCents: coin })!;
    expect(cart.kind).toBe("feature");
    expect(cart.rows).toEqual([]);
    expect(cart.note).toContain(MINE_CART_REELS.map((r) => r + 1).join(", "));
    const wild = symbolPeek("mine", "WILD", { coinCents: coin })!;
    expect(wild.kind).toBe("wild");
    expect(wild.rows).toEqual([]);
  });

  it("Thunderhoof Prairie ways pays and storm scatter; W2/W3 peek as wilds", () => {
    const coin = 50;
    const way = symbolPeek("prairie", "BUFFALO", { coinCents: coin })!;
    expect(way.unit).toMatch(/per way/);
    expect(way.rows.map((r) => r.label)).toEqual(["3 reels", "4 reels", "5 reels"]);
    expect(way.rows.map((r) => r.amountCents)).toEqual(PR_PAYTABLE.BUFFALO.map((p) => p * coin));
    const bet = peekBetCents("prairie", { coinCents: coin });
    expect(bet).toBe(coin * PR_BET_COINS);
    const storm = symbolPeek("prairie", "STORM", { coinCents: coin })!;
    expect(storm.kind).toBe("scatter");
    expect(storm.rows.map((r) => r.amountCents)).toEqual([3, 4, 5].map((k) => PR_SCATTER_PAY[k]! * bet));
    expect(storm.rows.map((r) => r.extra)).toEqual([3, 4, 5].map((k) => `+ ${PR_FS_AWARD[k]} free spins`));
    for (const w of ["WILD", "W2", "W3"] as const) {
      const peek = symbolPeek("prairie", w, { coinCents: coin })!;
      expect(peek.kind).toBe("wild");
      expect(peek.rows).toEqual([]);
    }
    const coinPeek = symbolPeek("prairie", "COIN", { coinCents: coin })!;
    expect(coinPeek.kind).toBe("feature");
    expect(coinPeek.note).toContain(String(PR_HS_TRIGGER));
    for (const v of PR_COIN_VALUES) {
      expect(coinPeek.note).toContain(`${v.x}×`);
    }
  });

  it("Kettle of Clover line pays and kettle scatter; rainbow cites official reels and wheel free spins", () => {
    const coin = 25;
    const hat = symbolPeek("clover", "HAT", { coinCents: coin })!;
    expect(hat.rows.map((r) => r.amountCents)).toEqual(CL_PAYTABLE.HAT.map((p) => p * coin));
    const bet = peekBetCents("clover", { coinCents: coin });
    expect(bet).toBe(coin * CL_LINES);
    const kettle = symbolPeek("clover", "KETTLE", { coinCents: coin })!;
    expect(kettle.kind).toBe("scatter");
    expect(kettle.rows.map((r) => r.amountCents)).toEqual([3, 4, 5].map((k) => CL_SCATTER_PAY[k]! * bet));
    expect(kettle.rows.map((r) => r.extra)).toEqual([3, 4, 5].map((k) => `+ ${CL_FS_AWARD[k]} free spins`));
    const rainbow = symbolPeek("clover", "RAINBOW", { coinCents: coin })!;
    expect(rainbow.kind).toBe("feature");
    expect(rainbow.note).toContain(CL_RAINBOW_REELS.map((r) => r + 1).join(", "));
    expect(rainbow.note).toContain(String(CL_WHEEL_FS));
  });
});

describe("Buckshot / Bounty classic pays at the current coins × denom", () => {
  it("uses each machine's own table; 3-wilds use top[coins] × denom (not × coins again)", () => {
    const bet = { coinCents: 50, coins: 3, denomCents: 50 };
    const sevenB = symbolPeek("buckshot", "SEVEN", bet)!;
    const sevenY = symbolPeek("bounty", "SEVEN", bet)!;
    expect(sevenB.rows[0]!.amountCents).toBe(BB_TABLE.pays.SEVEN * 3 * 50);
    expect(sevenY.rows[0]!.amountCents).toBe(BB_BOUNTY_TABLE.pays.SEVEN * 3 * 50);
    expect(sevenB.rows[0]!.amountCents).not.toBe(sevenY.rows[0]!.amountCents);

    const wild = symbolPeek("buckshot", "WILD", bet)!;
    expect(wild.rows[0]!.amountCents).toBe(BB_TABLE.top[3]! * 50);
    expect(wild.rows[0]!.amountCents).not.toBe(BB_TABLE.top[3]! * 3 * 50);

    const cherry = symbolPeek("bounty", "CHERRY", { coinCents: 100, coins: 2, denomCents: 100 })!;
    expect(cherry.rows.map((r) => r.amountCents)).toEqual([
      BB_BOUNTY_TABLE.cherry[1]! * 2 * 100,
      BB_BOUNTY_TABLE.cherry[2]! * 2 * 100,
      BB_BOUNTY_TABLE.cherry[3]! * 2 * 100,
    ]);

    const bar = symbolPeek("buckshot", "BAR1", { coinCents: 25, coins: 1, denomCents: 25 })!;
    expect(bar.rows.map((r) => r.label)).toEqual(["3 × SINGLE BAR", "Any 3 bars"]);
    expect(bar.rows[1]!.amountCents).toBe(BB_TABLE.anyBar * 1 * 25);

    const blank = symbolPeek("buckshot", "BLANK", { coinCents: 25, coins: 1, denomCents: 25 })!;
    expect(blank.kind).toBe("blank");
    expect(blank.rows).toEqual([]);
  });
});

describe("titles match the cabinet art labels", () => {
  const tables: [PeekGame, Record<string, { label: string }>][] = [
    ["slot", SUNDOWN_ART],
    ["vault", RIDGE_ART],
    ["buckshot", BUCKSHOT_ART],
    ["bounty", BUCKSHOT_ART],
    ["mine", MINE_ART],
    ["prairie", PRAIRIE_ART],
    ["clover", CLOVER_ART],
  ];
  it("every art key has the same peek title as the tile label", () => {
    for (const [game, art] of tables) {
      for (const [sym, meta] of Object.entries(art)) {
        expect(symbolTitle(game, sym), `${game}.${sym}`).toBe(meta.label);
        expect(PEEK_TITLES[game][sym]).toBe(meta.label);
      }
    }
  });
});

describe("amounts use the shared money formatter", () => {
  it("peekAmountText is formatCents", () => {
    expect(peekAmountText(750)).toBe(formatCents(750));
    expect(peekAmountText(750)).toBe("$7.50");
    expect(symbolPeek("slot", "CROWN", { coinCents: 25 })!.rows[0]!.amountCents).toBe(750);
  });
});

describe("placePeek stays inside a 390×844 phone viewport", () => {
  const view = { width: 390, height: 844 };
  const size = { width: PEEK_WIDTH, height: 200 };

  it("prefers above when there is room, centred on the tile and clamped to the pad", () => {
    const p = placePeek({ left: 160, top: 400, width: 60, height: 70 }, view, size);
    expect(p.placement).toBe("above");
    expect(p.top).toBe(400 - 8 - 200);
    expect(p.left + PEEK_WIDTH).toBeLessThanOrEqual(view.width - PEEK_PAD);
    expect(p.left).toBeGreaterThanOrEqual(PEEK_PAD);
  });

  it("flips below when the tile is near the top, and clamps a left-edge tile", () => {
    const p = placePeek({ left: 2, top: 12, width: 56, height: 64 }, view, size);
    expect(p.placement).toBe("below");
    expect(p.left).toBe(PEEK_PAD);
    expect(p.left + PEEK_WIDTH).toBeLessThanOrEqual(view.width - PEEK_PAD);
    expect(p.top).toBeGreaterThanOrEqual(PEEK_PAD);
    expect(p.top + size.height).toBeLessThanOrEqual(view.height - PEEK_PAD);
  });

  it("clamps a right-edge, bottom-row tile so the box is fully on screen", () => {
    const p = placePeek({ left: 340, top: 780, width: 48, height: 58 }, view, size);
    expect(p.left).toBeGreaterThanOrEqual(PEEK_PAD);
    expect(p.left + PEEK_WIDTH).toBeLessThanOrEqual(view.width - PEEK_PAD);
    expect(p.top).toBeGreaterThanOrEqual(PEEK_PAD);
    expect(p.top + size.height).toBeLessThanOrEqual(view.height - PEEK_PAD);
  });
});

describe("game info sheet uses published math, not a second copy of the RTP", () => {
  it("rtpLine and line come from gameMath; feature lines use the official constants", () => {
    for (const game of PEEK_GAMES) {
      const info = gameInfo(game);
      const math = gameMath(game);
      expect(info.rtpLine).toBe(math.rtpLine);
      expect(info.line).toBe(math.line);
      expect(info.sandbox).toMatch(/Sandbox/i);
    }
    expect(gameInfo("mine").feature).toBe(MINE_FEATURE_LINE);
    expect(gameInfo("prairie").feature).toBe(PRAIRIE_FEATURE_LINE);
    expect(gameInfo("clover").feature).toBe(CLOVER_FEATURE_LINE);
    expect(gameInfo("vault").feature).toMatch(/meter-driven/i);
  });
});

describe("peek tile props and timing", () => {
  it("only becomes a focusable button when the reels are stopped", () => {
    const off = peekTileProps("CROWN", "STAR", false);
    expect(off.role).toBeUndefined();
    expect(off.tabIndex).toBeUndefined();
    expect(off["data-peek-symbol"]).toBe("CROWN");
    const on = peekTileProps("CROWN", "STAR", true);
    expect(on.role).toBe("button");
    expect(on.tabIndex).toBe(0);
    expect(on["aria-haspopup"]).toBe("dialog");
    expect(on["aria-label"]).toBe("STAR, what this symbol pays");
  });

  it("long-press is a short, fixed hold (not a countdown to a win)", () => {
    expect(LONG_PRESS_MS).toBe(450);
  });
});

describe("no duplicated pay numbers; cabinets are wired", () => {
  it("symbolPeek.ts imports the official tables and does not rewrite their numbers", () => {
    const src = read("src/lib/symbolPeek.ts");
    for (const token of [
      "PAYTABLE",
      "VS_DISPLAY_PAYTABLE",
      "MINE_PAYTABLE",
      "MINE_SCATTER_PAY",
      "MINE_FS_AWARD",
      "PR_PAYTABLE",
      "PR_SCATTER_PAY",
      "PR_COIN_VALUES",
      "CL_PAYTABLE",
      "CL_SCATTER_PAY",
      "BB_TABLE",
      "BB_BOUNTY_TABLE",
    ]) {
      expect(src, token).toContain(token);
    }
    // Pay rows like [30, 120, 600] must not be recopied here.
    expect(src).not.toMatch(/\[30,\s*120,\s*600\]/);
    expect(src).not.toMatch(/\[25,\s*100,\s*500\]/);
    expect(src).not.toMatch(/\[10,\s*30,\s*100\]/);
    expect(src).not.toMatch(/pays:\s*\{\s*SEVEN:\s*80/);
  });

  it("every cabinet marks symbols and passes peekGame/peekBet through CabinetChrome", () => {
    expect(read("src/components/SlotCabinet.tsx")).toContain("SymbolPeekLayer");
    expect(read("src/components/SlotCabinet.tsx")).toContain("GameInfoButton");
    expect(read("src/components/SlotCabinet.tsx")).toContain('role="group"');
    for (const file of CABINETS) {
      const src = read(file);
      expect(src, file).toContain("peekTileProps");
      expect(src, file).toContain("peekGame={peekGame}");
      expect(src, file).toContain("peekBet={peekBet}");
    }
    const pages: [string, string][] = [
      ["src/app/slot/page.tsx", "slot"],
      ["src/app/vault/page.tsx", "vault"],
      ["src/app/mine/page.tsx", "mine"],
      ["src/app/prairie/page.tsx", "prairie"],
      ["src/app/clover/page.tsx", "clover"],
    ];
    for (const [file, game] of pages) {
      const src = read(file);
      expect(src, file).toContain(`peekGame="${game}"`);
      expect(src, file).toContain("peekBet=");
      expect(src, file).toContain(`infoGame="${game}"`);
    }
    const bb = read("src/components/BuckshotGame.tsx");
    expect(bb).toContain("peekGame={variant}");
    expect(bb).toContain("infoGame={variant}");
    expect(read("src/app/layout.tsx")).toContain("symbolPeek.css");
    expect(read("src/components/SymbolPeek.tsx")).toContain("createPortal");
    expect(read("src/app/symbolPeek.css")).toContain("game-info-backdrop");
    // Settled Buckshot reels must not be a disabled button wrapping the tiles.
    const classic = read("src/components/BuckshotMachine.tsx");
    expect(classic).toContain('return moving ? (');
    expect(classic).toContain("<div key={r}");
  });

  it("IMPROVEMENTS.md marks S2 shipped and lists S4 as NEXT", () => {
    const md = read("IMPROVEMENTS.md");
    expect(md).toMatch(/## NEXT \(top\): Slot Scout S4→S5/);
    expect(md).not.toMatch(/## NEXT \(top\): Slot Scout S2→/);
    expect(md).toMatch(/S2 .+ SHIPPED 2026-11-12/s);
  });
});
