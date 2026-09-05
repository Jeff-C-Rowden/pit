"use client";
import Link from "next/link";
import Shell from "@/components/Shell";

const GAMES = [
  { href: "/blackjack", name: "Blackjack", meta: "7-spot · six-deck · S17 · BJ 3:2", line: "The pit staple.", seats: "7-spot" },
  { href: "/slot", name: "Gilded Track", meta: "5 reels · 9 lines · published 94–96% RTP", line: "A video slot with a real paytable." },
  { href: "/holdem", name: "Texas Hold'em", meta: "$1 / $2 NL · 8-max felt", line: "Sit down. Bots take the other chairs. House banks.", cash: true, taken: 5, max: 8, stakes: "$1 / $2 NL" },
  { href: "/roulette", name: "Roulette", meta: "American wheel · 0 and 00 · inside & outside", line: "38 pockets. The ball does not care." },
  { href: "/craps", name: "Craps", meta: "Pass / don't · odds · place 6/8 · field · props", line: "Come-out, point, seven-out." },
  { href: "/paigow", name: "Pai Gow Poker", meta: "6 seats · house banks · 5% on wins", line: "Seven cards. Two hands. Both must hold." },
];

export default function Floor() {
  return (
    <Shell>
      {(u) => (
        <>
          <div className="hero" style={{ paddingTop: 36 }}>
            <p className="lede">Good evening, {u.displayName}</p>
            <h1 style={{ fontSize: 56 }}>The floor</h1>
            <div className="rule" />
            <p className="muted">Six tables. The cage is to your left. The house keeps the ledger.</p>
          </div>
          <div className="grid-games">
            {GAMES.map((g: any) => (
              <Link key={g.href} href={g.href} className={`game-card${g.cash ? " cash-table" : ""}`}>
                {g.cash && <div className="cash-stakes">{g.stakes}</div>}
                <div className="gmeta">{g.line}</div>
                <h2 className="gname">{g.name}</h2>
                <div className="gmeta">{g.meta}</div>
                {g.cash && (
                  <>
                    <div className="mini-oval" />
                    <div className="seat-dots">
                      {Array.from({ length: g.max }, (_, i) => (
                        <span key={i} className={`seat-dot${i < g.taken ? " on" : ""}`} />
                      ))}
                    </div>
                    <div className="cash-taken">{g.taken} / {g.max} seated</div>
                  </>
                )}
                <div className="play">{g.cash ? "Sit down →" : "Take a seat →"}</div>
              </Link>
            ))}
          </div>
        </>
      )}
    </Shell>
  );
}
