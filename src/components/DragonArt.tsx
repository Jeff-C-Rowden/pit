/** Original inline SVG dragon, lantern and coin art for the red-and-gold lobby. Decorative only, no external images. */
import { useId } from "react";

const uid = (raw: string) => raw.replace(/[^a-zA-Z0-9]/g, "");

export function CoinIcon({ size = 20 }: { size?: number }) {
  const id = uid(useId());
  return (
    <svg className="rd-coin" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`c${id}`} cx="38%" cy="32%" r="70%"><stop offset="0" stopColor="#fff6c4" /><stop offset=".45" stopColor="#f6c84a" /><stop offset="1" stopColor="#a86a0c" /></radialGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill={`url(#c${id})`} stroke="#7a4708" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="11" fill="none" stroke="#a8700f" strokeWidth="1" opacity=".8" />
      <rect x="12.5" y="12.5" width="7" height="7" rx="1" fill="#7a1010" stroke="#7a4708" />
      <path d="M8 10 q2 -3 5 -3" stroke="#fffbe0" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".85" />
    </svg>
  );
}

export function Lantern({ x, y, s = 1, className = "" }: { x: number; y: number; s?: number; className?: string }) {
  const id = uid(useId());
  return (
    <g className={`rd-lantern ${className}`} transform={`translate(${x} ${y}) scale(${s})`}>
      <defs>
        <radialGradient id={`l${id}`} cx="50%" cy="45%" r="60%"><stop offset="0" stopColor="#ffd27a" /><stop offset=".35" stopColor="#ff5a2a" /><stop offset="1" stopColor="#a10d12" /></radialGradient>
      </defs>
      <line x1="0" y1="-40" x2="0" y2="-20" stroke="#e7b84a" strokeWidth="1.2" />
      <rect x="-7" y="-21" width="14" height="5" rx="1.5" fill="#e7b84a" />
      <ellipse cx="0" cy="0" rx="17" ry="17" fill={`url(#l${id})`} />
      <path d="M-9 -14 Q-15 0 -9 14 M0 -17 V17 M9 -14 Q15 0 9 14" stroke="#7d0a0f" strokeWidth="1" fill="none" opacity=".55" />
      <rect x="-7" y="15" width="14" height="5" rx="1.5" fill="#e7b84a" />
      <path d="M0 20 V34 M-3 22 L-4 34 M3 22 L4 34" stroke="#ffcf5a" strokeWidth="1.2" />
    </g>
  );
}

