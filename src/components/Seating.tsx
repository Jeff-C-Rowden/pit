"use client";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import PlayingCard from "./PlayingCard";
import { ChipRack, ChipStack } from "./TableUX";

export type PubCard = { id: string; rank: string; suit: string; joker?: boolean; red?: boolean };

export type Occupant = {
  kind: "you" | "bot" | "empty";
  name: string;
  stackCents: number;
  seat: number;
};

const BOT_NAMES = ["Mara", "Vince", "Delia", "Otto", "June", "Cal", "Rhea", "Wes", "Nia", "Pax"];

function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rngFrom(seed: string) {
  let h = hashStr(seed) || 1;
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

export function seatCountFor(table: "blackjack" | "holdem" | "paigow") {
  if (table === "blackjack") return 7;
  if (table === "holdem") return 8;
  return 6;
}

export function defaultYouSeat(table: "blackjack" | "holdem" | "paigow") {
  if (table === "holdem") return 0;
  if (table === "blackjack") return 3;
  return 2;
}

function buildOccupants(
  table: "blackjack" | "holdem" | "paigow",
  youSeat: number,
  youName: string,
  youStack: number,
): Occupant[] {
  const n = seatCountFor(table);
  const rng = rngFrom(`pit-${table}-floor`);
  const names = BOT_NAMES.slice().sort((a, b) => hashStr(a + table) - hashStr(b + table));
  const opposite = (youSeat + Math.floor(n / 2)) % n;
  const fill = new Set<number>();
  if (table === "holdem") fill.add(opposite);
  for (let i = 0; i < n; i++) {
    if (i === youSeat) continue;
    if (rng() < (table === "holdem" ? 0.7 : 0.55)) fill.add(i);
  }
  let ni = 0;
  const out: Occupant[] = [];
  for (let i = 0; i < n; i++) {
    if (i === youSeat) {
      out.push({ kind: "you", name: youName || "You", stackCents: youStack, seat: i });
    } else if (fill.has(i)) {
      const name = names[ni++ % names.length]!;
      const stack = 8000 + Math.floor(rng() * 38) * 1000;
      out.push({ kind: "bot", name, stackCents: stack, seat: i });
    } else {
      out.push({ kind: "empty", name: `Seat ${i + 1}`, stackCents: 0, seat: i });
    }
  }
  return out;
}

export function useTableSeats(
  table: "blackjack" | "holdem" | "paigow",
  youName: string,
  youStack: number,
) {
  const n = seatCountFor(table);
  const storageKey = `pit-seat-${table}`;
  const [youSeat, setYouSeatState] = useState(() => {
    if (typeof window === "undefined") return defaultYouSeat(table);
    const raw = window.sessionStorage.getItem(storageKey);
    const v = raw == null ? NaN : Number(raw);
    return Number.isInteger(v) && v >= 0 && v < n ? v : defaultYouSeat(table);
  });
  const [bots, setBots] = useState<Occupant[]>(() => buildOccupants(table, youSeat, youName, youStack));

  useEffect(() => {
    setBots((prev) => {
      const next = buildOccupants(table, youSeat, youName, youStack);
      return next.map((o) => {
        if (o.kind !== "bot") return o;
        const old = prev.find((p) => p.kind === "bot" && p.name === o.name);
        return old ? { ...o, stackCents: old.stackCents } : o;
      });
    });
    // youStack is overlaid live in `occupants`; don't rebuild the floor on every tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, youSeat, youName]);

  const occupants = useMemo(
    () =>
      bots.map((o) =>
        o.seat === youSeat
          ? { kind: "you" as const, name: youName || "You", stackCents: youStack, seat: o.seat }
          : o,
      ),
    [bots, youSeat, youName, youStack],
  );

  const setYouSeat = useCallback(
    (seat: number) => {
      const o = occupants[seat];
      if (!o || o.kind === "bot") return;
      setYouSeatState(seat);
      try {
        window.sessionStorage.setItem(storageKey, String(seat));
      } catch {
        /* ignore */
      }
    },
    [occupants, storageKey],
  );

  const nudgeBot = useCallback((seat: number, delta: number) => {
    setBots((prev) =>
      prev.map((o) =>
        o.seat === seat && o.kind === "bot"
          ? { ...o, stackCents: Math.max(500, o.stackCents + delta) }
          : o,
      ),
    );
  }, []);

  const villainSeat = (youSeat + Math.floor(n / 2)) % n;

  return { occupants, youSeat, setYouSeat, n, villainSeat, nudgeBot };
}

export function seatAngle(i: number, n: number, layout: "holdem" | "blackjack" | "paigow") {
  if (layout === "holdem") {
    return Math.PI / 2 + (i / n) * Math.PI * 2;
  }
  const start = 168;
  const span = 156;
  const deg = start - (i * span) / Math.max(1, n - 1);
  return (deg * Math.PI) / 180;
}

export function seatStyle(i: number, n: number, layout: "holdem" | "blackjack" | "paigow"): CSSProperties {
  const a = seatAngle(i, n, layout);
  const rx = layout === "holdem" ? 46 : 44;
  const ry = layout === "holdem" ? 40 : 38;
  const x = 50 + rx * Math.cos(a);
  const y = layout === "holdem" ? 50 + ry * Math.sin(a) : 54 + ry * Math.sin(a);
  return {
    left: `${x}%`,
    top: `${y}%`,
    transform: "translate(-50%, -50%)",
    zIndex: 4 + Math.round(y),
    ["--inx" as string]: `${(-Math.cos(a) * 36).toFixed(1)}px`,
    ["--iny" as string]: `${(-Math.sin(a) * 28).toFixed(1)}px`,
  };
}

const BACK: PubCard = { id: "??", rank: "?", suit: "s" };

export function SeatAvatar({ name, you, size = 44 }: { name: string; you?: boolean; size?: number }) {
  const h = hashStr(name);
  const a = (h & 255) / 255;
  const b = ((h >> 8) & 255) / 255;
  const c1 = you ? "#c9a227" : `hsl(${40 + a * 40}, 38%, ${28 + b * 18}%)`;
  const c2 = you ? "#3a2a10" : `hsl(${120 + b * 40}, 30%, 16%)`;
  const initial = (name.trim()[0] || "?").toUpperCase();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="seat-avatar-svg" aria-hidden>
      <defs>
        <linearGradient id={`ag${h}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c1} />
          <stop offset="1" stopColor={c2} />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill={`url(#ag${h})`} stroke={you ? "#e8d5a3" : "rgba(232,213,163,.35)"} strokeWidth="2.4" />
      <circle cx="32" cy="24" r="10" fill="rgba(243,234,215,.2)" />
      <ellipse cx="32" cy="48" rx="16" ry="10" fill="rgba(243,234,215,.14)" />
      <text x="32" y="38" textAnchor="middle" fontSize="22" fill="#f3ead7" fontFamily="Palatino, Georgia, serif">
        {initial}
      </text>
    </svg>
  );
}

export function TableSeat({
  occ,
  layout,
  total,
  cards,
  betCents,
  dealer,
  blind,
  acting,
  folded,
  status,
  onSit,
  winning,
}: {
  occ: Occupant;
  layout: "holdem" | "blackjack" | "paigow";
  total: number;
  cards?: PubCard[];
  betCents?: number;
  dealer?: boolean;
  blind?: "SB" | "BB" | null;
  acting?: boolean;
  folded?: boolean;
  status?: string;
  onSit?: (seat: number) => void;
  winning?: boolean;
}) {
  const empty = occ.kind === "empty";
  const you = occ.kind === "you";
  return (
    <div
      className={`table-seat ${you ? "you" : ""} ${empty ? "empty" : ""} ${folded ? "folded" : ""} ${acting ? "acting" : ""}`}
      style={seatStyle(occ.seat, total, layout)}
      onClick={() => empty && onSit?.(occ.seat)}
      role={empty ? "button" : undefined}
      tabIndex={empty ? 0 : undefined}
      onKeyDown={(e) => {
        if (empty && (e.key === "Enter" || e.key === " ")) onSit?.(occ.seat);
      }}
    >
      <div className="seat-bet">
        {(betCents || 0) > 0 && !folded && (
          <ChipStack cents={betCents!} size={28} maxChips={8} showTotal winning={!!winning} />
        )}
      </div>
      {cards && cards.length > 0 && (
        <div className="seat-cards">
          {cards.map((c, i) => (
            <PlayingCard key={i} card={c} size="sm" />
          ))}
        </div>
      )}
      <div className="seat-head">
        <div className="seat-av-wrap">
          {acting && <span className="seat-act-ring" />}
          {empty ? (
            <div className="seat-empty-av">{occ.seat + 1}</div>
          ) : (
            <SeatAvatar name={occ.name} you={you} />
          )}
          {dealer && <span className="dealer-btn" title="Dealer">D</span>}
          {blind && <span className={`blind-pip ${blind.toLowerCase()}`}>{blind}</span>}
        </div>
        <div className="seat-name">{you ? occ.name : empty ? `Seat ${occ.seat + 1}` : occ.name}</div>
        {status && <div className="seat-status">{status}</div>}
        {empty && <div className="seat-sit">Sit</div>}
      </div>
      {!empty && (
        <ChipRack cents={occ.stackCents} compact highlight={you} label={you ? "You" : undefined} />
      )}
    </div>
  );
}

export function DealerBooth({ children }: { children?: ReactNode }) {
  return (
    <div className="dealer-booth">
      <div className="seat-name">Dealer</div>
      {children}
    </div>
  );
}

export function TableHeart({ children }: { children?: ReactNode }) {
  return (
    <div className="table-heart">
      <div className="felt-wordmark" aria-hidden>
        PIT
      </div>
      {children}
    </div>
  );
}

const SUITS = ["s", "h", "d", "c"] as const;
const RANK_L = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function drawPub(rng: () => number): PubCard {
  const ri = Math.floor(rng() * 13);
  const si = Math.floor(rng() * 4);
  const rank = RANK_L[ri]!;
  const suit = SUITS[si]!;
  return { id: `${rank}${suit}`, rank, suit, red: suit === "h" || suit === "d" };
}

function bjTotal(cards: PubCard[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === "A") {
      aces += 1;
      total += 11;
    } else if (c.rank === "K" || c.rank === "Q" || c.rank === "J" || c.rank === "10") total += 10;
    else total += Number(c.rank) || 0;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { total, soft: aces > 0 && total <= 21 };
}

function dealerUpVal(rank: string | undefined): number {
  if (!rank || rank === "?") return 10;
  if (rank === "A") return 11;
  if (rank === "K" || rank === "Q" || rank === "J" || rank === "10") return 10;
  return Number(rank) || 10;
}

function basicMove(total: number, soft: boolean, up: number): "hit" | "stand" {
  if (soft) {
    if (total >= 19) return "stand";
    if (total === 18) return up >= 9 ? "hit" : "stand";
    return "hit";
  }
  if (total >= 17) return "stand";
  if (total >= 13 && up <= 6) return "stand";
  if (total === 12 && up >= 4 && up <= 6) return "stand";
  return "hit";
}

export function botBlackjackHand(seed: string, dealerRank: string | undefined, playing: boolean): PubCard[] {
  const rng = rngFrom(seed);
  const cards = [drawPub(rng), drawPub(rng)];
  if (!playing) return cards;
  const up = dealerUpVal(dealerRank);
  for (let g = 0; g < 6; g++) {
    const v = bjTotal(cards);
    if (v.total >= 21) break;
    if (basicMove(v.total, v.soft, up) === "stand") break;
    cards.push(drawPub(rng));
  }
  return cards;
}

export function botHandValue(cards: PubCard[]) {
  return bjTotal(cards);
}

export function botPaiGowCards(seed: string, reveal: boolean): { high: PubCard[]; low: PubCard[] } | PubCard[] {
  const rng = rngFrom(seed);
  const cards = Array.from({ length: 7 }, () => drawPub(rng));
  if (!reveal) return cards;
  return { high: cards.slice(0, 5), low: cards.slice(5) };
}

export const CARD_BACK = BACK;

export function StandingRail({
  youName,
  youStack,
  coinIn,
}: {
  youName: string;
  youStack: number;
  coinIn?: number;
}) {
  const rng = rngFrom(`rail-${youName}`);
  const bots = [
    { name: BOT_NAMES[Math.floor(rng() * 5)]!, stack: 12000 + Math.floor(rng() * 20) * 500 },
    { name: BOT_NAMES[5 + Math.floor(rng() * 5)]!, stack: 9000 + Math.floor(rng() * 16) * 500 },
  ];
  return (
    <div className="standing-rail">
      <div className="stand-spot">
        <SeatAvatar name={bots[0]!.name} size={36} />
        <div className="seat-name">{bots[0]!.name}</div>
        <ChipRack cents={bots[0]!.stack} compact />
      </div>
      <div className="stand-spot you">
        <SeatAvatar name={youName} you size={40} />
        <div className="seat-name">{youName}</div>
        <ChipRack cents={youStack} compact highlight label="Your chips" />
        {!!coinIn && coinIn > 0 && (
          <div className="stand-coinin">
            <ChipStack cents={coinIn} size={30} />
          </div>
        )}
      </div>
      <div className="stand-spot">
        <SeatAvatar name={bots[1]!.name} size={36} />
        <div className="seat-name">{bots[1]!.name}</div>
        <ChipRack cents={bots[1]!.stack} compact />
      </div>
    </div>
  );
}
