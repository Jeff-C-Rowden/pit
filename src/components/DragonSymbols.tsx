"use client";
/**
 * Original dragon / lantern / gold-coin / pearl / ingot reel symbols for Gilded Track (red lacquer set)
 * and Canopy Spire (jade set). Art only: symbol keys, strips and paytables live in src/lib/games and are untouched.
 */
import { useId, type ReactNode } from "react";

const useUid = () => useId().replace(/[^a-zA-Z0-9]/g, "");
const Svg = ({ children }: { children: ReactNode }) => <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>{children}</svg>;

function GoldDefs({ id }: { id: string }) {
  return (
    <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#fff6c4" /><stop offset=".45" stopColor="#f5c542" /><stop offset="1" stopColor="#a8650c" />
    </linearGradient>
  );
}

function Dragon({ jade = false }: { jade?: boolean }) {
  const id = useUid();
  const [a, b, c] = jade ? ["#7dffc0", "#14a06a", "#064a30"] : ["#ff6a4a", "#d3121c", "#6a0710"];
  return (
    <Svg>
      <defs>
        <GoldDefs id={id} />
        <linearGradient id={`h${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a} /><stop offset=".5" stopColor={b} /><stop offset="1" stopColor={c} /></linearGradient>
      </defs>
      <g transform="translate(37 38) scale(.53)">
        <path d="M8 4 C26 -2 36 12 50 6 C40 20 28 24 14 18 Z" fill="#ff9a2a" />
        <path d="M6 12 C22 16 30 30 44 30 C30 38 18 34 8 24 Z" fill="#ffc03a" />
        <path d="M2 -4 C14 -26 30 -32 46 -30 C32 -24 20 -14 10 -2 Z" fill={`url(#g${id})`} stroke="#7a4708" />
        <path d="M-4 -8 C2 -30 14 -42 28 -46 C18 -36 10 -22 4 -6 Z" fill={`url(#g${id})`} stroke="#7a4708" />
        <path d="M0 0 C-10 -14 -34 -16 -48 -8 L-64 -4 C-71 -2 -71 6 -64 8 L-44 10 C-36 12 -24 12 -14 16 C-2 22 12 16 14 4 C15 -6 8 -4 0 0 Z" fill={`url(#h${id})`} stroke="#2a0204" strokeWidth="2.5" />
        <path d="M-46 14 C-40 23 -26 27 -10 22 L-6 17 C-20 20 -34 18 -46 14 Z" fill={c} stroke="#2a0204" strokeWidth="2" />
        <path d="M-42 12 l2 5 l2 -5 M-34 13 l2 5 l2 -5" fill="#fff8e6" />
        <path d="M-34 -10 Q-22 -17 -10 -10" stroke={`url(#g${id})`} strokeWidth="4" fill="none" strokeLinecap="round" />
        <ellipse cx="-22" cy="-3" rx="7" ry="5" fill="#ffe27a" stroke="#2a0204" strokeWidth="1.5" />
        <ellipse cx="-22" cy="-3" rx="2" ry="4.4" fill="#1a0303" />
        <path d="M-62 6 C-80 14 -88 30 -80 46" stroke={`url(#g${id})`} strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
    </Svg>
  );
}

function Ingot({ stack = false }: { stack?: boolean }) {
  const id = useUid();
  const one = (dx: number, dy: number, s: number, k: string) => (
    <g key={k} transform={`translate(${dx} ${dy}) scale(${s})`}>
      <ellipse cx="32" cy="31" rx="12" ry="9" fill={`url(#g${id})`} stroke="#7a4708" strokeWidth="1.4" />
      <path d="M6 36 Q4 24 17 27 Q21 38 32 38 Q43 38 47 27 Q60 24 58 36 Q54 50 32 50 Q10 50 6 36 Z" fill={`url(#g${id})`} stroke="#7a4708" strokeWidth="1.6" />
      <path d="M14 40 Q32 46 50 40" stroke="#fff6c4" strokeWidth="2" fill="none" opacity=".75" strokeLinecap="round" />
      <path d="M26 26 q4 -4 9 -1" stroke="#fffbe0" strokeWidth="2" fill="none" strokeLinecap="round" />
    </g>
  );
  return (
    <Svg>
      <defs><GoldDefs id={id} /></defs>
      {stack ? [one(-8, 10, .72, "a"), one(18, 10, .72, "b"), one(5, -6, .72, "c")] : one(0, 0, 1, "a")}
    </Svg>
  );
}

function Pearl({ jade = false }: { jade?: boolean }) {
  const id = useUid();
  const [a, b] = jade ? ["#e8fff4", "#3fd09a"] : ["#ffffff", "#ffb0b8"];
  return (
    <Svg>
      <defs>
        <GoldDefs id={id} />
        <radialGradient id={`p${id}`} cx="38%" cy="32%" r="70%"><stop offset="0" stopColor={a} /><stop offset=".6" stopColor={b} /><stop offset="1" stopColor={jade ? "#0a6a44" : "#b0606a"} /></radialGradient>
      </defs>
      <path d="M18 40 C10 28 20 20 16 10 C26 16 26 6 32 4 C34 12 44 10 42 20 C50 18 50 32 46 40 Z" fill="#ff8a2a" opacity=".85" />
      <circle cx="32" cy="32" r="15" fill={`url(#p${id})`} stroke="#fff3b0" strokeWidth="1.2" />
      <ellipse cx="26" cy="26" rx="5" ry="3.4" fill="#fff" opacity=".8" />
      <path d="M16 52 h32 l-4 6 h-24 z" fill={`url(#g${id})`} stroke="#7a4708" />
      <path d="M20 48 q12 6 24 0" stroke={`url(#g${id})`} strokeWidth="3" fill="none" />
    </Svg>
  );
}

function Koi() {
  const id = useUid();
  return (
    <Svg>
      <defs>
        <GoldDefs id={id} />
        <linearGradient id={`k${id}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#ff9a3a" /><stop offset="1" stopColor="#e2381c" /></linearGradient>
      </defs>
      <path d="M50 22 L60 12 L58 30 L62 44 L50 36 Z" fill="#ff7a2a" stroke="#7a1a08" strokeWidth="1.2" />
      <path d="M6 32 C12 16 34 14 50 26 C52 30 52 34 50 38 C34 50 12 48 6 32 Z" fill={`url(#k${id})`} stroke="#7a1a08" strokeWidth="1.5" />
      <path d="M22 22 C28 26 30 34 24 42 C34 40 38 30 34 20 Z" fill="#fff4e6" opacity=".9" />
      <path d="M26 44 l-6 10 l12 -6 Z M28 20 l-4 -10 l12 8 Z" fill="#ff7a2a" stroke="#7a1a08" />
      <circle cx="13" cy="29" r="2.4" fill="#1a0303" /><circle cx="12.4" cy="28.4" r=".8" fill="#fff" />
      <path d="M8 35 q-6 3 -6 8" stroke={`url(#g${id})`} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </Svg>
  );
}

function Coin({ stack = false }: { stack?: boolean }) {
  const id = useUid();
  const face = (cx: number, cy: number, r: number, k: string) => (
    <g key={k}>
      <circle cx={cx} cy={cy} r={r} fill={`url(#c${id})`} stroke="#7a4708" strokeWidth="1.6" />
      <circle cx={cx} cy={cy} r={r * .74} fill="none" stroke="#a8700f" strokeWidth="1.2" />
      <rect x={cx - r * .24} y={cy - r * .24} width={r * .48} height={r * .48} rx="1" fill="#8b0a12" stroke="#7a4708" />
      {[0, 1, 2, 3].map((i) => {
        const t = (i * Math.PI) / 2 + Math.PI / 4;
        return <circle key={i} cx={cx + Math.cos(t) * r * .5} cy={cy + Math.sin(t) * r * .5} r={r * .07} fill="#7a4708" />;
      })}
    </g>
  );
  return (
    <Svg>
      <defs><radialGradient id={`c${id}`} cx="38%" cy="32%" r="70%"><stop offset="0" stopColor="#fff6c4" /><stop offset=".45" stopColor="#f6c84a" /><stop offset="1" stopColor="#a86a0c" /></radialGradient></defs>
      {stack ? (
        <>
          {[0, 1, 2].map((i) => <ellipse key={i} cx="32" cy={52 - i * 5} rx="20" ry="6" fill="#c8891a" stroke="#7a4708" strokeWidth="1.2" />)}
          {face(32, 26, 17, "f")}
        </>
      ) : face(32, 32, 24, "f")}
    </Svg>
  );
}

function LanternSym({ pair = false }: { pair?: boolean }) {
  const id = useUid();
  const one = (x: number, s: number, k: string) => (
    <g key={k} transform={`translate(${x} 34) scale(${s})`}>
      <line x1="0" y1="-30" x2="0" y2="-20" stroke="#e7b84a" strokeWidth="1.6" />
      <rect x="-8" y="-21" width="16" height="5" rx="1.5" fill={`url(#g${id})`} />
      <ellipse cx="0" cy="0" rx="19" ry="17" fill={`url(#l${id})`} stroke="#6a0710" />
      <path d="M-10 -14 Q-17 0 -10 14 M0 -17 V17 M10 -14 Q17 0 10 14" stroke="#7d0a0f" strokeWidth="1.2" fill="none" opacity=".6" />
      <rect x="-8" y="15" width="16" height="5" rx="1.5" fill={`url(#g${id})`} />
      <path d="M0 20 V30 M-3 21 L-4 30 M3 21 L4 30" stroke="#ffcf5a" strokeWidth="1.4" />
    </g>
  );
  return (
    <Svg>
      <defs>
        <GoldDefs id={id} />
        <radialGradient id={`l${id}`} cx="50%" cy="45%" r="60%"><stop offset="0" stopColor="#ffe08a" /><stop offset=".4" stopColor="#ff5a2a" /><stop offset="1" stopColor="#a10d12" /></radialGradient>
      </defs>
      {pair ? [one(19, .78, "a"), one(45, .78, "b")] : one(32, 1, "a")}
    </Svg>
  );
}

function Fan() {
  const id = useUid();
  const ribs = Array.from({ length: 9 }, (_, i) => {
    const t = Math.PI + (i / 8) * Math.PI;
    return <line key={i} x1="32" y1="46" x2={32 + Math.cos(t) * 26} y2={46 + Math.sin(t) * 26} stroke="#7a4708" strokeWidth="1" opacity=".7" />;
  });
  return (
    <Svg>
      <defs><GoldDefs id={id} /></defs>
      <path d="M6 46 A26 26 0 0 1 58 46 L32 46 Z" fill="#c8141e" stroke="#7a4708" strokeWidth="1.5" />
      <path d="M14 46 A18 18 0 0 1 50 46" fill="none" stroke={`url(#g${id})`} strokeWidth="4" />
      {ribs}
      <path d="M22 34 q10 -10 20 0" stroke="#ffd98a" strokeWidth="1.6" fill="none" />
      <circle cx="32" cy="46" r="3.5" fill={`url(#g${id})`} stroke="#7a4708" />
      <path d="M32 50 V60" stroke="#ffcf5a" strokeWidth="2" />
    </Svg>
  );
}

function Knot() {
  const id = useUid();
  return (
    <Svg>
      <defs><GoldDefs id={id} /></defs>
      <path d="M32 2 V8" stroke={`url(#g${id})`} strokeWidth="2" />
      <g transform="rotate(45 32 26)">
        <rect x="18" y="12" width="28" height="28" rx="4" fill="#c8141e" stroke="#6a0710" strokeWidth="1.5" />
        <path d="M18 21 H46 M18 31 H46 M27 12 V40 M37 12 V40" stroke="#ff6a4a" strokeWidth="2.2" />
        <circle cx="18" cy="12" r="3" fill="#c8141e" stroke="#6a0710" /><circle cx="46" cy="12" r="3" fill="#c8141e" stroke="#6a0710" />
        <circle cx="18" cy="40" r="3" fill="#c8141e" stroke="#6a0710" />
      </g>
      <rect x="27" y="45" width="10" height="4" rx="1" fill={`url(#g${id})`} />
      <path d="M32 49 V62 M29 50 L27 62 M35 50 L37 62" stroke="#e2381c" strokeWidth="1.8" />
    </Svg>
  );
}

function JadeDisc() {
  const id = useUid();
  return (
    <Svg>
      <defs>
        <GoldDefs id={id} />
        <radialGradient id={`j${id}`} cx="40%" cy="35%" r="70%"><stop offset="0" stopColor="#b8ffe0" /><stop offset=".55" stopColor="#2fb07a" /><stop offset="1" stopColor="#0a5034" /></radialGradient>
      </defs>
      <circle cx="32" cy="32" r="25" fill={`url(#j${id})`} stroke="#064a30" strokeWidth="1.5" />
      <circle cx="32" cy="32" r="9" fill="#06261a" stroke={`url(#g${id})`} strokeWidth="2.4" />
      {Array.from({ length: 12 }, (_, i) => { const t = (i / 12) * Math.PI * 2; return <circle key={i} cx={32 + Math.cos(t) * 17} cy={32 + Math.sin(t) * 17} r="1.8" fill="#0a5034" opacity=".7" />; })}
      <path d="M16 20 q6 -8 14 -9" stroke="#e8fff4" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity=".8" />
    </Svg>
  );
}

function Bamboo() {
  const stalk = (x: number, h: number, k: string) => (
    <g key={k}>
      <rect x={x} y={60 - h} width="9" height={h} rx="3" fill="#3fbf6a" stroke="#0a5034" strokeWidth="1.2" />
      {Array.from({ length: Math.floor(h / 13) }, (_, i) => <rect key={i} x={x - 1} y={60 - h + 11 + i * 13} width="11" height="3" rx="1.5" fill="#0f7a40" />)}
    </g>
  );
  return (
    <Svg>
      {stalk(14, 46, "a")}{stalk(28, 56, "b")}{stalk(42, 40, "c")}
      <path d="M37 14 q12 -6 20 -2 q-10 4 -20 2 Z M23 22 q-12 -6 -18 0 q10 4 18 0 Z M51 26 q8 -2 10 4 q-8 0 -10 -4 Z" fill="#7de08a" stroke="#0a5034" strokeWidth=".8" />
    </Svg>
  );
}

function Cloud() {
  const id = useUid();
  return (
    <Svg>
      <defs><GoldDefs id={id} /></defs>
      <path d="M8 42 c-6 -10 6 -18 12 -10 c2 -12 20 -12 20 0 c6 -10 20 -4 16 8 c6 2 6 12 -2 12 H12 c-6 0 -8 -6 -4 -10 Z" fill={`url(#g${id})`} stroke="#7a4708" strokeWidth="1.6" />
      <path d="M22 40 c-2 -6 6 -8 8 -3 M38 40 c-2 -6 6 -8 8 -3" stroke="#a8650c" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </Svg>
  );
}

export type SymArt = { label: string; tone: string; Svg: () => ReactNode };

/** Gilded Track — red lacquer hoard. Keys and pay order unchanged (WILD > CROWN > DIAMOND > ACE > CHIP > HORSE > LAMP > BAR). */
export const HOARD_ART = {
  WILD: { label: "WILD", tone: "rd-wild", Svg: () => <Dragon /> },
  CROWN: { label: "INGOT", tone: "rd-ingot", Svg: () => <Ingot /> },
  DIAMOND: { label: "PEARL", tone: "rd-pearl", Svg: () => <Pearl /> },
  ACE: { label: "KOI", tone: "rd-koi", Svg: Koi },
  CHIP: { label: "COIN", tone: "rd-coin", Svg: () => <Coin /> },
  HORSE: { label: "LANTERN", tone: "rd-lantern", Svg: () => <LanternSym /> },
  LAMP: { label: "FAN", tone: "rd-fan", Svg: Fan },
  BAR: { label: "KNOT", tone: "rd-knot", Svg: Knot },
} satisfies Record<string, SymArt>;

/** Canopy Spire — jade set. Keys and pay order unchanged (WILD > MONKEY > PARROT > JAGUAR > TOUCAN > BANANA > COCONUT > VINE). */
export const JADE_ART = {
  WILD: { label: "WILD", tone: "jd-wild", Svg: () => <Dragon jade /> },
  MONKEY: { label: "INGOTS", tone: "jd-ingot", Svg: () => <Ingot stack /> },
  PARROT: { label: "PEARL", tone: "jd-pearl", Svg: () => <Pearl jade /> },
  JAGUAR: { label: "LANTERNS", tone: "jd-lantern", Svg: () => <LanternSym pair /> },
  TOUCAN: { label: "COINS", tone: "jd-coin", Svg: () => <Coin stack /> },
  BANANA: { label: "JADE", tone: "jd-jade", Svg: JadeDisc },
  COCONUT: { label: "BAMBOO", tone: "jd-bamboo", Svg: Bamboo },
  VINE: { label: "CLOUD", tone: "jd-cloud", Svg: Cloud },
} satisfies Record<string, SymArt>;
