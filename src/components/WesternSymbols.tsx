"use client";
/**
 * Original western reel symbols for Sundown Trail, Antler Ridge and Buckshot Bars.
 * Art only: symbol keys, strips and paytables live in src/lib/games and are untouched.
 */
import { useId, type ReactNode } from "react";
import { AntlerShoe } from "./WesternArt";

const useUid = () => useId().replace(/[^a-zA-Z0-9]/g, "");
const Svg = ({ children }: { children: ReactNode }) => <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>{children}</svg>;
const INK = "#2a1208";

function Gold({ id }: { id: string }) {
  return <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff1a8" /><stop offset=".5" stopColor="#fedd52" /><stop offset="1" stopColor="#b86f00" /></linearGradient>;
}

const Wild = () => <AntlerShoe size={64} className="sym-svg" />;

function Star({ fill = "gold" }: { fill?: "gold" | "red" }) {
  const id = useUid();
  const pts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? 11 : 26, a = -Math.PI / 2 + (i * Math.PI) / 5;
    return `${(32 + Math.cos(a) * r).toFixed(1)},${(33 + Math.sin(a) * r).toFixed(1)}`;
  }).join(" ");
  return (
    <Svg>
      <defs><Gold id={id} /></defs>
      <polygon points={pts} fill={fill === "gold" ? `url(#g${id})` : "#c0201e"} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      {Array.from({ length: 5 }, (_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5; return <circle key={i} cx={32 + Math.cos(a) * 26} cy={33 + Math.sin(a) * 26} r="3" fill={fill === "gold" ? `url(#g${id})` : "#c0201e"} stroke={INK} strokeWidth="1.4" />; })}
      <circle cx="32" cy="33" r="7" fill="none" stroke={INK} strokeWidth="1.6" />
    </Svg>
  );
}

function Nugget() {
  const id = useUid();
  return (
    <Svg>
      <defs><Gold id={id} /></defs>
      <path d="M12 40 L18 24 L30 16 L44 20 L54 32 L50 46 L34 52 L18 50 Z" fill={`url(#g${id})`} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M18 24 L28 32 L30 16 M28 32 L44 20 M28 32 L34 52 M28 32 L12 40 M44 20 L42 36 L54 32 M42 36 L34 52" stroke="#9a5a00" strokeWidth="1.2" fill="none" />
      <path d="M22 26 L27 22" stroke="#fffbe0" strokeWidth="2.4" strokeLinecap="round" />
    </Svg>
  );
}

function Ace({ red = false }: { red?: boolean }) {
  return (
    <Svg>
      <rect x="15" y="8" width="34" height="48" rx="5" fill="#fffdf4" stroke={INK} strokeWidth="2" />
      <text x="20" y="21" fontSize="11" fontWeight="900" fill={red ? "#c0201e" : INK} fontFamily="Georgia, serif">A</text>
      <path d={red ? "M32 44 C20 34 22 24 28 24 C30 24 32 26 32 28 C32 26 34 24 36 24 C42 24 44 34 32 44 Z" : "M32 22 C26 30 21 33 22 38 C23 42 28 42 30 39 L28 46 H36 L34 39 C36 42 41 42 42 38 C43 33 38 30 32 22 Z"} fill={red ? "#c0201e" : INK} />
    </Svg>
  );
}

function PokerChip({ c = "#9c3835" }: { c?: string }) {
  return (
    <Svg>
      <circle cx="32" cy="32" r="24" fill={c} stroke={INK} strokeWidth="2" />
      {Array.from({ length: 8 }, (_, i) => <rect key={i} x="29" y="8" width="6" height="9" rx="1" fill="#fffdf4" transform={`rotate(${i * 45} 32 32)`} />)}
      <circle cx="32" cy="32" r="14" fill="#fffdf4" stroke={INK} strokeWidth="1.4" />
      <path d="M26 28 C24 33 26 38 32 39 C38 38 40 33 38 28" fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" />
    </Svg>
  );
}

function Hat() {
  return (
    <Svg>
      <path d="M6 40 C14 48 50 48 58 40 C54 36 50 38 46 38 C46 28 44 18 38 18 C35 18 34 21 32 21 C30 21 29 18 26 18 C20 18 18 28 18 38 C14 38 10 36 6 40 Z" fill="#8a4a1e" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M18 34 C26 37 38 37 46 34" stroke="#c0201e" strokeWidth="4" fill="none" />
    </Svg>
  );
}

