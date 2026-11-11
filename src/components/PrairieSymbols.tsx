"use client";
/**
 * Original reel art for Thunderhoof Prairie (inline SVG, no external images or brands).
 * Symbol keys, strips and pays live in src/lib/games/prairie.ts.
 */
import { useId, type ReactNode } from "react";
import type { PrSymbol } from "@/lib/games/prairie";

const useUid = () => useId().replace(/[^a-zA-Z0-9]/g, "");
const Svg = ({ children }: { children: ReactNode }) => <svg viewBox="0 0 64 64" className="sym-svg" aria-hidden>{children}</svg>;
const INK = "#1e1208";

function GoldGrad({ id }: { id: string }) {
  return <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff1a8" /><stop offset=".5" stopColor="#fedd52" /><stop offset="1" stopColor="#b86f00" /></linearGradient>;
}

/** WILD: a setting sun over the grass, stamped WILD. In free spins it carries a 2x / 3x badge. */
function WildArt({ mult }: { mult?: 2 | 3 }) {
  const id = useUid();
  return (
    <Svg>
      <defs>
        <linearGradient id={`s${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffb347" /><stop offset="1" stopColor="#c2341c" /></linearGradient>
        <GoldGrad id={id} />
      </defs>
      <rect x="4" y="6" width="56" height="52" rx="10" fill={`url(#s${id})`} stroke={INK} strokeWidth="2.2" />
      <circle cx="32" cy="34" r="14" fill="#fff1a8" opacity=".95" />
      {[-60, -30, 0, 30, 60].map((a) => <path key={a} d="M32 16 V10" stroke="#fff1a8" strokeWidth="2.4" strokeLinecap="round" transform={`rotate(${a} 32 34)`} />)}
      <path d="M4 42 C14 38 22 44 32 40 C42 36 50 42 60 38 V48 C60 54 56 58 50 58 H14 C8 58 4 54 4 48 Z" fill="#6a7a2a" stroke={INK} strokeWidth="2" />
      <rect x="10" y="44" width="44" height="12" rx="4" fill={`url(#g${id})`} stroke={INK} strokeWidth="1.8" />
      <text x="32" y="54" textAnchor="middle" fontSize="10.5" fontWeight="900" fill={INK} fontFamily="var(--st-display, Impact), sans-serif" letterSpacing=".5">WILD</text>
      {mult && (
        <g>
          <circle cx="50" cy="14" r="11" fill="#2a0a3a" stroke="#fedd52" strokeWidth="2.4" />
          <text x="50" y="18.5" textAnchor="middle" fontSize="12" fontWeight="900" fill="#fedd52" fontFamily="var(--st-display, Impact), sans-serif">{mult}×</text>
        </g>
      )}
    </Svg>
  );
}
export const PrWild = () => <WildArt />;
export const PrWild2 = () => <WildArt mult={2} />;
export const PrWild3 = () => <WildArt mult={3} />;

/** Scatter: a thunderhead with a lightning fork. */
export function Storm() {
  const id = useUid();
  return (
    <Svg>
      <defs><linearGradient id={`c${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c9d2e6" /><stop offset="1" stopColor="#4a5474" /></linearGradient></defs>
      <path d="M12 34 C4 34 4 22 13 22 C14 12 26 8 32 15 C38 6 54 10 52 22 C61 22 61 34 52 34 Z" fill={`url(#c${id})`} stroke={INK} strokeWidth="2.2" />
      <path d="M33 30 L24 46 H32 L27 60 L42 40 H34 L39 30 Z" fill="#fedd52" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path d="M14 40 l-3 8 M48 40 l-3 8 M20 44 l-2 6" stroke="#9cc4e4" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

/** Coin: a gold coin with a bison in profile. Its value is printed by the cabinet. */
export function PrairieCoin() {
  const id = useUid();
  return (
    <Svg>
      <defs><GoldGrad id={id} /></defs>
      <circle cx="32" cy="32" r="26" fill={`url(#g${id})`} stroke={INK} strokeWidth="2.4" />
      <circle cx="32" cy="32" r="20" fill="none" stroke="#b86f00" strokeWidth="1.6" strokeDasharray="2 2.4" />
      <path d="M17 38 C17 30 21 25 28 25 C30 21 36 20 40 23 C44 22 47 25 47 30 L48 36 C46 37 45 36 44 35 L43 40 H40 L39 36 H28 L27 40 H24 L23 36 C20 37 18 38 17 38 Z" fill="#7a4a12" opacity=".85" />
    </Svg>
  );
}

/** Buffalo: the herd bull, head-on. */
export function Buffalo() {
  return (
    <Svg>
      <path d="M8 22 C4 16 6 10 12 10 C10 16 14 20 18 20 M56 22 C60 16 58 10 52 10 C54 16 50 20 46 20" stroke="#e8dcc0" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M12 26 C12 14 22 10 32 10 C42 10 52 14 52 26 C56 30 54 38 48 40 C46 50 40 58 32 58 C24 58 18 50 16 40 C10 38 8 30 12 26 Z" fill="#5a341a" stroke={INK} strokeWidth="2.2" />
      <path d="M18 18 C22 12 42 12 46 18 C42 16 22 16 18 18 Z" fill="#3a200e" />
      <ellipse cx="32" cy="48" rx="10" ry="7" fill="#3a200e" stroke={INK} strokeWidth="1.6" />
      <circle cx="28" cy="48" r="1.8" fill="#0e0804" /><circle cx="36" cy="48" r="1.8" fill="#0e0804" />
      <circle cx="23" cy="32" r="3" fill="#fff" /><circle cx="41" cy="32" r="3" fill="#fff" />
      <circle cx="23.6" cy="32.4" r="1.7" fill="#0e0804" /><circle cx="41.6" cy="32.4" r="1.7" fill="#0e0804" />
      <path d="M26 56 C28 62 36 62 38 56" fill="#3a200e" stroke={INK} strokeWidth="1.6" />
    </Svg>
  );
}

/** Eagle: head and shoulders in profile. */
export function Eagle() {
  return (
    <Svg>
      <path d="M8 58 C10 42 20 34 30 32 L52 40 C48 50 40 58 30 60 Z" fill="#5a341a" stroke={INK} strokeWidth="2.2" />
      <path d="M22 36 C18 22 26 8 40 8 C50 8 56 14 56 22 L48 26 C44 32 34 36 22 36 Z" fill="#f7f1e3" stroke={INK} strokeWidth="2.2" />
      <path d="M48 18 C54 16 60 20 60 26 C58 24 54 24 50 26 Z" fill="#fedd52" stroke={INK} strokeWidth="1.8" />
      <circle cx="44" cy="17" r="2.4" fill={INK} />
      <path d="M38 13 L48 14" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <path d="M16 48 l8 -4 M18 54 l9 -4 M26 58 l8 -5" stroke="#3a200e" strokeWidth="2" />
    </Svg>
  );
}

/** Coyote: howling at the moon. */
export function Coyote() {
  return (
    <Svg>
      <circle cx="46" cy="16" r="10" fill="#fff6c8" stroke={INK} strokeWidth="1.8" />
      <path d="M14 60 C12 46 16 36 22 30 L20 18 L28 26 C32 24 36 20 40 12 C42 18 40 24 36 30 C40 36 42 48 40 60 Z" fill="#b88a5a" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M22 40 C26 44 30 52 30 60" stroke="#8a5a2a" strokeWidth="2" fill="none" />
      <circle cx="31" cy="24" r="1.8" fill={INK} />
      <path d="M38 14 l2 -4" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

/** Boots: a pair of stitched riding boots. */
export function Boots() {
  return (
    <Svg>
      {[0, 18].map((dx) => (
        <g key={dx} transform={`translate(${dx} ${dx ? 2 : 0})`}>
          <path d="M10 8 H26 L26 40 C26 44 30 46 36 48 C40 50 40 58 34 58 H8 L10 44 Z" fill="#8a3a1a" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <path d="M12 14 C16 22 20 22 24 14 M12 24 C16 32 20 32 24 24" stroke="#fedd52" strokeWidth="1.6" fill="none" />
          <rect x="8" y="54" width="8" height="5" fill="#3a200e" />
        </g>
      ))}
    </Svg>
  );
}

const LETTER_TONE: Record<string, [string, string]> = { A: ["#c2341c", "#6a1208"], K: ["#2f6a9a", "#0e2a46"], Q: ["#6a8a2a", "#22340a"], J: ["#8a4ab8", "#2a0e46"] };
function Letter({ ch }: { ch: "A" | "K" | "Q" | "J" }) {
  const id = useUid();
  const [hi, lo] = LETTER_TONE[ch]!;
  return (
    <Svg>
      <defs><linearGradient id={`l${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={hi} /><stop offset="1" stopColor={lo} /></linearGradient></defs>
      <text x="32" y="50" textAnchor="middle" fontSize="46" fontWeight="900" fill={`url(#l${id})`} stroke={INK} strokeWidth="2" paintOrder="stroke" fontFamily="var(--st-display, Impact), Georgia, serif">{ch}</text>
      <path d="M14 56 H50" stroke="#b88a5a" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M10 56 l-4 -3 M10 56 l-4 3 M54 56 l4 -3 M54 56 l4 3" stroke="#b88a5a" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

export type PrArtMeta = { label: string; tone: string; Svg: () => ReactNode };

export const PRAIRIE_ART: Record<PrSymbol, PrArtMeta> = {
  WILD: { label: "Wild", tone: "pr-wild", Svg: PrWild },
  W2: { label: "Wild 2×", tone: "pr-wild", Svg: PrWild2 },
  W3: { label: "Wild 3×", tone: "pr-wild", Svg: PrWild3 },
  STORM: { label: "Storm", tone: "pr-storm", Svg: Storm },
  COIN: { label: "Coin", tone: "pr-coin", Svg: PrairieCoin },
  BUFFALO: { label: "Buffalo", tone: "pr-buffalo", Svg: Buffalo },
  EAGLE: { label: "Eagle", tone: "pr-eagle", Svg: Eagle },
  COYOTE: { label: "Coyote", tone: "pr-coyote", Svg: Coyote },
  BOOTS: { label: "Boots", tone: "pr-boots", Svg: Boots },
  A: { label: "A", tone: "pr-letter", Svg: () => <Letter ch="A" /> },
  K: { label: "K", tone: "pr-letter", Svg: () => <Letter ch="K" /> },
  Q: { label: "Q", tone: "pr-letter", Svg: () => <Letter ch="Q" /> },
  J: { label: "J", tone: "pr-letter", Svg: () => <Letter ch="J" /> },
};

/** Ada Thornbury, storm-chasing ranch hand, with her spyglass and wide hat. */
export function AdaPortrait({ size = 120 }: { size?: number }) {
  const id = useUid();
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden className="pr-ada">
      <defs>
        <GoldGrad id={id} />
        <linearGradient id={`sky${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3a2a5a" /><stop offset=".6" stopColor="#c2541c" /><stop offset="1" stopColor="#ffb347" /></linearGradient>
        <clipPath id={`cl${id}`}><circle cx="60" cy="60" r="56" /></clipPath>
      </defs>
      <circle cx="60" cy="60" r="58" fill={`url(#sky${id})`} stroke={`url(#g${id})`} strokeWidth="4" />
      <g clipPath={`url(#cl${id})`}>
        <path d="M8 26 C4 26 4 18 10 18 C12 10 22 10 26 14 C30 8 42 10 40 18 C46 18 46 26 40 26 Z" fill="#6a6a8a" opacity=".9" />
        <path d="M24 26 L20 36 H24 L21 44 L30 32 H25 L28 26 Z" fill="#fedd52" />
        <path d="M0 96 C20 90 40 94 60 92 C80 90 100 94 120 92 V120 H0 Z" fill="#6a7a2a" />
        <path d="M84 92 C84 86 88 82 94 82 C96 79 100 79 102 81 C105 80 108 82 108 86 L109 92 Z" fill="#3a200e" />
        <path d="M24 120 C26 98 42 90 60 90 C78 90 94 98 96 120 Z" fill="#2f6a9a" stroke={INK} strokeWidth="2" />
        <path d="M48 92 L60 106 L72 92" fill="#c2341c" stroke={INK} strokeWidth="2" />
      </g>
      <ellipse cx="60" cy="64" rx="19" ry="22" fill="#d9a77a" stroke={INK} strokeWidth="2" />
      <path d="M42 64 C38 78 44 88 50 88 M78 64 C82 78 76 88 70 88" stroke="#3a200e" strokeWidth="6" strokeLinecap="round" fill="none" />
      <circle cx="52" cy="64" r="2.6" fill={INK} /><circle cx="68" cy="64" r="2.6" fill={INK} />
      <path d="M48 58 l7 -1 M65 57 l7 1" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <path d="M52 76 C56 80 64 80 68 76" stroke={INK} strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M20 50 C30 46 90 46 100 50 C96 54 24 54 20 50 Z" fill="#7a4a1a" stroke={INK} strokeWidth="2" />
      <path d="M40 48 C40 32 50 28 60 28 C70 28 80 32 80 48 Z" fill="#8a5a2a" stroke={INK} strokeWidth="2.2" />
      <path d="M41 44 H79" stroke="#c2341c" strokeWidth="3" />
      <g transform="translate(80 96) rotate(-30)">
        <rect x="0" y="-4" width="26" height="8" rx="2" fill={`url(#g${id})`} stroke={INK} strokeWidth="1.6" />
        <rect x="-6" y="-5" width="7" height="10" rx="2" fill="#3a200e" stroke={INK} strokeWidth="1.4" />
      </g>
    </svg>
  );
}
