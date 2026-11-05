type C = { id: string; rank: string; suit: string; joker?: boolean; red?: boolean };

export default function PlayingCard({ card, size = "md" }: { card: C; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? " sm" : size === "lg" ? " lg" : "";
  if (card.id === "??" || card.rank === "?") {
    return (
      <div className={`pcard back${sz}`} aria-label="Face-down card">
        <svg className="pback-art" viewBox="0 0 60 88" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <pattern id="pbLattice" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="8" height="8" fill="#5a111b" /><path d="M0 0H8M0 0V8" stroke="#c9a227" strokeOpacity=".35" strokeWidth="1" />
            </pattern>
            <radialGradient id="pbGlow" cx="50%" cy="50%" r="55%"><stop offset="0" stopColor="#8e1f2c" /><stop offset="1" stopColor="#3a0a11" /></radialGradient>
          </defs>
          <rect x="0" y="0" width="60" height="88" fill="url(#pbGlow)" />
          <rect x="4" y="4" width="52" height="80" rx="3" fill="url(#pbLattice)" stroke="#e6c76a" strokeWidth="1.2" />
          <rect x="7" y="7" width="46" height="74" rx="2" fill="none" stroke="#e6c76a" strokeOpacity=".45" strokeWidth=".6" />
          <path d="M30 26 L42 44 L30 62 L18 44 Z" fill="#2a070c" stroke="#f0d688" strokeWidth="1.2" />
          <circle cx="30" cy="44" r="7.5" fill="#c9a227" stroke="#fff1c2" strokeWidth=".8" />
          <text x="30" y="47.6" textAnchor="middle" fontSize="9.5" fontFamily="Georgia, serif" fontWeight="700" fill="#3a0a11">P</text>
          {[[12, 14], [48, 14], [12, 74], [48, 74]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.6" fill="#f0d688" />)}
        </svg>
      </div>
    );
  }
  const glyph = card.joker ? "★" : card.suit === "s" ? "♠" : card.suit === "h" ? "♥" : card.suit === "d" ? "♦" : "♣";
  const label = card.joker ? "JK" : card.rank;
  return (
    <div className={`pcard${sz} ${card.red || card.suit === "h" || card.suit === "d" ? "red" : ""}`}>
      <div className="cr">{label}{glyph}</div>
      <div className="cs">{glyph}</div>
      <div className="cr" style={{ transform: "rotate(180deg)" }}>{label}{glyph}</div>
    </div>
  );
}
