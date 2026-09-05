type C = { id: string; rank: string; suit: string; joker?: boolean; red?: boolean };

export default function PlayingCard({ card, size = "md" }: { card: C; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? " sm" : size === "lg" ? " lg" : "";
  if (card.id === "??" || card.rank === "?") {
    return (
      <div className={`pcard back${sz}`}>
        <div>PIT</div>
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
