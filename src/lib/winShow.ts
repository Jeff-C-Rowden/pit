/**
 * Win-line presentation for every Pit slot. Pure, presentation-only helpers: each "show" is
 * built from the server's own spin result (grid + line index + count, or ways wins, or scatter
 * count) using the same payline tables and matching rules the server pays with. Nothing here
 * decides, changes or invents a win; a show exists only for a win the server actually paid.
 */

export type WinCell = { reel: number; row: number };

export type WinShow = {
  key: string;
  kind: "line" | "ways" | "scatter";
  /** Cells that make up this win (highlighted; everything else is dimmed). */
  cells: WinCell[];
  /** Line segments drawn over the reels (cell centre to cell centre). Empty for scatters. */
  segments: [WinCell, WinCell][];
  /** Short label, e.g. "Line 3" or "3 × STORM scatter". */
  label: string;
  winCents: number;
};

/** Plain dollar text for the overlay label ("$1.25"). */
export function showMoney(cents: number): string {
  const v = Math.max(0, Math.round(cents)) / 100;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function showText(s: WinShow): string {
  return `${s.label} · ${showMoney(s.winCents)}`;
}

const pathSegments = (pts: WinCell[]): [WinCell, WinCell][] => pts.slice(1).map((p, i) => [pts[i]!, p]);

export type LineWinLike = { line: number; count: number; winCents: number; symbol?: string | null };

/**
 * One show per paid payline: the line is drawn across every reel along its pattern, and the
 * `count` left-to-right cells that formed the win are highlighted.
 */
export function lineShows(lineWins: readonly LineWinLike[] | null | undefined, paylines: readonly (readonly number[])[], keyPrefix = "l"): WinShow[] {
  const out: WinShow[] = [];
  for (const w of lineWins ?? []) {
    if (!(w.winCents > 0)) continue;
    const pattern = paylines[w.line];
    if (!pattern) continue;
    const pts = pattern.map((row, reel) => ({ reel, row }));
    const n = Math.max(0, Math.min(pattern.length, w.count | 0));
    out.push({
      key: `${keyPrefix}${w.line}`,
      kind: "line",
      cells: pts.slice(0, n),
      segments: pathSegments(pts),
      label: `Line ${w.line + 1}`,
      winCents: w.winCents,
    });
  }
  return out;
}

export type WayWinLike = { symbol: string; reels: number; ways: number; winCents: number };

/**
 * One show per paid ways symbol (243 ways): on each of the first `reels` reels, every cell that
 * matches the symbol (or a wild after reel 1, the server's rule) is highlighted, and every
 * matching cell is joined to every matching cell on the next reel, so each counted way is a path.
 */
export function waysShows(
  grid: readonly (readonly string[])[] | null | undefined,
  wins: readonly WayWinLike[] | null | undefined,
  wilds: readonly string[],
  labelOf: (symbol: string) => string = (s) => s,
): WinShow[] {
  if (!grid) return [];
  const out: WinShow[] = [];
  for (const w of wins ?? []) {
    if (!(w.winCents > 0)) continue;
    const perReel: WinCell[][] = [];
    for (let r = 0; r < Math.min(w.reels, grid.length); r++) {
      const col = grid[r] ?? [];
      const hits: WinCell[] = [];
      col.forEach((s, row) => { if (s === w.symbol || (r > 0 && wilds.includes(s))) hits.push({ reel: r, row }); });
      perReel.push(hits);
    }
    const segments: [WinCell, WinCell][] = [];
    for (let r = 0; r + 1 < perReel.length; r++) for (const a of perReel[r]!) for (const b of perReel[r + 1]!) segments.push([a, b]);
    out.push({
      key: `w${w.symbol}`,
      kind: "ways",
      cells: perReel.flat(),
      segments,
      label: `${labelOf(w.symbol)} · ${w.reels} reels · ${w.ways} way${w.ways === 1 ? "" : "s"}`,
      winCents: w.winCents,
    });
  }
  return out;
}

/** Scatter pay: highlight every scatter on screen, no line. Only when the server paid it. */
export function scatterShow(
  grid: readonly (readonly string[])[] | null | undefined,
  symbol: string,
  winCents: number,
  label: string,
): WinShow[] {
  if (!grid || !(winCents > 0)) return [];
  const cells: WinCell[] = [];
  grid.forEach((col, reel) => col.forEach((s, row) => { if (s === symbol) cells.push({ reel, row }); }));
  if (!cells.length) return [];
  return [{ key: `s${symbol}`, kind: "scatter", cells, segments: [], label: `${cells.length} × ${label}`, winCents }];
}

/**
 * Buckshot / Bounty Bars (3 reels, 1 centre payline). The payline is drawn across all three reels;
 * the cells that earned the pay are highlighted: every reel for a three-of-a-kind / any-bars /
 * three-wilds pay, only the cherries and the wilds standing in for them on a cherry pay.
 */
export function classicShow(line: readonly string[] | null | undefined, kind: string | null | undefined, winCents: number): WinShow[] {
  if (!line || !(winCents > 0) || !kind) return [];
  const pts = line.map((_, reel) => ({ reel, row: 1 }));
  const cherry = /CHERR/.test(kind);
  const cells = cherry ? pts.filter((p) => line[p.reel] === "CHERRY" || line[p.reel] === "WILD") : pts;
  const pretty = kind.replace(/\bBAR3\b/, "TRIPLE BAR").replace(/\bBAR2\b/, "DOUBLE BAR").replace(/\bBAR1\b/, "SINGLE BAR");
  return [{ key: "p0", kind: "line", cells, segments: pathSegments(pts), label: `Payline · ${pretty}`, winCents }];
}

/**
 * A free spin's shows. Free-spin line wins arrive unmultiplied, so each line shows `winCents x mult`
 * (what was paid); the scatter share is whatever the spin paid beyond its lines.
 */
export function freeSpinShows(
  grid: readonly (readonly string[])[] | null | undefined,
  lineWins: readonly LineWinLike[] | null | undefined,
  paylines: readonly (readonly number[])[],
  scatter: string,
  scatterLabel: string,
  spinWinCents: number,
  mult: number,
): WinShow[] {
  const lines = (lineWins ?? []).map((w) => ({ ...w, winCents: w.winCents * mult }));
  const lineCents = lines.reduce((a, w) => a + w.winCents, 0);
  return [...lineShows(lines, paylines), ...scatterShow(grid, scatter, spinWinCents - lineCents, scatterLabel)];
}

/** Cycle timing: each win holds this long before the next (single wins just stay up). */
export const WIN_SHOW_HOLD_MS = 1600;
/** Wait after the last reel lands (covers the settle bounce) before drawing. */
export const WIN_SHOW_DELAY_MS = 180;

/** Index of the show to display `elapsedMs` after the display started; cycles forever. */
export function showIndexAt(count: number, elapsedMs: number, holdMs = WIN_SHOW_HOLD_MS): number {
  if (count <= 0) return -1;
  if (count === 1) return 0;
  return Math.floor(Math.max(0, elapsedMs) / Math.max(1, holdMs)) % count;
}
