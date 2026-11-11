"use client";
/**
 * Original reel art for Canary Creek Mine (inline SVG, no external images or brands).
 * Symbol keys, strips and pays live in src/lib/games/mine.ts.
 */
import { useId, type ReactNode } from "react";
import type { MineSymbol } from "@/lib/games/mine";

const useUid = () => useId().replace(/[^a-zA-Z0-9]/g, "");
const Svg = ({ children }: { children: ReactNode }) => <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>{children}</svg>;
const INK = "#2a1208";

function GoldGrad({ id }: { id: string }) {
  return <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff1a8" /><stop offset=".5" stopColor="#fedd52" /><stop offset="1" stopColor="#b86f00" /></linearGradient>;
}

/** WILD: Clem's hard hat with a lit lamp. */
export function MineWild() {
  const id = useUid();
  return (
    <Svg>
      <defs><GoldGrad id={id} /><radialGradient id={`l${id}`} cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#fffbe0" /><stop offset="1" stopColor="#ffb02a" stopOpacity="0" /></radialGradient></defs>
      <g transform="translate(0 6)">
      <circle cx="32" cy="20" r="18" fill={`url(#l${id})`} />
      <path d="M10 42 C10 26 20 18 32 18 C44 18 54 26 54 42 Z" fill="#9c3835" stroke={INK} strokeWidth="2.2" />
      <path d="M6 42 H58 C58 47 54 49 50 49 H14 C10 49 6 47 6 42 Z" fill="#6a1f1d" stroke={INK} strokeWidth="2.2" />
      <path d="M30 18 V40 M34 18 V40" stroke="#c4554f" strokeWidth="1.6" />
      <rect x="25" y="22" width="14" height="11" rx="3" fill={`url(#g${id})`} stroke={INK} strokeWidth="1.8" />
      <circle cx="32" cy="27.5" r="3.4" fill="#fffbe0" stroke={INK} strokeWidth="1.2" />
      </g>
    </Svg>
  );
}

/** Scatter: a bundle of dynamite with a lit fuse. */
export function Dynamite() {
  return (
    <Svg>
      <path d="M44 14 C48 8 52 10 50 4" stroke="#6b4a2a" strokeWidth="2" fill="none" />
      <path d="M50 4 l3 -2 M50 4 l3 2 M50 4 l-1 -3.4" stroke="#ffd23a" strokeWidth="2" strokeLinecap="round" />
      <circle cx="50" cy="4" r="2.4" fill="#fff4b0" />
      {[16, 26, 36].map((x) => (
        <g key={x}>
          <rect x={x - 5} y="18" width="11" height="34" rx="3" fill="#c0201e" stroke={INK} strokeWidth="2" />
          <rect x={x - 3} y="21" width="3" height="28" rx="1.5" fill="#ff6a5a" opacity=".6" />
        </g>
      ))}
      <rect x="8" y="30" width="38" height="7" rx="2" fill="#e8d6a8" stroke={INK} strokeWidth="1.6" />
      <text x="27" y="36" textAnchor="middle" fontSize="6.4" fontWeight="900" fill={INK} fontFamily="var(--st-narrow, Arial Narrow), sans-serif">TNT</text>
      <path d="M36 18 C40 14 42 14 44 14" stroke="#6b4a2a" strokeWidth="2" fill="none" />
    </Svg>
  );
}

/** Bonus: a mine cart heaped with ore. */
export function MineCart() {
  const id = useUid();
  return (
    <Svg>
      <defs><GoldGrad id={id} /></defs>
      <path d="M14 26 L18 18 L26 22 L32 14 L40 20 L46 16 L50 26 Z" fill={`url(#g${id})`} stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8 26 H56 L50 46 H14 Z" fill="#5a3a22" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M11 33 H53 M13 40 H51" stroke="#3a2412" strokeWidth="1.6" />
      <circle cx="16" cy="29.5" r="1.4" fill="#d0b080" /><circle cx="48" cy="29.5" r="1.4" fill="#d0b080" />
      <circle cx="21" cy="50" r="6" fill="#3a3a3a" stroke={INK} strokeWidth="2" /><circle cx="21" cy="50" r="2" fill="#bbb" />
      <circle cx="43" cy="50" r="6" fill="#3a3a3a" stroke={INK} strokeWidth="2" /><circle cx="43" cy="50" r="2" fill="#bbb" />
      <path d="M4 58 H60" stroke="#8a6a4a" strokeWidth="2.4" />
    </Svg>
  );
}