/** Serpentine eastern dragon chasing a flaming pearl, among gold clouds. */
export function DragonHero({ className = "" }: { className?: string }) {
  const id = uid(useId());
  const body = "M204 64 C236 86 252 128 218 148 C182 168 142 118 106 140 C72 160 86 198 44 205 C28 208 14 201 6 192";
  return (
    <svg className={`rd-dragon ${className}`} viewBox="0 0 300 230" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`b${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff4a2a" /><stop offset=".5" stopColor="#d3121c" /><stop offset="1" stopColor="#7d0710" /></linearGradient>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff3b0" /><stop offset=".5" stopColor="#f5c542" /><stop offset="1" stopColor="#b8750f" /></linearGradient>
        <radialGradient id={`p${id}`} cx="40%" cy="35%" r="65%"><stop offset="0" stopColor="#ffffff" /><stop offset=".35" stopColor="#ffe08a" /><stop offset="1" stopColor="#ff7a1a" /></radialGradient>
        <radialGradient id={`h${id}`} cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#ffb54a" stopOpacity=".55" /><stop offset="1" stopColor="#ff5a1a" stopOpacity="0" /></radialGradient>
      </defs>
      {/* pearl halo + pearl */}
      <circle cx="112" cy="50" r="44" fill={`url(#h${id})`} className="rd-pearl-halo" />
      <path d="M96 66 C86 52 98 40 92 28 C104 34 104 22 112 18 C114 28 126 26 124 40 C134 38 132 54 128 64 Z" fill="#ff8a2a" opacity=".85" className="rd-flame" />
      <circle cx="112" cy="50" r="15" fill={`url(#p${id})`} stroke="#ffe08a" strokeWidth="1.5" />
      {/* clouds */}
      <g fill="none" stroke={`url(#g${id})`} strokeWidth="2.4" strokeLinecap="round" opacity=".9">
        <path d="M150 214 c-10 -14 10 -24 18 -12 c4 -14 26 -12 24 4 c14 -6 24 8 14 16" />
        <path d="M168 210 c-2 -6 6 -8 8 -3" />
        <path d="M232 196 c-8 -12 8 -20 14 -10 c4 -10 20 -8 18 4 c10 -2 16 8 8 14" />
        <path d="M60 116 c-8 -12 8 -20 14 -10 c4 -10 20 -8 18 4" opacity=".6" />
      </g>
      {/* body: outline, scales, belly, spines */}
      <path d={body} fill="none" stroke="#3a0306" strokeWidth="30" strokeLinecap="round" />
      <path d={body} fill="none" stroke={`url(#b${id})`} strokeWidth="25" strokeLinecap="round" />
      <path d={body} fill="none" stroke="#8a0a12" strokeWidth="19" strokeDasharray="3 7" strokeLinecap="round" opacity=".7" />
      <path d={body} fill="none" stroke={`url(#g${id})`} strokeWidth="7" strokeDasharray="10 4" transform="translate(3 8)" opacity=".95" />
      <path d={body} fill="none" stroke={`url(#g${id})`} strokeWidth="6" strokeDasharray="2 9" strokeLinecap="round" transform="translate(-3 -13)" />
      {/* tail flame */}
      <path d="M8 192 C-2 180 6 168 0 156 C12 164 16 154 24 150 C20 166 30 176 18 194 Z" fill="#ff8a2a" className="rd-flame" />
      {/* foreleg + claws */}
      <path d="M226 128 C242 140 250 152 262 150" stroke="#3a0306" strokeWidth="11" fill="none" strokeLinecap="round" />
      <path d="M226 128 C242 140 250 152 262 150" stroke={`url(#b${id})`} strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M262 150 l9 -6 M263 151 l10 2 M261 152 l6 9" stroke={`url(#g${id})`} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M120 142 C112 160 118 170 106 176" stroke="#3a0306" strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d="M120 142 C112 160 118 170 106 176" stroke={`url(#b${id})`} strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M106 176 l-9 -3 M105 177 l-7 7 M107 178 l1 9" stroke={`url(#g${id})`} strokeWidth="2.4" strokeLinecap="round" />
      {/* head */}
      <g transform="translate(200 56)">
        <path d="M8 4 C26 -2 36 12 50 6 C40 20 28 24 14 18 Z" fill="#ff8a2a" className="rd-flame" />
        <path d="M6 12 C22 16 30 30 44 30 C30 38 18 34 8 24 Z" fill="#ffb03a" className="rd-flame" />
        <path d="M2 -4 C14 -26 30 -32 46 -30 C32 -24 20 -14 10 -2 Z" fill={`url(#g${id})`} stroke="#7a4708" strokeWidth=".8" />
        <path d="M-4 -8 C2 -30 14 -42 28 -46 C18 -36 10 -22 4 -6 Z" fill={`url(#g${id})`} stroke="#7a4708" strokeWidth=".8" />
        <path d="M0 0 C-10 -14 -34 -16 -48 -8 L-64 -4 C-71 -2 -71 6 -64 8 L-44 10 C-36 12 -24 12 -14 16 C-2 22 12 16 14 4 C15 -6 8 -4 0 0 Z" fill={`url(#b${id})`} stroke="#3a0306" strokeWidth="2" />
        <path d="M-46 14 C-40 23 -26 27 -10 22 L-6 17 C-20 20 -34 18 -46 14 Z" fill="#7d0710" stroke="#3a0306" strokeWidth="1.5" />
        <path d="M-42 12 l2 5 l2 -5 M-34 13 l2 5 l2 -5 M-26 14 l2 4 l2 -4" fill="#fff8e6" />
        <path d="M-34 -10 Q-22 -17 -10 -10" stroke={`url(#g${id})`} strokeWidth="3" fill="none" strokeLinecap="round" />
        <ellipse cx="-22" cy="-3" rx="6" ry="4" fill="#ffe27a" stroke="#3a0306" strokeWidth="1" />
        <ellipse cx="-22" cy="-3" rx="1.5" ry="3.5" fill="#1a0303" />
        <circle cx="-58" cy="0" r="1.7" fill="#3a0306" />
        <path d="M-50 -6 Q-40 -10 -30 -8" stroke="#ffb03a" strokeWidth="1.2" fill="none" opacity=".8" />
        <path d="M-62 6 C-80 14 -92 34 -84 52" stroke={`url(#g${id})`} strokeWidth="1.8" fill="none" strokeLinecap="round" className="rd-whisker" />
        <path d="M-58 10 C-70 28 -66 44 -78 62" stroke={`url(#g${id})`} strokeWidth="1.4" fill="none" strokeLinecap="round" className="rd-whisker" />
      </g>
    </svg>
  );
}
