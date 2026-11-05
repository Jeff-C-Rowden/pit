/** Small original felt-and-chips thumbnail per table, in the style of the home hero. */
const chip = (x: number, y: number, c: string, k: string) => (
  <ellipse key={k} cx={x} cy={y} rx="11" ry="4" fill={c} stroke="#f7f1e3" strokeWidth="1.2" strokeDasharray="3 2.5" />
);
const card = (x: number, y: number, r: number, t: string, red: boolean, k: string) => (
  <g key={k} transform={`translate(${x} ${y}) rotate(${r})`}>
    <rect width="22" height="30" rx="3" fill="#f7f1e3" />
    <text x="3" y="12" fontSize="9" fontWeight="700" fill={red ? "#b3261e" : "#1c1c1c"}>{t}</text>
  </g>
);
export default function FeltThumb({ kind }: { kind?: string }) {
  let art: React.ReactNode = null;
  switch (kind) {
    case "bj": art = [card(62, 14, -8, "A♠", false, "a"), card(80, 12, 8, "K♥", true, "b"), chip(36, 48, "#b3261e", "c"), chip(36, 44, "#b3261e", "d")]; break;
    case "slot": art = [0, 1, 2].map((i) => (
      <g key={i}><rect x={44 + i * 26} y="12" width="22" height="32" rx="3" fill="#0b2419" stroke="#d8b25a" strokeWidth="1.2" />
      <text x={49 + i * 26} y="33" fontSize="13" fill="#d8b25a">{["7", "★", "7"][i]}</text></g>)); break;
    case "vs": case "vault": art = [<path key="p" d="M80 8 L100 46 H60 Z" fill="none" stroke="#d8b25a" strokeWidth="1.6" />, <path key="q" d="M80 18 L92 40 H68 Z" fill="#d8b25a" fillOpacity=".35" />, chip(40, 48, "#1f7a52", "c")]; break;
    case "rl": art = [<circle key="w" cx="80" cy="30" r="20" fill="#2a0f0f" stroke="#d8b25a" strokeWidth="1.6" />, <circle key="i" cx="80" cy="30" r="9" fill="none" stroke="#f7f1e3" strokeDasharray="2 3" />, <circle key="b" cx="92" cy="20" r="2.5" fill="#f7f1e3" />, chip(130, 48, "#b3261e", "c")]; break;
    case "cr": art = [0, 1].map((i) => (
      <g key={i} transform={`translate(${60 + i * 26} ${16}) rotate(${i ? 12 : -10})`}><rect width="20" height="20" rx="4" fill="#f7f1e3" />
      <circle cx="6" cy="6" r="2" fill="#b3261e" /><circle cx="14" cy="14" r="2" fill="#b3261e" />{i ? <circle cx="10" cy="10" r="2" fill="#b3261e" /> : null}</g>)); break;
    case "he": art = [card(64, 14, -6, "Q♦", true, "a"), card(84, 14, 6, "Q♣", false, "b"), chip(30, 48, "#1f4fa8", "c"), chip(130, 48, "#d8b25a", "d")]; break;
    case "pg": art = [0, 1, 2, 3, 4].map((i) => card(40 + i * 14, 14, (i - 2) * 6, ["A", "K", "Q", "J", "★"][i], i % 2 === 1, `c${i}`)); break;
  }
  const id = `ft-${kind || "x"}`;
  return (
    <svg className="felt-thumb" viewBox="0 0 160 60" aria-hidden="true">
      <defs><radialGradient id={id} cx="50%" cy="30%" r="80%"><stop offset="0" stopColor="#1f7a52" /><stop offset="1" stopColor="#0b3524" /></radialGradient></defs>
      <rect width="160" height="60" rx="10" fill={`url(#${id})`} />
      <path d="M10 56 Q80 22 150 56" fill="none" stroke="#d8b25a" strokeOpacity=".45" strokeWidth="1" />
      {art}
    </svg>
  );
}