function Nugget() {
  const id = useUid();
  return (
    <Svg>
      <defs><GoldGrad id={id} /></defs>
      <path d="M10 42 L16 24 L28 14 L42 16 L54 28 L52 44 L38 52 L20 52 Z" fill={`url(#g${id})`} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M16 24 L30 32 L28 14 M30 32 L42 16 M30 32 L38 52 M30 32 L10 42 M42 16 L44 34 L54 28 M44 34 L38 52" stroke="#9a5a00" strokeWidth="1.2" fill="none" />
      <path d="M20 24 L26 19" stroke="#fffbe0" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M50 10 l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2z" fill="#fffbe0" />
    </Svg>
  );
}

/** The canary Pip, Clem's partner. */
function Canary() {
  return (
    <Svg>
      <path d="M8 56 H56" stroke="#6b4a2a" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="30" cy="38" rx="15" ry="13" fill="#ffd23a" stroke={INK} strokeWidth="2.2" />
      <circle cx="40" cy="22" r="9" fill="#ffd23a" stroke={INK} strokeWidth="2.2" />
      <path d="M48 21 L56 24 L48 26 Z" fill="#ef8a2a" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="42" cy="20" r="1.8" fill={INK} />
      <path d="M18 36 C24 30 32 34 34 40 C28 44 22 42 18 36 Z" fill="#f2b81e" stroke={INK} strokeWidth="1.6" />
      <path d="M15 42 L4 48 L16 47 Z" fill="#f2b81e" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M26 51 V56 M34 51 V56" stroke="#ef8a2a" strokeWidth="2" />
    </Svg>
  );
}

function Pickaxe() {
  return (
    <Svg>
      <path d="M18 54 L42 18" stroke="#8a5a2a" strokeWidth="6" strokeLinecap="round" />
      <path d="M18 54 L42 18" stroke={INK} strokeWidth="7.6" strokeLinecap="round" opacity=".25" />
      <path d="M10 20 C22 8 42 6 56 14 C46 12 38 14 34 18 L30 22 C24 18 16 18 10 20 Z" fill="#c8ccd2" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M16 16 C26 10 38 9 48 11" stroke="#fff" strokeWidth="1.6" fill="none" opacity=".8" />
    </Svg>
  );
}

function Lantern() {
  const id = useUid();
  return (
    <Svg>
      <defs><radialGradient id={`f${id}`} cx="50%" cy="55%" r="50%"><stop offset="0" stopColor="#fff6c8" /><stop offset="1" stopColor="#ef9a01" /></radialGradient></defs>
      <path d="M24 12 C24 4 40 4 40 12" stroke={INK} strokeWidth="2.4" fill="none" />
      <rect x="20" y="12" width="24" height="6" rx="2" fill="#3a3a3a" stroke={INK} strokeWidth="1.8" />
      <path d="M22 18 H42 L44 48 H20 Z" fill={`url(#f${id})`} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M26 18 V48 M38 18 V48" stroke="#3a3a3a" strokeWidth="2" />
      <path d="M32 26 C36 32 35 38 32 40 C29 38 28 32 32 26 Z" fill="#fff" opacity=".9" />
      <rect x="18" y="48" width="28" height="7" rx="2" fill="#3a3a3a" stroke={INK} strokeWidth="1.8" />
    </Svg>
  );
}

