/**
 * Slot Scout S2 — symbol paytable peek.
 *
 * Every amount is computed from the same paytable / scatter / feature constants the
 * server uses to pay a spin. This module never copies a pay number.
 * Presentation only: looking up a symbol does not change odds or results.
 */
import { formatCents } from "./money";
import { gameMath, MINE_FEATURE_LINE, PRAIRIE_FEATURE_LINE, CLOVER_FEATURE_LINE } from "./gameMath";
import { PAYTABLE, LINE_COUNT, type Symbol as SlotSymbol } from "./games/slot";
import { VS_PAYTABLE, VS_DISPLAY_PAYTABLE, VS_LINE_COUNT, type VsSymbol } from "./games/slotProgressive";
import {
  MINE_PAYTABLE,
  MINE_SCATTER_PAY,
  MINE_FS_AWARD,
  MINE_LINES,
  MINE_CART_REELS,
  MINE_PAY_SYMBOLS,
  type MinePaySymbol,
} from "./games/mine";
import {
  PR_PAYTABLE,
  PR_SCATTER_PAY,
  PR_FS_AWARD,
  PR_BET_COINS,
  PR_HS_TRIGGER,
  PR_COIN_VALUES,
  PR_PAY_SYMBOLS,
  type PrPaySymbol,
} from "./games/prairie";
import {
  CL_PAYTABLE,
  CL_SCATTER_PAY,
  CL_FS_AWARD,
  CL_LINES,
  CL_RAINBOW_REELS,
  CL_PAY_SYMBOLS,
  CL_WHEEL_FS,
  type ClPaySymbol,
} from "./games/clover";
import { BB_TABLE, BB_BOUNTY_TABLE, type BbTable, type BbSymbol } from "./games/buckshot";

export const PEEK_GAMES = ["slot", "vault", "buckshot", "bounty", "mine", "prairie", "clover"] as const;
export type PeekGame = (typeof PEEK_GAMES)[number];

export type PeekBet = {
  /** Per-line / per-way coin, in cents (video slots). */
  coinCents: number;
  /** Buckshot / Bounty: coins played (1–3) and the coin value in cents. */
  coins?: number;
  denomCents?: number;
};

export type PeekRow = {
  label: string;
  amountCents: number;
  /** Extra clause on the same row (e.g. "+ 8 free spins"). */
  extra?: string;
};

export type SymbolPeek = {
  symbol: string;
  title: string;
  kind: "pay" | "wild" | "scatter" | "feature" | "blank";
  /** How the amounts are scaled, shown under the title. */
  unit: string;
  rows: PeekRow[];
  note?: string;
};

export const LONG_PRESS_MS = 450;
export const PEEK_WIDTH = 280;
export const PEEK_PAD = 8;
export const PEEK_GAP = 8;

/** Display names players see on the tiles (same labels as the cabinet art). */
export const PEEK_TITLES: Record<PeekGame, Record<string, string>> = {
  slot: { WILD: "WILD", CROWN: "STAR", DIAMOND: "NUGGET", ACE: "ACE", CHIP: "CHIP", HORSE: "HAT", LAMP: "LANTERN", BAR: "BAR" },
  vault: { WILD: "WILD", MONKEY: "BADGE", PARROT: "BOOT", JAGUAR: "SPUR", TOUCAN: "WHEEL", BANANA: "CACTUS", COCONUT: "LASSO", VINE: "PICK" },
  buckshot: { WILD: "WILD", SEVEN: "7", BAR3: "TRIPLE BAR", BAR2: "DOUBLE BAR", BAR1: "SINGLE BAR", CHERRY: "CHERRY", BLANK: "BLANK" },
  bounty: { WILD: "WILD", SEVEN: "7", BAR3: "TRIPLE BAR", BAR2: "DOUBLE BAR", BAR1: "SINGLE BAR", CHERRY: "CHERRY", BLANK: "BLANK" },
  mine: { WILD: "Wild", DYNAMITE: "Dynamite", CART: "Mine cart", NUGGET: "Nugget", CANARY: "Canary", PICK: "Pickaxe", LANTERN: "Lantern", PAN: "Gold pan", ORE: "Ore" },
  prairie: {
    WILD: "Wild", W2: "Wild 2×", W3: "Wild 3×", STORM: "Storm", COIN: "Coin",
    BUFFALO: "Buffalo", EAGLE: "Eagle", COYOTE: "Coyote", BOOTS: "Boots", A: "A", K: "K", Q: "Q", J: "J",
  },
  clover: {
    WILD: "Wild", KETTLE: "Kettle", RAINBOW: "Rainbow",
    HAT: "Hat", HARP: "Harp", FIDDLE: "Fiddle", TOADSTOOL: "Toadstool", ACORN: "Acorn", BLUEBELL: "Bluebell",
  },
};

