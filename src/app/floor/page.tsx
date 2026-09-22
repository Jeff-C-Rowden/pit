"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { api, money } from "@/components/useUser";

type MeterPublic = {
  id: string;
  name: string;
  progressiveCents: number;
};

const GAMES = [
  { href: "/blackjack", name: "Blackjack", meta: "7-spot · six-deck · S17 · BJ 3:2", line: "The pit staple.", accent: "bj" },
  { href: "/slot", name: "Gilded Track", meta: "5 reels · 9 lines · published 94–96% RTP", line: "A video slot with a real paytable.", accent: "slot" },
  {
    href: "/vault",
    name: "Vault Spire",
    meta: "5 reels · 9 lines · 4-tier progressive",
    line: "Mini · Minor · Major · Grand — all bets qualify.",
    accent: "vault",
    progressive: true,
  },
  { href: "/holdem", name: "Texas Hold'em", meta: "$1 / $2 NL · 8-max felt", line: "Sit down. Bots take the other chairs. House banks.", cash: true, taken: 5, max: 8, stakes: "$1 / $2 NL", accent: "he" },
  { href: "/roulette", name: "Roulette", meta: "American wheel · 0 and 00 · inside & outside", line: "38 pockets. The ball does not care.", accent: "rl" },
  { href: "/craps", name: "Craps", meta: "Pass / don't · odds · place 6/8 · field · props", line: "Come-out, point, seven-out.", accent: "cr" },
  { href: "/paigow", name: "Pai Gow Poker", meta: "6 seats · house banks · 5% on wins", line: "Seven cards. Two hands. Both must hold.", accent: "pg" },
];

function VaultLobbyMeters() {
  const [meters, setMeters] = useState<MeterPublic[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () => {
      api("/api/games/slot-progressive")
        .then((d) => {
          if (alive && d.meters) setMeters(d.meters);
        })
        .catch(() => {});
    };
    load();
    const t = window.setInterval(load, 4000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  if (!meters.length) {
    return <div className="vault-lobby-meters muted">Loading progressive meters…</div>;
  }

  const order = ["Mini", "Minor", "Major", "Grand"];
  const sorted = [...meters].sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));

  return (
    <div className="vault-lobby-meters" aria-label="Live progressive meters">
      {sorted.map((m) => (
        <div key={m.id} className={`vault-lobby-tier vault-lobby-${m.name.toLowerCase()}`}>
          <span className="vault-lobby-tier-name">{m.name}</span>
          <span className="vault-lobby-tier-amt">{money(m.progressiveCents)}</span>
        </div>
      ))}
    </div>
  );
}

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
              <Link
                key={g.href}
                href={g.href}
                className={`game-card${g.cash ? " cash-table" : ""}${g.accent ? ` accent-${g.accent}` : ""}${g.progressive ? " progressive-card" : ""}`}
              >
                {g.progressive && <span className="progressive-badge">LIVE Progressive</span>}
                {g.cash && <div className="cash-stakes">{g.stakes}</div>}
                <div className="gmeta gline">{g.line}</div>
                <h2 className="gname">{g.name}</h2>
                <div className="gmeta">{g.meta}</div>
                {g.progressive && <VaultLobbyMeters />}
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
                <div className="play">{g.cash ? "Sit down →" : g.progressive ? "Spin progressive →" : "Take a seat →"}</div>
              </Link>
            ))}
          </div>
        </>
      )}
    </Shell>
  );
}
