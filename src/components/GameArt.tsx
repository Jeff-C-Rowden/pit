/** Original inline SVG banner art per Floor lobby table. No external images, no brands, decorative only. */
import type { ReactNode } from "react";

export const GAME_ART_KINDS = ["bb", "bj", "slot", "vault", "he", "rl", "cr", "pg"] as const;

const GOLD = "#fedd52", CREAM = "#f7f1e3", RED = "#b3261e", INK = "#1c1c1c";

const card = (x: number, y: number, r: number, t: string, s: string, red: boolean, k: string) => (
  <g key={k} transform={`translate(${x} ${y}) rotate(${r})`}>
    <rect width="34" height="48" rx="4" fill={CREAM} stroke="rgba(0,0,0,.25)" />
    <text x="5" y="15" fontSize="12" fontWeight="700" fill={red ? RED : INK}>{t}</text>
    <text x="17" y="36" fontSize="16" textAnchor="middle" fill={red ? RED : INK}>{s}</text>
  </g>
);
const stack = (x: number, y: number, n: number, c: string, k: string) => (
  <g key={k}>{Array.from({ length: n }, (_, i) => (
    <ellipse key={i} cx={x} cy={y - i * 4} rx="14" ry="5" fill={c} stroke={CREAM} strokeWidth="1.4" strokeDasharray="4 3" />
  ))}</g>
);
const reels = (syms: string[], frame: string, bg: string, fg: string, k: string) => (
  <g key={k}>
    <rect x="70" y="18" width="180" height="76" rx="12" fill={frame} stroke={GOLD} strokeWidth="2" />
    {syms.map((s, i) => (
      <g key={i}>
        <rect x={80 + i * 56} y="26" width="48" height="60" rx="6" fill={bg} stroke={GOLD} strokeOpacity=".6" />
        <text x={104 + i * 56} y="66" fontSize="26" fontWeight="700" textAnchor="middle" fill={fg}>{s}</text>
      </g>
    ))}
    <line x1="74" y1="56" x2="246" y2="56" stroke={GOLD} strokeOpacity=".35" strokeDasharray="3 4" />
  </g>
);

function art(kind: string): { bg: [string, string]; body: ReactNode } {
  switch (kind) {
    case "bj": return { bg: ["#1f7a52", "#0b3524"], body: [
      <path key="arc" d="M30 110 Q160 30 290 110" fill="none" stroke={GOLD} strokeOpacity=".5" />,
      card(128, 30, -10, "A", "♠", false, "a"), card(160, 26, 8, "K", "♥", true, "b"),
      stack(70, 92, 4, RED, "s1"), stack(250, 92, 3, "#1f4fa8", "s2")] };
    case "bb": return { bg: ["#0f3a14", "#05140a"], body: [
      reels(["7", "BAR", "7"], "#0a2407", "#efeedb", "#c0201e", "r"),
      <path key="pl" d="M60 56 l10 -6 v12z" fill="#3474c0" />] };
    case "slot": return { bg: ["#7a2a1c", "#2a0e0a"], body: [
      <circle key="sun" cx="160" cy="92" r="40" fill="#ffb02a" opacity=".55" />,
      reels(["★", "7", "★"], "#4b1211", "#1a0806", GOLD, "r"),
      <path key="m1" d="M0 120 L40 96 L70 120Z M250 120 L290 92 L320 120Z" fill="#4b1211" />] };
    case "vault": return { bg: ["#1d4a2a", "#071a10"], body: [
      <path key="antL" d="M120 14 C112 6 102 4 92 6 M108 9 C104 4 104 0 106 -4" stroke={GOLD} strokeWidth="3" fill="none" strokeLinecap="round" />,
      <path key="antR" d="M200 14 C208 6 218 4 228 6 M212 9 C216 4 216 0 214 -4" stroke={GOLD} strokeWidth="3" fill="none" strokeLinecap="round" />,
      <path key="spire" d="M160 4 L172 16 H148 Z" fill={GOLD} />,
      reels(["▲", "◆", "▲"], "#0e2a18", "#06150c", "#fedd52", "r")] };
    case "he": return { bg: ["#1f5a7a", "#0b2435"], body: [
      <ellipse key="o" cx="160" cy="62" rx="120" ry="40" fill="none" stroke={GOLD} strokeOpacity=".55" strokeWidth="2" />,
      card(130, 34, -6, "Q", "♦", true, "a"), card(158, 34, 6, "Q", "♣", false, "b"),
      stack(60, 96, 3, GOLD, "s1"), stack(262, 96, 4, "#1f4fa8", "s2")] };
    case "rl": {
      const pockets = Array.from({ length: 19 }, (_, i) => {
        const a1 = (i / 19) * Math.PI * 2, a2 = ((i + 0.5) / 19) * Math.PI * 2;
        const p = (a: number, r: number) => `${(160 + Math.cos(a) * r).toFixed(1)} ${(60 + Math.sin(a) * r).toFixed(1)}`;
        return <path key={i} d={`M160 60 L${p(a1, 44)} A44 44 0 0 1 ${p(a2, 44)} Z`} fill={i === 0 ? "#1f7a52" : RED} />;
      });
      return { bg: ["#5a1414", "#1a0606"], body: [
        <circle key="rim" cx="160" cy="60" r="50" fill="#3a2408" stroke={GOLD} strokeWidth="3" />,
        <circle key="base" cx="160" cy="60" r="44" fill={INK} />, ...pockets,
        <circle key="hub" cx="160" cy="60" r="16" fill="#3a2408" stroke={GOLD} strokeWidth="2" />,
        <path key="x" d="M160 48 V72 M148 60 H172" stroke={GOLD} strokeWidth="2" />,
        <circle key="ball" cx="196" cy="34" r="4" fill={CREAM} />,
        stack(60, 96, 3, RED, "s1"), stack(262, 96, 2, CREAM, "s2")] };
    }
    case "cr": {
      const die = (x: number, r: number, pips: [number, number][], k: string) => (
        <g key={k} transform={`translate(${x} 34) rotate(${r})`}>
          <rect width="40" height="40" rx="7" fill={CREAM} stroke="rgba(0,0,0,.25)" />
          {pips.map(([a, b], i) => <circle key={i} cx={a} cy={b} r="4" fill={RED} />)}
        </g>
      );
      return { bg: ["#1f7a52", "#0b3524"], body: [
        <rect key="rail" x="20" y="14" width="280" height="92" rx="16" fill="none" stroke={GOLD} strokeOpacity=".5" strokeWidth="2" />,
        <text key="pass" x="40" y="98" fontSize="11" fill={CREAM} opacity=".6" letterSpacing="2">PASS LINE</text>,
        die(118, -12, [[10, 10], [30, 30]], "d1"), die(170, 14, [[10, 10], [20, 20], [30, 30]], "d2"),
        stack(262, 92, 3, RED, "s")] };
    }
    case "pg": return { bg: ["#4a1f5a", "#1a0a24"], body: [
      ...["A", "K", "Q", "J", "10"].map((t, i) => card(92 + i * 26, 30 + Math.abs(i - 2) * 4, (i - 2) * 8, t, ["♠", "♥", "♣", "♦", "♠"][i], i % 2 === 1, `c${i}`)),
      stack(50, 96, 3, GOLD, "s")] };
    default: return { bg: ["#1f7a52", "#0b3524"], body: null };
  }
}

