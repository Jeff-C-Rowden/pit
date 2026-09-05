"use client";
import Link from "next/link";
import Shell from "@/components/Shell";
import { money } from "@/components/useUser";

const GAMES = [
  { href: "/blackjack", name: "Blackjack", meta: "7-spot · six-deck · S17 · BJ 3:2", line: "The pit staple.", accent: "bj" },
  { href: "/slot", name: "Gilded Track", meta: "5 reels · 9 lines · published 94–96% RTP", line: "A video slot with a real paytable.", accent: "slot" },
  { href: "/holdem", name: "Texas Hold'em", meta: "$1 / $2 NL · 8-max felt", line: "Sit down. Bots take the other chairs. House banks.", cash: true, taken: 5, max: 8, stakes: "$1 / $2 NL", accent: "he" },
  { href: "/roulette", name: "Roulette", meta: "American wheel · 0 and 00 · inside & outside", line: "38 pockets. The ball does not care.", accent: "rl" },
  { href: "/craps", name: "Craps", meta: "Pass / don't · odds · place 6/8 · field · props", line: "Come-out, point, seven-out.", accent: "cr" },
  { href: "/paigow", name: "Pai Gow Poker", meta: "6 seats · house banks · 5% on wins", line: "Seven cards. Two hands. Both must hold.", accent: "pg" },
];

export default function Floor() {
  return (
    <Shell>
      {(u) => (
        <>
          <div className="hero floor-hero">
            <p className="lede">Good evening, {u.displayName}</p>
            <h1>The floor</h1>
            <div className="rule" />
            <p className="muted">Tables open. The cage keeps the ledger. Sandbox credits only.</p>
          </div>
          <div className="floor-banner" role="status">
            <span className="sandbox-chip">Sandbox</span>
            <span className="floor-banner-text">
              Balance <strong>{money(u.balanceCents)}</strong>
              <span className="floor-banner-sep">·</span>
              Add test funds in the <Link href="/wallet">Cage</Link>
              <span className="floor-banner-sep">·</span>
              21+
            </span>
          </div>
          <div className="grid-games">
            {GAMES.map((g: any) => (
              <Link key={g.href} href={g.href} className={`game-card${g.cash ? " cash-table" : ""}${g.accent ? ` accent-${g.accent}` : ""}`}>
                {g.cash && <div className="cash-stakes">{g.stakes}</div>}
                <div className="gmeta gline">{g.line}</div>
                <h2 className="gname">{g.name}</h2>
                <div className="gmeta">{g.meta}</div>
                {g.cash && (
                  <>
                    <div className="mini-oval" aria-hidden />
                    <div className="seat-dots" aria-label={`${g.taken} of ${g.max} seated`}>
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
