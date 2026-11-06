/** Original inline SVG banner art per Floor lobby table. No external images, no brands, decorative only. */
import type { ReactNode } from "react";

export const GAME_ART_KINDS = ["bj", "slot", "vault", "he", "rl", "cr", "pg"] as const;

const GOLD = "#d8b25a", CREAM = "#f7f1e3", RED = "#b3261e", INK = "#1c1c1c";

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
    case "slot": return { bg: ["#4a3410", "#1a1206"], body: [
      reels(["7", "◆", "7"], "#2a1c08", "#120c04", GOLD, "r"),
      <circle key="l1" cx="40" cy="30" r="3" fill={GOLD} />, <circle key="l2" cx="280" cy="30" r="3" fill={GOLD} />] };
    case "vault": return { bg: ["#1d5a34", "#071a10"], body: [
      <path key="leaf1" d="M0 0 Q40 40 10 80 Q30 30 0 0Z" fill="#2f8f4e" opacity=".7" />,
      <path key="leaf2" d="M320 0 Q280 44 312 90 Q290 34 320 0Z" fill="#2f8f4e" opacity=".7" />,
      <path key="spire" d="M160 6 L172 18 H148 Z" fill={GOLD} />,
      reels(["❦", "▲", "❦"], "#0e2a18", "#06150c", "#9fe0a8", "r")] };
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

export default function GameArt({ kind }: { kind?: string }) {
  const k = kind || "x";
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
