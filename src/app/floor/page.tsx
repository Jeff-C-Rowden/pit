"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import FeltThumb from "@/components/FeltThumb";
import Shell from "@/components/Shell";
import Onboarding from "@/components/Onboarding";
import { api, money } from "@/components/useUser";
import { filterGames, readRecent } from "@/lib/lobby";

type MeterPublic = {
  id: string;
  name: string;
  progressiveCents: number;
};

type RecentHitPublic = {
  tier: string;
  amountCents: number;
  at: string;
  displayName: string;
};

function relativeHitTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 45_000) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const GAMES = [
  { href: "/blackjack", level: "Easy to learn", pace: "Steady", name: "Blackjack", meta: "7-spot · six-deck · S17 · BJ 3:2", line: "The pit staple.", accent: "bj" },
  { href: "/slot", level: "Easiest", pace: "Fast", name: "Gilded Track", meta: "5 reels · 9 lines · published 94–96% RTP", line: "A video slot with a real paytable.", accent: "slot" },
  {
    href: "/vault", level: "Easiest", pace: "Fast",
    name: "Canopy Spire",
    meta: "5 reels · 9 lines · 4-tier progressive",
    line: "Jungle canopy progressive — Mini · Minor · Major · Grand.",
    accent: "vault",
    progressive: true,
  },
  { href: "/holdem", level: "Learn first", pace: "Slow", name: "Texas Hold'em", meta: "$1 / $2 NL · 8-max felt", line: "Sit down. Bots take the other chairs. House banks.", cash: true, taken: 5, max: 8, stakes: "$1 / $2 NL", accent: "he" },
  { href: "/roulette", level: "Easy", pace: "Steady", name: "Roulette", meta: "American wheel · 0 and 00 · inside & outside", line: "38 pockets. The ball does not care.", accent: "rl" },
  { href: "/craps", level: "Learn first", pace: "Fast", name: "Craps", meta: "Pass / don't · odds · place 6/8 · field · props", line: "Come-out, point, seven-out.", accent: "cr" },
  { href: "/paigow", level: "Some rules", pace: "Slow", name: "Pai Gow Poker", meta: "6 seats · house banks · 5% on wins", line: "Seven cards. Two hands. Both must hold.", accent: "pg" },
];

function VaultLobbyMeters() {
  const [meters, setMeters] = useState<MeterPublic[]>([]);
  const [recentHits, setRecentHits] = useState<RecentHitPublic[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      api("/api/games/slot-progressive")
        .then((d) => {
          if (!alive) return;
          if (d.meters) setMeters(d.meters);
          if (Array.isArray(d.recentHits)) setRecentHits(d.recentHits);
          else setRecentHits([]);
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
    <div className="vault-lobby-prog" aria-label="Live Canopy Spire progressive">
      <div className="vault-lobby-prog-head">
        <span className="sandbox-chip">Sandbox / test chips</span>
        <span className="vault-lobby-live">LIVE</span>
      </div>
      <div className="vault-lobby-meters" aria-label="Live progressive meters">
        {sorted.map((m) => (
          <div key={m.id} className={`vault-lobby-tier vault-lobby-${m.name.toLowerCase()}`}>
            <span className="vault-lobby-tier-name">{m.name}</span>
            <span className="vault-lobby-tier-amt">{money(m.progressiveCents)}</span>
          </div>
        ))}
      </div>
      <div className="vault-lobby-lastwon" aria-label="Recent progressive wins">
        <div className="vault-lobby-lastwon-lab">Last won</div>
        {recentHits === null ? (
          <p className="vault-lobby-lastwon-empty muted">…</p>
        ) : recentHits.length === 0 ? (
          <p className="vault-lobby-lastwon-empty muted">No jackpots hit yet</p>
        ) : (
          <ul className="vault-lobby-lastwon-list">
            {recentHits.slice(0, 5).map((h, i) => (
              <li key={`${h.at}-${h.tier}-${i}`}>
                <span className="vault-lobby-hit-tier">{h.tier}</span>
                <span className="vault-lobby-hit-amt">{money(h.amountCents)}</span>
                <span className="vault-lobby-hit-who muted">{h.displayName}</span>
                <span className="vault-lobby-hit-when muted">{relativeHitTime(h.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function RecentlyPlayed() {
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => setRecent(readRecent()), []);
  const items = recent.map((h) => GAMES.find((g) => g.href === h)).filter(Boolean) as typeof GAMES;
  if (!items.length) return null;
  return (
    <nav className="floor-recent" aria-label="Recently played">
      <span className="floor-recent-lab">Recently played</span>
      {items.map((g) => (
        <Link key={g.href} href={g.href} className={`floor-recent-chip accent-${g.accent}`}>
          {g.name}
        </Link>
      ))}
    </nav>
  );
}

export default function Floor() {
  const [q, setQ] = useState("");
  const shown = filterGames(GAMES, q);
  return (
    <Shell>
      {(u) => (
        <>
          <Onboarding user={u} />
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
          <StartHere />
          <div className="floor-tools">
            <RecentlyPlayed />
            <label className="floor-search">
              <span className="sr-only">Search games</span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search tables — try “wheel” or “progressive”"
                aria-label="Search games"
                autoComplete="off"
                enterKeyHint="search"
              />
            </label>
          </div>
          {!shown.length && (
            <p className="muted floor-empty" role="status">
              No table matches “{q}”. <button type="button" className="linkish" onClick={() => setQ("")}>Show all games</button>
            </p>
          )}
          <div className="grid-games">
            {shown.map((g: any) => (
              <Link
                key={g.href}
                href={g.href}
                className={`game-card${g.cash ? " cash-table" : ""}${g.accent ? ` accent-${g.accent}` : ""}${g.progressive ? " progressive-card" : ""}`}
              >
                {g.progressive && <span className="progressive-badge">LIVE Progressive</span>}
                {g.cash && <div className="cash-stakes">{g.stakes}</div>}
                <FeltThumb kind={g.accent} />
                <div className="gmeta gline">{g.line}</div>
                <h2 className="gname">{g.name}</h2>
                <div className="gmeta">{g.meta}</div>
                <div className="gtags"><span className="gtag">{g.level}</span><span className="gtag">{g.pace} pace</span></div>
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

/** First visit only (no bets in the ledger yet): one honest, easy first table. */
function StartHere() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/api/wallet/ledger", { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d) setShow(!(d.recent || []).some((l: { type: string }) => l.type === "bet")); }).catch(() => null);
    return () => { live = false; };
  }, []);
  if (!show) return null;
  return (
    <section className="start-here" aria-label="New here">
      <FeltThumb kind="rl" />
      <div className="start-here-k">New here? Start with one easy bet</div>
      <h2>Roulette: put a chip on Red, then Spin</h2>
      <p className="muted">Red pays even money and wins 18 of 38 spins (47.4%). Each table shows its rules before you bet.</p>
      <div className="start-here-row">
        <Link href="/roulette" className="btn primary">Try Roulette →</Link>
        <Link href="/blackjack" className="btn">Or Blackjack</Link>
      </div>
    </section>
  );
}