function Lantern() {
  const id = useUid();
  return (
    <Svg>
      <defs><Gold id={id} /><radialGradient id={`f${id}`} cx="50%" cy="55%" r="50%"><stop offset="0" stopColor="#fff6c8" /><stop offset="1" stopColor="#ef9a01" /></radialGradient></defs>
      <path d="M24 12 C24 4 40 4 40 12" fill="none" stroke={INK} strokeWidth="2.2" />
      <rect x="22" y="12" width="20" height="6" rx="2" fill={`url(#g${id})`} stroke={INK} strokeWidth="1.6" />
      <path d="M22 18 L18 46 H46 L42 18 Z" fill={`url(#f${id})`} stroke={INK} strokeWidth="2" />
      <path d="M32 26 C28 32 28 38 32 40 C36 38 36 32 32 26 Z" fill="#c0201e" opacity=".85" />
      <rect x="16" y="46" width="32" height="7" rx="2" fill={`url(#g${id})`} stroke={INK} strokeWidth="1.6" />
    </Svg>
  );
}

function Bar({ n = 1, color = "#242020" }: { n?: number; color?: string }) {
  const h = n === 1 ? 18 : n === 2 ? 13 : 10;
  const gap = 3;
  const total = n * h + (n - 1) * gap;
  const y0 = 32 - total / 2;
  return (
    <Svg>
      {Array.from({ length: n }, (_, i) => (
        <g key={i}>
          <rect x="6" y={y0 + i * (h + gap)} width="52" height={h} rx="3" fill={INK} />
          <text x="32" y={y0 + i * (h + gap) + h * 0.8} textAnchor="middle" fontSize={h * 0.9} fontWeight="900" fontFamily="Impact, 'Arial Black', sans-serif" fill={color} stroke="#fffdf4" strokeWidth=".7" letterSpacing="1">BAR</text>
        </g>
      ))}
    </Svg>
  );
}

function Boot() {
  return (
    <Svg>
      <path d="M22 8 H40 V36 L54 42 C58 44 58 52 52 52 H18 C16 52 16 48 18 46 L22 40 Z" fill="#8a4a1e" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M24 16 C30 20 34 20 38 16 M24 26 C30 30 34 30 38 26" stroke="#fedd52" strokeWidth="2" fill="none" />
      <path d="M18 52 V56 H26 V52" fill={INK} />
    </Svg>
  );
}

function Spur() {
  const id = useUid();
  return (
    <Svg>
      <defs><Gold id={id} /></defs>
      <path d="M6 30 C14 22 30 22 36 30" fill="none" stroke={`url(#g${id})`} strokeWidth="5" strokeLinecap="round" />
      <path d="M6 30 C14 22 30 22 36 30" fill="none" stroke={INK} strokeWidth="1.2" />
      <line x1="36" y1="30" x2="44" y2="32" stroke={INK} strokeWidth="3" />
      {Array.from({ length: 12 }, (_, i) => { const a = (i * Math.PI) / 6; return <line key={i} x1={48} y1={33} x2={48 + Math.cos(a) * 12} y2={33 + Math.sin(a) * 12} stroke={`url(#g${id})`} strokeWidth="2.6" strokeLinecap="round" />; })}
      <circle cx="48" cy="33" r="4" fill={INK} />
    </Svg>
  );
}

function Wheel() {
  return (
    <Svg>
      <circle cx="32" cy="32" r="24" fill="none" stroke="#6a3a14" strokeWidth="6" />
      <circle cx="32" cy="32" r="24" fill="none" stroke={INK} strokeWidth="1.4" />
      {Array.from({ length: 6 }, (_, i) => <line key={i} x1="32" y1="32" x2={32 + Math.cos((i * Math.PI) / 3) * 22} y2={32 + Math.sin((i * Math.PI) / 3) * 22} stroke="#8a4a1e" strokeWidth="4" />)}
      <circle cx="32" cy="32" r="6" fill="#b86f00" stroke={INK} strokeWidth="1.6" />
    </Svg>
  );
}

function Cactus() {
  return (
    <Svg>
      <path d="M28 58 V14 a5 5 0 0 1 10 0 V58 Z M28 38 H20 a5 5 0 0 1 -5 -5 V22 a4 4 0 0 1 8 0 V30 H28 Z M38 32 H44 V20 a4 4 0 0 1 8 0 V28 a5 5 0 0 1 -5 5 H38 Z" fill="#2f7a3a" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path d="M33 16 V54" stroke="#9bd08a" strokeWidth="1.4" />
      <circle cx="33" cy="9" r="3.5" fill="#e0457a" />
    </Svg>
  );
}

function Lasso() {
  return (
    <Svg>
      <ellipse cx="34" cy="26" rx="20" ry="14" fill="none" stroke="#c89a52" strokeWidth="5" />
      <ellipse cx="34" cy="26" rx="20" ry="14" fill="none" stroke={INK} strokeWidth="1" strokeDasharray="3 3" />
      <path d="M18 34 C12 44 18 50 12 58" fill="none" stroke="#c89a52" strokeWidth="5" strokeLinecap="round" />
      <rect x="15" y="30" width="7" height="7" rx="2" fill="#8a4a1e" stroke={INK} strokeWidth="1.4" />
    </Svg>
  );
}