function GoldPan() {
  return (
    <Svg>
      <ellipse cx="30" cy="38" rx="24" ry="12" fill="#8a8f98" stroke={INK} strokeWidth="2.2" />
      <ellipse cx="30" cy="36" rx="18" ry="7.5" fill="#6a5a44" stroke={INK} strokeWidth="1.4" />
      <path d="M54 34 L62 30" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      {[[24, 35], [31, 37], [36, 34], [28, 39]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.2" fill="#fedd52" stroke="#9a5a00" strokeWidth=".8" />)}
      <path d="M14 30 C22 26 38 26 46 30" stroke="#fff" strokeWidth="1.4" fill="none" opacity=".6" />
    </Svg>
  );
}

function OreRock() {
  return (
    <Svg>
      <path d="M8 46 L14 26 L28 16 L46 20 L56 34 L50 50 L28 54 Z" fill="#6a6a72" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M14 26 L30 34 L28 16 M30 34 L46 20 M30 34 L28 54 M30 34 L56 34" stroke="#4a4a52" strokeWidth="1.2" fill="none" />
      <path d="M36 28 l4 -2 2 4 -4 2z M20 40 l3 -1 1 3 -3 1z M42 42 l3 -2 2 3 -3 1z" fill="#fedd52" stroke="#9a5a00" strokeWidth=".8" />
    </Svg>
  );
}

export type MineArtMeta = { label: string; tone: string; Svg: () => ReactNode };

export const MINE_ART: Record<MineSymbol, MineArtMeta> = {
  WILD: { label: "Wild", tone: "mine-wild", Svg: MineWild },
  DYNAMITE: { label: "Dynamite", tone: "mine-dyn", Svg: Dynamite },
  CART: { label: "Mine cart", tone: "mine-cart", Svg: MineCart },
  NUGGET: { label: "Nugget", tone: "mine-nugget", Svg: Nugget },
  CANARY: { label: "Canary", tone: "mine-canary", Svg: Canary },
  PICK: { label: "Pickaxe", tone: "mine-pick", Svg: Pickaxe },
  LANTERN: { label: "Lantern", tone: "mine-lantern", Svg: Lantern },
  PAN: { label: "Gold pan", tone: "mine-pan", Svg: GoldPan },
  ORE: { label: "Ore", tone: "mine-ore", Svg: OreRock },
};

/** Clem Hollis, the prospector (story card portrait). */
export function ClemPortrait({ size = 120 }: { size?: number }) {
  const id = useUid();
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden className="mine-clem">
      <defs><GoldGrad id={id} /><radialGradient id={`bg${id}`} cx="50%" cy="40%" r="70%"><stop offset="0" stopColor="#5a2a18" /><stop offset="1" stopColor="#1a0806" /></radialGradient></defs>
      <circle cx="60" cy="60" r="58" fill={`url(#bg${id})`} stroke={`url(#g${id})`} strokeWidth="4" />
      <path d="M20 118 C24 92 40 84 60 84 C80 84 96 92 100 118 Z" fill="#3a5a7a" stroke={INK} strokeWidth="2" />
      <path d="M44 86 L60 104 L76 86" fill="#c0201e" stroke={INK} strokeWidth="2" />
      <ellipse cx="60" cy="62" rx="20" ry="23" fill="#f0c29a" stroke={INK} strokeWidth="2" />
      <path d="M40 62 C36 74 42 84 48 82 M80 62 C84 74 78 84 72 82" stroke="#8a4a2a" strokeWidth="5" strokeLinecap="round" fill="none" />
      <circle cx="52" cy="62" r="2.6" fill={INK} /><circle cx="68" cy="62" r="2.6" fill={INK} />
      <path d="M52 74 C56 78 64 78 68 74" stroke={INK} strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <circle cx="47" cy="70" r="3" fill="#e89a8a" opacity=".7" /><circle cx="73" cy="70" r="3" fill="#e89a8a" opacity=".7" />
      <path d="M34 50 C34 32 46 26 60 26 C74 26 86 32 86 50 Z" fill="#9c3835" stroke={INK} strokeWidth="2.2" />
      <path d="M28 50 H92 C92 55 88 56 84 56 H36 C32 56 28 55 28 50 Z" fill="#6a1f1d" stroke={INK} strokeWidth="2" />
      <rect x="52" y="32" width="16" height="12" rx="3" fill={`url(#g${id})`} stroke={INK} strokeWidth="1.8" />
      <circle cx="60" cy="38" r="3.6" fill="#fffbe0" />
      <g transform="translate(78 88)">
        <ellipse cx="10" cy="10" rx="9" ry="8" fill="#ffd23a" stroke={INK} strokeWidth="1.6" />
        <circle cx="16" cy="2" r="5.5" fill="#ffd23a" stroke={INK} strokeWidth="1.6" />
        <path d="M21 1 L26 3 L21 4.6 Z" fill="#ef8a2a" />
        <circle cx="17" cy="1" r="1.2" fill={INK} />
      </g>
    </svg>
  );
}
