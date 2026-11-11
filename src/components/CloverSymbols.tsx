"use client";
/**
 * Original reel art for Kettle of Clover (inline SVG, no external images or brands).
 * Symbol keys, strips and pays live in src/lib/games/clover.ts.
 */
import { useId, type ReactNode } from "react";
import type { ClSymbol } from "@/lib/games/clover";

const useUid = () => useId().replace(/[^a-zA-Z0-9]/g, "");
const Svg = ({ children }: { children: ReactNode }) => <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>{children}</svg>;
const INK = "#0e1a0c";

function GoldGrad({ id }: { id: string }) {
  return <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff1a8" /><stop offset=".5" stopColor="#fedd52" /><stop offset="1" stopColor="#b86f00" /></linearGradient>;
}

/** Four heart-shaped leaves around a centre, with a curled stem. */
export function CloverLeaves({ cx = 32, cy = 30, r = 11, fill = "#2fa84f" }: { cx?: number; cy?: number; r?: number; fill?: string }) {
  const leaf = (a: number) => (
    <path key={a} transform={`rotate(${a} ${cx} ${cy})`} d={`M${cx} ${cy} C${cx - r * 1.1} ${cy - r * 0.4} ${cx - r * 0.9} ${cy - r * 1.6} ${cx} ${cy - r * 1.05} C${cx + r * 0.9} ${cy - r * 1.6} ${cx + r * 1.1} ${cy - r * 0.4} ${cx} ${cy} Z`} fill={fill} stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
  );
  return <g>{[0, 90, 180, 270].map(leaf)}<circle cx={cx} cy={cy} r={r * 0.18} fill="#fff1a8" /></g>;
}

/** WILD: a four-leaf clover on a gold coin rim. */
export function ClWild() {
  const id = useUid();
  return (
    <Svg>
      <defs><GoldGrad id={id} /></defs>
      <circle cx="32" cy="30" r="26" fill="#0f4a24" stroke={`url(#g${id})`} strokeWidth="4" />
      <path d="M33 36 C36 46 42 50 46 52" stroke="#2fa84f" strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <CloverLeaves cx={32} cy={28} r={12} />
      <rect x="12" y="46" width="40" height="13" rx="4" fill={`url(#g${id})`} stroke={INK} strokeWidth="1.8" />
      <text x="32" y="56.5" textAnchor="middle" fontSize="10.5" fontWeight="900" fill={INK} fontFamily="var(--st-display, Impact), sans-serif">WILD</text>
    </Svg>
  );
}