const TILE_BG: Record<string, [string, string]> = {
  bb: ["#2a7a3a", "#06200c"], bj: ["#9c3835", "#2a0a0a"], slot: ["#ef8a2a", "#4b1211"], vault: ["#2f7a4a", "#0a2414"],
  he: ["#6a3a8a", "#1e0628"], rl: ["#c0392b", "#2a0606"], cr: ["#1f7a52", "#05261a"], pg: ["#2a4fb0", "#0a0e3a"],
};

/** Landscape 4:3 lobby tile: sunset wash, mesa skyline, then the game's own art. */
function Tile({ kind }: { kind: string }) {
  const { body } = art(kind);
  const [a, b] = TILE_BG[kind] ?? TILE_BG.bj!;
  const id = `gt-${kind}`;
  return (
    <svg className={`game-art game-tile-art game-art-${kind}`} data-art={kind} data-variant="tile" viewBox="0 0 240 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={id} cx="50%" cy="30%" r="85%"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></radialGradient>
      </defs>
      <rect width="240" height="180" fill={`url(#${id})`} />
      <path d="M0 150 L30 150 L40 130 L80 130 L90 150 L160 150 L168 136 L200 136 L208 150 L240 150 V180 H0 Z" fill="#000" opacity=".28" />
      <path d="M0 164 Q120 150 240 164 V180 H0 Z" fill="#000" opacity=".35" />
      <g transform="translate(-11 34) scale(.82)">{body}</g>
    </svg>
  );
}

export default function GameArt({ kind, variant = "banner" }: { kind?: string; variant?: "banner" | "tile" }) {
  const k = kind || "x";
  if (variant === "tile") return <Tile kind={k} />;
  const { bg, body } = art(k);
  const id = `ga-${k}`;
  return (
    <svg className={`game-art game-art-${k}`} data-art={k} viewBox="0 0 320 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs><radialGradient id={id} cx="50%" cy="35%" r="80%"><stop offset="0" stopColor={bg[0]} /><stop offset="1" stopColor={bg[1]} /></radialGradient></defs>
      <rect width="320" height="120" fill={`url(#${id})`} />
      {body}
    </svg>
  );
}
