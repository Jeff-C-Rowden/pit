/**
 * Original western art for Pit: brass PIT medallion, antler-and-horseshoe emblem, sandbox chip
 * coin and painted-desert hero scenes. Drawn from scratch as inline SVG. Decorative only,
 * no external images, no third-party marks.
 */
import { useId, type ReactNode } from "react";

const uid = (raw: string) => raw.replace(/[^a-zA-Z0-9]/g, "");

/** Horseshoe with an antler crest. Used as the Pit emblem and as Buckshot Bars' wild. */
export function AntlerShoe({ size = 40, className = "", tone = "gold" }: { size?: number; className?: string; tone?: "gold" | "cream" }) {
  const id = uid(useId());
  const [a, b, c] = tone === "gold" ? ["#fff1a8", "#fedd52", "#b86f00"] : ["#fffdf2", "#f2e6c4", "#9c8452"];
  return (
    <svg className={`antler-shoe ${className}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`as${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={a} /><stop offset=".5" stopColor={b} /><stop offset="1" stopColor={c} /></linearGradient>
      </defs>
      <g fill="none" stroke={`url(#as${id})`} strokeLinecap="round" strokeLinejoin="round">
        {/* antler crest */}
        <path d="M24 26 C22 18 17 13 10 10 M17 14 C13 15 10 18 9 21 M20 19 C19 13 20 8 23 4" strokeWidth="3.2" />
        <path d="M40 26 C42 18 47 13 54 10 M47 14 C51 15 54 18 55 21 M44 19 C45 13 44 8 41 4" strokeWidth="3.2" />
      </g>
      {/* horseshoe */}
      <path d="M21 27 C12 36 14 54 32 58 C50 54 52 36 43 27" fill="none" stroke="#3b1608" strokeWidth="11" strokeLinecap="round" />
      <path d="M21 27 C12 36 14 54 32 58 C50 54 52 36 43 27" fill="none" stroke={`url(#as${id})`} strokeWidth="8" strokeLinecap="round" />
      {[[18.5, 38], [22, 48], [32, 53.5], [42, 48], [45.5, 38]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.5" fill="#3b1608" />)}
    </svg>
  );
}

/** Round brass PIT medallion (the Pit logo). Deliberately round, never a shield. */
export function PitMedallion({ size = 40, className = "" }: { size?: number; className?: string }) {
  const id = uid(useId());
  return (
    <svg className={`pit-logo pit-medallion ${className}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`pm${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff1a8" /><stop offset=".45" stopColor="#fedd52" /><stop offset="1" stopColor="#a35f00" /></linearGradient>
        <radialGradient id={`pr${id}`} cx="45%" cy="35%" r="70%"><stop offset="0" stopColor="#9c3835" /><stop offset="1" stopColor="#3a1010" /></radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30.5" fill={`url(#pm${id})`} stroke="#5a2a08" strokeWidth="1.2" />
      <circle cx="32" cy="32" r="25" fill={`url(#pr${id})`} stroke="#5a2a08" strokeWidth="1" />
      <circle cx="32" cy="32" r="22.5" fill="none" stroke="#fedd52" strokeWidth=".8" strokeDasharray="1.6 2.4" opacity=".75" />
      <g fill="none" stroke={`url(#pm${id})`} strokeWidth="1.8" strokeLinecap="round">
        <path d="M28 21 C26 17 23 15 19 14 M24 17 C22 17 21 19 20 20" />
        <path d="M36 21 C38 17 41 15 45 14 M40 17 C42 17 43 19 44 20" />
      </g>
      <text x="32" y="41" textAnchor="middle" fontFamily="var(--font-display), 'Passion One', Impact, sans-serif" fontSize="17" fill={`url(#pm${id})`} stroke="#3a1010" strokeWidth=".6" letterSpacing="1">PIT</text>
    </svg>
  );
}

/** Gold sandbox-chip coin with a tiny horseshoe stamp. */
export function ChipCoin({ size = 20 }: { size?: number }) {
  const id = uid(useId());
  return (
    <svg className="chip-coin" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`cc${id}`} cx="38%" cy="32%" r="70%"><stop offset="0" stopColor="#fff1a8" /><stop offset=".5" stopColor="#fedd52" /><stop offset="1" stopColor="#b86f00" /></radialGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill={`url(#cc${id})`} stroke="#7a4708" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="11" fill="none" stroke="#a8700f" strokeWidth="1" strokeDasharray="2 2" />
      <path d="M11.5 11 C8.5 15 10 22 16 23 C22 22 23.5 15 20.5 11" fill="none" stroke="#7a2a12" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

/** Painted desert backdrop: sunset sky, sun, layered mesas, saguaros. */
export function DesertScene({ className = "", children, sun = true }: { className?: string; children?: ReactNode; sun?: boolean }) {
  const id = uid(useId());
  const cactus = (x: number, y: number, s: number, k: string) => (
    <path key={k} transform={`translate(${x} ${y}) scale(${s})`} fill="#2a0e0a"
      d="M-4 0 V-46 a4 4 0 0 1 8 0 V-30 h6 V-40 a3 3 0 0 1 6 0 V-26 a4 4 0 0 1 -4 4 H4 V0 Z M-4 -22 h-6 a4 4 0 0 1 -4 -4 V-36 a3 3 0 0 1 6 0 V-28 h4 Z" />
  );
  return (
    <svg className={`desert-scene ${className}`} viewBox="0 0 600 330" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`sky${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a1424" /><stop offset=".38" stopColor="#9c3835" /><stop offset=".7" stopColor="#ef8a2a" /><stop offset="1" stopColor="#fedd52" />
        </linearGradient>
        <radialGradient id={`sun${id}`} cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#fff6c8" /><stop offset=".6" stopColor="#ffd25a" /><stop offset="1" stopColor="#ffb02a" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="600" height="330" fill={`url(#sky${id})`} />
      {sun && <circle cx="430" cy="214" r="78" fill={`url(#sun${id})`} />}
      <path d="M0 236 L60 236 L78 196 L150 196 L168 236 L330 236 L344 210 L400 210 L414 236 L600 236 V330 H0 Z" fill="#a8452a" opacity=".85" />
      <path d="M0 262 L110 262 L126 226 L230 226 L248 262 L470 262 L486 238 L560 238 L574 262 L600 262 V330 H0 Z" fill="#7a2a1c" />
      <path d="M0 290 Q150 272 300 288 T600 284 V330 H0 Z" fill="#4b1211" />
      {cactus(70, 300, 1.1, "c1")}{cactus(540, 296, .9, "c2")}{cactus(250, 304, .6, "c3")}
      {children}
    </svg>
  );
}

/** Three original hero foregrounds for the Floor carousel. */
export function HeroArt({ slide }: { slide: number }) {
  const id = uid(useId());
  const gold = `url(#hg${id})`;
  const defs = (
    <defs>
      <linearGradient id={`hg${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff1a8" /><stop offset=".5" stopColor="#fedd52" /><stop offset="1" stopColor="#b86f00" /></linearGradient>
    </defs>
  );
  if (slide === 1) {
    // a classic three-reel cabinet silhouette showing 7 · BAR · 7
    return (
      <DesertScene className="hero-scene">
        {defs}
        <g transform="translate(360 40)">
          <rect x="0" y="0" width="190" height="260" rx="16" fill="#0a2407" stroke={gold} strokeWidth="5" />
          {Array.from({ length: 12 }, (_, i) => <rect key={i} x="6" y={60 + i * 12} width="178" height="1.5" fill="#4a5747" />)}
          <rect x="16" y="14" width="158" height="34" rx="8" fill="#4b1211" stroke={gold} strokeWidth="2" />
          <text x="95" y="38" textAnchor="middle" fontFamily="var(--font-display), Impact, sans-serif" fontSize="20" fill={gold}>BUCKSHOT</text>
          {[0, 1, 2].map((r) => (
            <g key={r}>
              <rect x={18 + r * 54} y="62" width="46" height="70" rx="5" fill="#e8e8d0" stroke="#9a9a9a" strokeWidth="3" />
              <text x={41 + r * 54} y="107" textAnchor="middle" fontFamily="Impact, sans-serif" fontSize={r === 1 ? 15 : 30} fill={r === 1 ? "#242020" : "#d0201e"}>{r === 1 ? "BAR" : "7"}</text>
            </g>
          ))}
          <rect x="10" y="96" width="170" height="2" fill="#e5e4e4" />
          <rect x="20" y="146" width="70" height="16" rx="3" fill="#243460" /><rect x="100" y="146" width="70" height="16" rx="3" fill="#641714" />
          <rect x="0" y="200" width="190" height="60" rx="10" fill="#c8a868" />
          {[0, 1, 2, 3].map((k) => <rect key={k} x={14 + k * 44} y="214" width="34" height="22" rx="4" fill="#f0f0d8" stroke="#986030" strokeWidth="2" />)}
        </g>
      </DesertScene>
    );
  }
  if (slide === 2) {
    // a stack of sandbox chips with a horseshoe
    const chip = (x: number, y: number, c: string, k: string) => (
      <g key={k}>
        <ellipse cx={x} cy={y} rx="40" ry="13" fill={c} stroke="#fff3d0" strokeWidth="2" strokeDasharray="9 7" />
      </g>
    );
    return (
      <DesertScene className="hero-scene">
        {defs}
        <g transform="translate(0 0)">
          {[0, 1, 2, 3, 4, 5].map((i) => chip(430, 270 - i * 11, i % 2 ? "#9c3835" : "#4b1211", `a${i}`))}
          {[0, 1, 2, 3].map((i) => chip(512, 280 - i * 11, i % 2 ? "#0f5a32" : "#243460", `b${i}`))}
          <g transform="translate(395 70) scale(2.2)"><path d="M21 27 C12 36 14 54 32 58 C50 54 52 36 43 27" fill="none" stroke="#3b1608" strokeWidth="11" strokeLinecap="round" /><path d="M21 27 C12 36 14 54 32 58 C50 54 52 36 43 27" fill="none" stroke={gold} strokeWidth="8" strokeLinecap="round" /></g>
        </g>
      </DesertScene>
    );
  }
  // slide 0: the Pit emblem rising over the mesas
  return (
    <DesertScene className="hero-scene">
      {defs}
      <g transform="translate(372 52) scale(3.1)" opacity=".98">
        <path d="M24 26 C22 18 17 13 10 10 M17 14 C13 15 10 18 9 21 M20 19 C19 13 20 8 23 4" fill="none" stroke="#3b1608" strokeWidth="5.5" strokeLinecap="round" />
        <path d="M40 26 C42 18 47 13 54 10 M47 14 C51 15 54 18 55 21 M44 19 C45 13 44 8 41 4" fill="none" stroke="#3b1608" strokeWidth="5.5" strokeLinecap="round" />
        <path d="M24 26 C22 18 17 13 10 10 M17 14 C13 15 10 18 9 21 M20 19 C19 13 20 8 23 4" fill="none" stroke={gold} strokeWidth="3.2" strokeLinecap="round" />
        <path d="M40 26 C42 18 47 13 54 10 M47 14 C51 15 54 18 55 21 M44 19 C45 13 44 8 41 4" fill="none" stroke={gold} strokeWidth="3.2" strokeLinecap="round" />
        <path d="M21 27 C12 36 14 54 32 58 C50 54 52 36 43 27" fill="none" stroke="#3b1608" strokeWidth="11" strokeLinecap="round" />
        <path d="M21 27 C12 36 14 54 32 58 C50 54 52 36 43 27" fill="none" stroke={gold} strokeWidth="8" strokeLinecap="round" />
      </g>
    </DesertScene>
  );
}