/** Scatter: a copper kettle brimming with gold. */
export function Kettle() {
  const id = useUid();
  return (
    <Svg>
      <defs><GoldGrad id={id} /><linearGradient id={`k${id}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#7a3a12" /><stop offset=".5" stopColor="#d9783a" /><stop offset="1" stopColor="#7a3a12" /></linearGradient></defs>
      {[[22, 18], [30, 14], [38, 17], [44, 21], [18, 22], [34, 20], [26, 21]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx="6" ry="3.4" fill={`url(#g${id})`} stroke={INK} strokeWidth="1.2" />)}
      <path d="M10 26 H54 C54 46 46 56 32 56 C18 56 10 46 10 26 Z" fill={`url(#k${id})`} stroke={INK} strokeWidth="2.2" />
      <rect x="7" y="23" width="50" height="6" rx="3" fill="#a8541e" stroke={INK} strokeWidth="2" />
      <path d="M8 34 C2 34 2 44 10 44 M56 34 C62 34 62 44 54 44" stroke={INK} strokeWidth="2.6" fill="none" />
      <path d="M18 34 C20 44 24 50 30 52" stroke="#f0a070" strokeWidth="2" fill="none" opacity=".7" />
    </Svg>
  );
}

/** Bonus: a rainbow arching over a little stone bridge. */
export function RainbowBridge() {
  const bands = ["#e8413a", "#f39a2a", "#f7d83a", "#4cb84a", "#3a7ad8", "#7a4ab8"];
  return (
    <Svg>
      {bands.map((col, i) => <path key={col} d={`M${6 + i * 3} 44 A${26 - i * 3} ${26 - i * 3} 0 0 1 ${58 - i * 3} 44`} stroke={col} strokeWidth="3.2" fill="none" />)}
      <path d="M4 58 V48 C14 40 50 40 60 48 V58 H46 C46 50 18 50 18 58 Z" fill="#a9a29a" stroke={INK} strokeWidth="2" />
      <path d="M10 50 V56 M54 50 V56 M24 46 V49 M32 45 V48 M40 46 V49" stroke="#6a645c" strokeWidth="1.6" />
      <path d="M2 60 C14 56 50 56 62 60" stroke="#2fa84f" strokeWidth="3" fill="none" />
    </Svg>
  );
}

/** Top pay: a green cobbler's hat with a gold buckle. */
export function Hat() {
  const id = useUid();
  return (
    <Svg>
      <defs><GoldGrad id={id} /></defs>
      <path d="M18 46 L22 10 H42 L46 46 Z" fill="#1f7a3a" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      <ellipse cx="32" cy="48" rx="28" ry="7" fill="#155a2a" stroke={INK} strokeWidth="2.2" />
      <path d="M20 36 H44 L45 44 H19 Z" fill="#1a1a1a" stroke={INK} strokeWidth="1.6" />
      <rect x="26" y="34" width="12" height="11" rx="1.5" fill="none" stroke={`url(#g${id})`} strokeWidth="3" />
      <path d="M44 14 C52 10 56 14 54 20" stroke="#f39a2a" strokeWidth="2" fill="none" />
      <CloverLeaves cx={50} cy={22} r={4} />
    </Svg>
  );
}

/** Harp: a carved wooden harp with strings. */
export function Harp() {
  const id = useUid();
  return (
    <Svg>
      <defs><GoldGrad id={id} /></defs>
      <path d="M14 58 L18 8 C30 6 44 14 52 26 C46 30 40 40 38 58 Z" fill="none" stroke={`url(#g${id})`} strokeWidth="6" strokeLinejoin="round" />
      <path d="M14 58 L18 8 C30 6 44 14 52 26 C46 30 40 40 38 58 Z" fill="none" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
      {[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M${20 + i * 4} ${11 + i * 3.2} V${56}`} stroke="#f7f1e3" strokeWidth="1.2" />)}
      <CloverLeaves cx={18} cy={8} r={4} />
    </Svg>
  );
}

/** Fiddle with its bow. */
export function Fiddle() {
  return (
    <Svg>
      <path d="M32 4 V18" stroke="#3a200e" strokeWidth="4" strokeLinecap="round" />
      <path d="M32 18 C22 18 20 26 24 31 C18 34 16 42 20 50 C24 58 40 58 44 50 C48 42 46 34 40 31 C44 26 42 18 32 18 Z" fill="#b8562a" stroke={INK} strokeWidth="2.2" />
      <path d="M28 36 C27 40 27 42 28 44 M36 36 C37 40 37 42 36 44" stroke={INK} strokeWidth="1.6" fill="none" />
      <path d="M32 22 V52" stroke="#f7f1e3" strokeWidth="1" />
      <rect x="27" y="48" width="10" height="3" rx="1" fill="#2a1606" />
      <path d="M8 58 L56 14" stroke="#c8a070" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M10 56 L54 16" stroke="#f7f1e3" strokeWidth="0.8" />
    </Svg>
  );
}

/** Toadstool: red cap, white spots. */
export function Toadstool() {
  return (
    <Svg>
      <path d="M24 34 C24 44 22 52 20 58 H44 C42 52 40 44 40 34 Z" fill="#f3ead6" stroke={INK} strokeWidth="2" />
      <path d="M6 36 C6 18 18 8 32 8 C46 8 58 18 58 36 Z" fill="#d23a2a" stroke={INK} strokeWidth="2.2" />
      {[[20, 22, 4], [34, 16, 3.4], [46, 26, 4], [28, 30, 3], [12, 31, 2.6]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#fff" />)}
      <path d="M2 60 C16 56 48 56 62 60" stroke="#2fa84f" strokeWidth="3" fill="none" />
    </Svg>
  );
}

/** Acorn. */
export function Acorn() {
  return (
    <Svg>
      <path d="M18 30 C18 46 24 58 32 58 C40 58 46 46 46 30 Z" fill="#c8862a" stroke={INK} strokeWidth="2.2" />
      <path d="M12 30 C12 18 20 14 32 14 C44 14 52 18 52 30 Z" fill="#6a4a22" stroke={INK} strokeWidth="2.2" />
      <path d="M18 22 H46 M16 27 H48 M24 17 V29 M32 15 V29 M40 17 V29" stroke="#3a2610" strokeWidth="1.2" />
      <path d="M32 14 C32 8 36 5 40 4" stroke="#3a2610" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M24 36 C24 44 26 50 30 52" stroke="#f0c070" strokeWidth="2" fill="none" opacity=".7" />
    </Svg>
  );
}

/** Bluebell sprig. */
export function Bluebell() {
  return (
    <Svg>
      <path d="M30 60 C30 40 34 22 44 8" stroke="#2fa84f" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M30 50 C22 46 16 46 10 50" stroke="#2fa84f" strokeWidth="2.4" fill="none" />
      {[[42, 16], [36, 28], [32, 40]].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <path d="M0 0 C-10 0 -14 8 -12 16 L-9 13 L-6 17 L-3 13 L0 17 L3 13 L4 15 C6 8 6 0 0 0 Z" fill="#4a6ad8" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
        </g>
      ))}
    </Svg>
  );
}

export type ClArtMeta = { label: string; tone: string; Svg: () => ReactNode };

export const CLOVER_ART: Record<ClSymbol, ClArtMeta> = {
  WILD: { label: "Wild", tone: "cl-wild", Svg: ClWild },
  KETTLE: { label: "Kettle", tone: "cl-kettle", Svg: Kettle },
  RAINBOW: { label: "Rainbow", tone: "cl-rainbow", Svg: RainbowBridge },
  HAT: { label: "Hat", tone: "cl-hat", Svg: Hat },
  HARP: { label: "Harp", tone: "cl-harp", Svg: Harp },
  FIDDLE: { label: "Fiddle", tone: "cl-fiddle", Svg: Fiddle },
  TOADSTOOL: { label: "Toadstool", tone: "cl-toad", Svg: Toadstool },
  ACORN: { label: "Acorn", tone: "cl-acorn", Svg: Acorn },
  BLUEBELL: { label: "Bluebell", tone: "cl-bell", Svg: Bluebell },
};

/** Orla Tully, the leprechaun cobbler, with Bramble the hare. */
export function OrlaPortrait({ size = 120 }: { size?: number }) {
  const id = useUid();
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden className="cl-orla">
      <defs>
        <GoldGrad id={id} />
        <radialGradient id={`bg${id}`} cx="50%" cy="35%" r="70%"><stop offset="0" stopColor="#2f7a4a" /><stop offset="1" stopColor="#0a2414" /></radialGradient>
        <clipPath id={`cl${id}`}><circle cx="60" cy="60" r="56" /></clipPath>
      </defs>
      <circle cx="60" cy="60" r="58" fill={`url(#bg${id})`} stroke={`url(#g${id})`} strokeWidth="4" />
      <g clipPath={`url(#cl${id})`}>
        {["#e8413a", "#f39a2a", "#f7d83a", "#4cb84a", "#3a7ad8"].map((c, i) => <path key={c} d={`M${-6 + i * 4} 70 A${66 - i * 4} ${66 - i * 4} 0 0 1 ${126 - i * 4} 70`} stroke={c} strokeWidth="3" fill="none" opacity=".55" />)}
        <path d="M24 120 C26 98 42 90 60 90 C78 90 94 98 96 120 Z" fill="#1f7a3a" stroke={INK} strokeWidth="2" />
        <path d="M50 92 L60 104 L70 92" fill="#f7f1e3" stroke={INK} strokeWidth="2" />
        <path d="M0 112 C30 104 90 104 120 112 V120 H0 Z" fill="#2fa84f" />
      </g>
      <ellipse cx="60" cy="64" rx="19" ry="21" fill="#f2c7a2" stroke={INK} strokeWidth="2" />
      <path d="M40 60 C34 74 40 88 48 88 M80 60 C86 74 80 88 72 88" stroke="#c2541c" strokeWidth="7" strokeLinecap="round" fill="none" />
      <circle cx="52" cy="64" r="2.6" fill={INK} /><circle cx="68" cy="64" r="2.6" fill={INK} />
      <circle cx="47" cy="71" r="3" fill="#e89a8a" opacity=".7" /><circle cx="73" cy="71" r="3" fill="#e89a8a" opacity=".7" />
      <path d="M52 75 C56 79 64 79 68 75" stroke={INK} strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M44 48 L48 18 H72 L76 48 Z" fill="#1f7a3a" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      <ellipse cx="60" cy="49" rx="27" ry="6" fill="#155a2a" stroke={INK} strokeWidth="2" />
      <path d="M46 40 H74 L75 46 H45 Z" fill="#1a1a1a" />
      <rect x="55" y="39" width="10" height="8" rx="1" fill="none" stroke={`url(#g${id})`} strokeWidth="2.4" />
      <g transform="translate(84 84)">
        <ellipse cx="12" cy="20" rx="13" ry="10" fill="#a8845a" stroke={INK} strokeWidth="1.6" />
        <circle cx="20" cy="10" r="7" fill="#a8845a" stroke={INK} strokeWidth="1.6" />
        <path d="M18 4 C16 -8 20 -12 22 -2 M23 4 C24 -8 29 -10 27 1" fill="#a8845a" stroke={INK} strokeWidth="1.4" />
        <circle cx="22" cy="9" r="1.3" fill={INK} />
      </g>
    </svg>
  );
}