export const PEEK_GAME_TITLES: Record<PeekGame, string> = {
  slot: "Sundown Trail",
  vault: "Antler Ridge",
  buckshot: "Buckshot Bars",
  bounty: "Bounty Bars",
  mine: "Canary Creek Mine",
  prairie: "Thunderhoof Prairie",
  clover: "Kettle of Clover",
};

const KIND_LABELS = ["3 of a kind", "4 of a kind", "5 of a kind"] as const;
const REEL_LABELS = ["3 reels", "4 reels", "5 reels"] as const;

function ofAKindRows(pays: readonly [number, number, number], coinCents: number, labels: readonly string[] = KIND_LABELS): PeekRow[] {
  return pays.map((pay, i) => ({ label: labels[i]!, amountCents: pay * coinCents }));
}

function coinUnit(coinCents: number, suffix: string): string {
  return `Pays ${suffix} at this coin (${formatCents(coinCents)})`;
}

function scatterRows(
  table: readonly number[],
  awards: readonly number[],
  betCents: number,
): PeekRow[] {
  const rows: PeekRow[] = [];
  for (let k = 3; k <= 5; k++) {
    const pay = table[k] ?? 0;
    const fs = awards[k] ?? 0;
    rows.push({
      label: `${k} scatters`,
      amountCents: pay * betCents,
      extra: fs > 0 ? `+ ${fs} free spins` : undefined,
    });
  }
  return rows;
}

function bbTable(game: "buckshot" | "bounty"): BbTable {
  return game === "bounty" ? BB_BOUNTY_TABLE : BB_TABLE;
}

function bbBet(bet: PeekBet): { coins: number; denom: number; betCents: number } {
  const denom = Math.max(1, Math.floor(bet.denomCents ?? bet.coinCents) || 25);
  const coins = Math.max(1, Math.min(3, Math.floor(bet.coins ?? 1) || 1));
  return { coins, denom, betCents: coins * denom };
}

/** Line / ways / classic total bet in cents at the current stake. */
export function peekBetCents(game: PeekGame, bet: PeekBet): number {
  const coin = Math.max(0, Math.floor(bet.coinCents) || 0);
  switch (game) {
    case "slot": return coin * LINE_COUNT;
    case "vault": return coin * VS_LINE_COUNT;
    case "mine": return coin * MINE_LINES;
    case "clover": return coin * CL_LINES;
    case "prairie": return coin * PR_BET_COINS;
    case "buckshot":
    case "bounty": return bbBet(bet).betCents;
  }
}

export function symbolTitle(game: PeekGame, symbol: string): string {
  return PEEK_TITLES[game][symbol] ?? symbol;
}

/**
 * What a symbol on this game pays at the current bet.
 * Returns null only when the symbol is not part of this game.
 */