function Pick() {
  return (
    <Svg>
      <path d="M8 22 C20 10 44 10 56 22 C44 18 20 18 8 22 Z" fill="#9aa3ad" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <rect x="29" y="14" width="6" height="44" rx="2" fill="#8a4a1e" stroke={INK} strokeWidth="1.8" />
    </Svg>
  );
}

function Seven({ color = "#c0201e" }: { color?: string }) {
  return (
    <Svg>
      <path d="M14 12 H52 V20 C42 30 36 42 34 56 H22 C24 42 30 30 38 22 H14 Z" fill={color} stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M18 15 H48" stroke="#ffb0a0" strokeWidth="2" opacity=".8" />
    </Svg>
  );
}

function Cherries() {
  return (
    <Svg>
      <path d="M22 40 C26 28 32 18 44 10 M42 40 C40 28 40 20 44 10" fill="none" stroke="#3a6a1a" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M44 10 C50 6 58 8 58 14 C52 16 46 14 44 10 Z" fill="#4a8a2a" stroke={INK} strokeWidth="1.4" />
      <circle cx="21" cy="45" r="11" fill="#c0201e" stroke={INK} strokeWidth="2" />
      <circle cx="43" cy="45" r="11" fill="#c0201e" stroke={INK} strokeWidth="2" />
      <circle cx="17" cy="41" r="3" fill="#ffb0a0" /><circle cx="39" cy="41" r="3" fill="#ffb0a0" />
    </Svg>
  );
}

const Blank = () => <Svg>{null}</Svg>;

export type SymArt = { label: string; tone: string; Svg: () => ReactNode };

/** Sundown Trail. Keys and pay order unchanged (WILD > CROWN > DIAMOND > ACE > CHIP > HORSE > LAMP > BAR). */
export const SUNDOWN_ART = {
  WILD: { label: "WILD", tone: "sd-wild", Svg: Wild },
  CROWN: { label: "STAR", tone: "sd-star", Svg: () => <Star /> },
  DIAMOND: { label: "NUGGET", tone: "sd-nugget", Svg: Nugget },
  ACE: { label: "ACE", tone: "sd-ace", Svg: () => <Ace /> },
  CHIP: { label: "CHIP", tone: "sd-chip", Svg: () => <PokerChip /> },
  HORSE: { label: "HAT", tone: "sd-hat", Svg: Hat },
  LAMP: { label: "LANTERN", tone: "sd-lantern", Svg: Lantern },
  BAR: { label: "BAR", tone: "sd-bar", Svg: () => <Bar n={1} color="#448cec" /> },
} satisfies Record<string, SymArt>;

/** Antler Ridge. Keys and pay order unchanged (WILD > MONKEY > PARROT > JAGUAR > TOUCAN > BANANA > COCONUT > VINE). */
export const RIDGE_ART = {
  WILD: { label: "WILD", tone: "ar-wild", Svg: Wild },
  MONKEY: { label: "BADGE", tone: "ar-badge", Svg: () => <Star fill="red" /> },
  PARROT: { label: "BOOT", tone: "ar-boot", Svg: Boot },
  JAGUAR: { label: "SPUR", tone: "ar-spur", Svg: Spur },
  TOUCAN: { label: "WHEEL", tone: "ar-wheel", Svg: Wheel },
  BANANA: { label: "CACTUS", tone: "ar-cactus", Svg: Cactus },
  COCONUT: { label: "LASSO", tone: "ar-lasso", Svg: Lasso },
  VINE: { label: "PICK", tone: "ar-pick", Svg: Pick },
} satisfies Record<string, SymArt>;

/** Buckshot Bars, classic 3-reel set. */
export const BUCKSHOT_ART = {
  WILD: { label: "WILD", tone: "bb-wild", Svg: Wild },
  SEVEN: { label: "7", tone: "bb-seven", Svg: () => <Seven /> },
  BAR3: { label: "TRIPLE BAR", tone: "bb-bar3", Svg: () => <Bar n={3} color="#bd954c" /> },
  BAR2: { label: "DOUBLE BAR", tone: "bb-bar2", Svg: () => <Bar n={2} color="#d95951" /> },
  BAR1: { label: "SINGLE BAR", tone: "bb-bar1", Svg: () => <Bar n={1} color="#448cec" /> },
  CHERRY: { label: "CHERRY", tone: "bb-cherry", Svg: Cherries },
  BLANK: { label: "BLANK", tone: "bb-blank", Svg: Blank },
} satisfies Record<string, SymArt>;