export function symbolPeek(game: PeekGame, symbol: string, bet: PeekBet): SymbolPeek | null {
  const coin = Math.max(0, Math.floor(Number(bet.coinCents) || 0));
  const title = symbolTitle(game, symbol);

  if (game === "slot") {
    if (!(symbol in PAYTABLE)) return null;
    const pays = PAYTABLE[symbol as SlotSymbol];
    const isWild = symbol === "WILD";
    return {
      symbol, title, kind: isWild ? "wild" : "pay",
      unit: coinUnit(coin, "on a line"),
      rows: ofAKindRows(pays, coin),
      note: isWild
        ? "The horseshoe is wild: it stands in for any symbol and also pays on a line of its own, left to right."
        : "Pays left to right on a line.",
    };
  }

  if (game === "vault") {
    if (!(symbol in VS_PAYTABLE)) return null;
    if (symbol === "WILD") {
      return {
        symbol, title, kind: "wild",
        unit: "No line pay of its own",
        rows: [],
        note: "Substitutes for every pay symbol. A 3, 4 or 5-wild line cannot land — wilds only sit on reels 1, 3 and 5.",
      };
    }
    // Display table is the rows that can actually land (same numbers as VS_PAYTABLE).
    const pays = VS_DISPLAY_PAYTABLE[symbol as Exclude<VsSymbol, "WILD">];
    if (!pays) return null;
    return {
      symbol, title, kind: "pay",
      unit: coinUnit(coin, "on a line"),
      rows: ofAKindRows(pays, coin),
      note: "Pays left to right on a line. Wilds substitute.",
    };
  }

  if (game === "mine") {
    if (symbol === "WILD") {
      return {
        symbol, title, kind: "wild",
        unit: "No line pay of its own",
        rows: [],
        note: "Clem's lantern-hat stands in for every pay symbol, not Dynamite or a mine cart. It sits on reels 2–4.",
      };
    }
    if (symbol === "DYNAMITE") {
      return {
        symbol, title, kind: "scatter",
        unit: `Scatter — pays anywhere, × this spin's bet (${formatCents(peekBetCents(game, bet))})`,
        rows: scatterRows(MINE_SCATTER_PAY, MINE_FS_AWARD, peekBetCents(game, bet)),
        note: "Wilds do not substitute for Dynamite. Free spins use the same reels; every free-spin win is doubled. Retriggers add the same awards, up to a cap of 100 free spins.",
      };
    }
    if (symbol === "CART") {
      const reels = MINE_CART_REELS.map((r) => r + 1).join(", ");
      return {
        symbol, title, kind: "feature",
        unit: "No line pay",
        rows: [],
        note: `One mine cart on each of reels ${reels} (any row) in the base game opens the Mine Cart pick. Carts do nothing during free spins.`,
      };
    }
    if (!(MINE_PAY_SYMBOLS as string[]).includes(symbol)) return null;
    return {
      symbol, title, kind: "pay",
      unit: coinUnit(coin, "on a line"),
      rows: ofAKindRows(MINE_PAYTABLE[symbol as MinePaySymbol], coin),
      note: "Pays left to right on a line. Wilds substitute. Free-spin line wins are doubled.",
    };
  }

  if (game === "prairie") {
    if (symbol === "WILD" || symbol === "W2" || symbol === "W3") {
      const extra = symbol === "W2"
        ? " This is a 2× wild, used on free-spin reels."
        : symbol === "W3"
          ? " This is a 3× wild, used on free-spin reels."
          : " In free spins each wild is printed as 2× or 3× and multiplies the way.";
      return {
        symbol, title, kind: "wild",
        unit: "No way pay of its own",
        rows: [],
        note: `Stands in for every pay symbol, not Storm or a coin. Wilds sit on reels 2–4.${extra}`,
      };
    }
    if (symbol === "STORM") {
      return {
        symbol, title, kind: "scatter",
        unit: `Scatter — pays anywhere, × this spin's bet (${formatCents(peekBetCents(game, bet))})`,
        rows: scatterRows(PR_SCATTER_PAY, PR_FS_AWARD, peekBetCents(game, bet)),
        note: "Wilds do not substitute for Storm. Free spins retrigger with 3 or more Storms, up to a cap of 100 free spins. Coins rest during free spins.",
      };
    }
    if (symbol === "COIN") {
      const values = PR_COIN_VALUES.map((v) => (v.label ? `${v.label} ${v.x}×` : `${v.x}×`)).join(", ");
      return {
        symbol, title, kind: "feature",
        unit: "No way pay",
        rows: [],
        note: `${PR_HS_TRIGGER} or more coins anywhere in the base game start Hold & Spin. Coin values (× this spin's bet): ${values}. No progressive.`,
      };
    }
    if (!(PR_PAY_SYMBOLS as string[]).includes(symbol)) return null;
    return {
      symbol, title, kind: "pay",
      unit: coinUnit(coin, "per way"),
      rows: ofAKindRows(PR_PAYTABLE[symbol as PrPaySymbol], coin, REEL_LABELS),
      note: "243 ways, left to right, any row. Only the longest run per symbol pays. The pay is multiplied by the number of matching cells on each counted reel.",
    };
  }

  if (game === "clover") {
    if (symbol === "WILD") {
      return {
        symbol, title, kind: "wild",
        unit: "No line pay of its own",
        rows: [],
        note: "The four-leaf clover stands in for every pay symbol, not Kettle or Rainbow. It sits on reels 2–4. During free spins, a wild expands to fill its reel before lines are paid.",
      };
    }
    if (symbol === "KETTLE") {
      return {
        symbol, title, kind: "scatter",
        unit: `Scatter — pays anywhere, × this spin's bet (${formatCents(peekBetCents(game, bet))})`,
        rows: scatterRows(CL_SCATTER_PAY, CL_FS_AWARD, peekBetCents(game, bet)),
        note: "Wilds do not substitute for Kettle. Kettles are counted as they land, before expanding. Retriggers add the same awards, up to a cap of 100 free spins.",
      };
    }
    if (symbol === "RAINBOW") {
      const reels = CL_RAINBOW_REELS.map((r) => r + 1).join(", ");
      return {
        symbol, title, kind: "feature",
        unit: "No line pay",
        rows: [],
        note: `One rainbow on each of reels ${reels} (any row) in the base game spins the Rainbow Wheel. One wedge awards ${CL_WHEEL_FS} expanding-wild free spins; an Upgrade wedge moves to the outer Pot-of-Gold wheel. Rainbows do nothing during free spins.`,
      };
    }
    if (!(CL_PAY_SYMBOLS as string[]).includes(symbol)) return null;
    return {
      symbol, title, kind: "pay",
      unit: coinUnit(coin, "on a line"),
      rows: ofAKindRows(CL_PAYTABLE[symbol as ClPaySymbol], coin),
      note: "Pays left to right on a line. Wilds substitute.",
    };
  }

  // buckshot / bounty
  if (!(["WILD", "SEVEN", "BAR3", "BAR2", "BAR1", "CHERRY", "BLANK"] as const).includes(symbol as BbSymbol)) return null;
  const t = bbTable(game);
  const { coins, denom, betCents } = bbBet(bet);
  const unit = `Pays at this bet (${coins} coin${coins === 1 ? "" : "s"} × ${formatCents(denom)} = ${formatCents(betCents)})`;
  const perCoin = (n: number): number => n * coins * denom;

  if (symbol === "BLANK") {
    return { symbol, title, kind: "blank", unit: "No pay", rows: [], note: "The blank does not pay." };
  }
  if (symbol === "WILD") {
    return {
      symbol, title, kind: "wild",
      unit,
      rows: [{ label: "3 wilds", amountCents: t.top[coins]! * denom }],
      note: "The horseshoe stands in for any symbol and doubles the pay for each one used. Three horseshoes pay the top award (the only non-linear pay).",
    };
  }
  if (symbol === "CHERRY") {
    return {
      symbol, title, kind: "pay",
      unit,
      rows: [
        { label: "1 cherry", amountCents: perCoin(t.cherry[1]!) },
        { label: "2 cherries", amountCents: perCoin(t.cherry[2]!) },
        { label: "3 cherries", amountCents: perCoin(t.cherry[3]!) },
      ],
      note: "Cherries pay anywhere on the payline. A wild used with cherries also doubles the pay.",
    };
  }
  const payKey = symbol as keyof BbTable["pays"];
  const rows: PeekRow[] = [{ label: `3 × ${title}`, amountCents: perCoin(t.pays[payKey]) }];
  if (symbol === "BAR1" || symbol === "BAR2" || symbol === "BAR3") {
    rows.push({ label: "Any 3 bars", amountCents: perCoin(t.anyBar) });
  }
  return {
    symbol, title, kind: "pay",
    unit,
    rows,
    note: "Pays on the centre payline. A wild used on the line doubles the pay for each one used.",
  };
}

/** Format a peek row amount with the shared money formatter. */
export function peekAmountText(cents: number): string {
  return formatCents(cents);
}

export type PeekBox = { left: number; top: number; width: number; height: number };
export type PeekPlacement = { left: number; top: number; placement: "above" | "below" };

/**
 * Place the popover near a symbol without overflowing the viewport.
 * Prefers above the tile; flips below when there is not enough room.
 * Always clamped so the box stays inside the viewport by `PEEK_PAD`.
 */
export function placePeek(
  anchor: { left: number; top: number; width: number; height: number },
  viewport: { width: number; height: number },
  size: { width: number; height: number } = { width: PEEK_WIDTH, height: 200 },
): PeekPlacement {
  const pad = PEEK_PAD;
  const gap = PEEK_GAP;
  const vw = Math.max(0, viewport.width);
  const vh = Math.max(0, viewport.height);
  const w = Math.min(size.width, Math.max(0, vw - pad * 2));
  const h = Math.min(size.height, Math.max(0, vh - pad * 2));
  const ax = anchor.left + anchor.width / 2;
  let left = Math.round(ax - w / 2);
  left = Math.max(pad, Math.min(left, vw - w - pad));
  if (vw < w + pad * 2) left = pad;

  const aboveTop = anchor.top - gap - h;
  const belowTop = anchor.top + anchor.height + gap;
  const roomAbove = aboveTop >= pad;
  const roomBelow = belowTop + h <= vh - pad;
  let placement: "above" | "below" = "above";
  let top = aboveTop;
  if (!roomAbove && roomBelow) {
    placement = "below";
    top = belowTop;
  } else if (!roomAbove && !roomBelow) {
    // Pick the side with more space, then clamp.
    const spaceAbove = anchor.top - pad - gap;
    const spaceBelow = vh - pad - (anchor.top + anchor.height + gap);
    if (spaceBelow > spaceAbove) {
      placement = "below";
      top = belowTop;
    }
  }
  top = Math.max(pad, Math.min(top, vh - h - pad));
  if (vh < h + pad * 2) top = pad;
  return { left, top, placement };
}

export type GameInfo = {
  game: PeekGame;
  title: string;
  rtpLine: string;
  line: string;
  feature: string;
  sandbox: string;
};

/** One plain screen: published RTP + the feature trigger line, from gameMath. */
export function gameInfo(game: PeekGame): GameInfo {
  const math = gameMath(game);
  const feature = (
    game === "mine" ? MINE_FEATURE_LINE
    : game === "prairie" ? PRAIRIE_FEATURE_LINE
    : game === "clover" ? CLOVER_FEATURE_LINE
    : game === "vault" ? "Jackpots are meter-driven; no symbol is required to trigger one."
    : game === "buckshot" || game === "bounty" ? "Classic 3-reel, one payline. The horseshoe is wild and doubles the pay for each one used. Three horseshoes pay the top award."
    : "No bonus feature — 9 lines pay left to right from the paytable."
  );
  return {
    game,
    title: PEEK_GAME_TITLES[game],
    rtpLine: math.rtpLine,
    line: math.line,
    feature,
    sandbox: "Sandbox / test chips, no cash value",
  };
}

/** Props to put on a reel symbol so the peek layer can find it. */
export function peekTileProps(symbol: string, label: string, enabled: boolean): {
  "data-peek-symbol": string;
  "data-peek-label": string;
  role?: "button";
  tabIndex?: number;
  "aria-haspopup"?: "dialog";
  "aria-label": string;
} {
  const title = label || symbol;
  if (!enabled) {
    return {
      "data-peek-symbol": symbol,
      "data-peek-label": title,
      "aria-label": title,
    };
  }
  return {
    "data-peek-symbol": symbol,
    "data-peek-label": title,
    role: "button",
    tabIndex: 0,
    "aria-haspopup": "dialog",
    "aria-label": `${title}, what this symbol pays`,
  };
}
