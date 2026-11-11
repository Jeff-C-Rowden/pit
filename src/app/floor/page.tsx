"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import FeltThumb from "@/components/FeltThumb";
import GameArt from "@/components/GameArt";
import { DragonHero, Lantern } from "@/components/DragonArt";
import { LOBBY_TABS, TAB_LABEL, filterByTab, parseTab, tabCounts, tileRibbon, type LobbyTab } from "@/lib/lobbyTabs";
import { AchievementStrip } from "@/components/Achievements";
import Shell from "@/components/Shell";
import Onboarding from "@/components/Onboarding";
import { api, money } from "@/components/useUser";
import { filterGames, readRecent } from "@/lib/lobby";
import { usePauseInfo } from "@/components/PauseStatus";
import { ExclusionEndedNote } from "@/components/ExclusionReminder";
import { exclusionNote } from "@/lib/pauseText";
import { useReseedMoments } from "@/components/ProgressiveMeter";
import MhbBar from "@/components/MhbBar";
import { activeMoment, displayCents, momentsFromNewHits, reseedLabel } from "@/lib/reseedMoment";

type MeterPublic = {
  id: string;
  name: string;
  progressiveCents: number;
  seedCents: number;
  ceilingCents?: number | null;
};

type RecentHitPublic = {
  tier: string;
  tierId?: string;
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
    line: "Jade dragon progressive — Mini · Minor · Major · Grand.",
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
  const [reseed, addReseed] = useReseedMoments();
  const seenRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      api("/api/games/slot-progressive")
        .then((d) => {
          if (!alive) return;
          if (d.meters) setMeters(d.meters);
          if (Array.isArray(d.recentHits)) setRecentHits(d.recentHits);
          else setRecentHits([]);
          // J4: only hits that land while the lobby is open become a reseed moment.
          const r = momentsFromNewHits(seenRef.current, d.recentHits, d.meters ?? [], Date.now());
          seenRef.current = r.seen;
          addReseed(r.moments);
        })
        .catch(() => {});
    };
    load();
    const t = window.setInterval(load, 4000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [addReseed]);

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
        {sorted.map((m) => {
          const moment = activeMoment(reseed, m.id, Date.now());
          return (
            <div
              key={m.id}
              className={`vault-lobby-tier vault-lobby-${m.name.toLowerCase()}${moment ? " vault-lobby-reseeding" : ""}`}
            >
              <span className="vault-lobby-tier-name">{m.name}</span>
              <span className="vault-lobby-tier-amt">{money(displayCents(m.progressiveCents, moment))}</span>
              {moment && <span className="vault-lobby-reseed">{reseedLabel(moment)}</span>}
              <MhbBar meter={m} shownCents={displayCents(m.progressiveCents, moment)} />
            </div>
          );
        })}
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {reseed.map((r) => `${r.tierName} ${reseedLabel(r)}.`).join(" ")}
      </span>
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

const hm = (m: number) => (m < 1 ? "Under 1 min" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);
/** This Chicago week (Mon–Sun) from the ledger: time played, net and biggest single bet. */
function WeekCard({ w }: { w?: { weekStart: string; minutes: number; netCents: number; biggestBetCents: number; bets: number } }) {
  if (!w) return null;
  const since = new Date(w.weekStart).toLocaleDateString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric" });
  return (
    <section className="week-card" aria-label="Your week so far">
      <div className="week-head"><h2>Your week</h2><span>since {since}</span></div>
      {w.bets === 0 ? (
        <p className="week-empty">No bets yet this week. Nothing to add up.</p>
      ) : (
        <dl className="week-stats">
          <div><dt>Time played</dt><dd>{hm(w.minutes)}</dd></div>
          <div><dt>Net</dt><dd className={w.netCents > 0 ? "pos" : w.netCents < 0 ? "neg" : ""}>{w.netCents >= 0 ? "+" : "−"}{money(Math.abs(w.netCents))}</dd></div>
          <div><dt>Biggest bet</dt><dd>{money(w.biggestBetCents)}</dd></div>
        </dl>
      )}
      <p className="week-foot">From your ledger, Chicago time · <a href="/wallet#time">Time settings</a> · <a href="/activity">History</a></p>
    </section>
  );
}

const SLIDES = [
  { k: "Sandbox casino · 21+", h: "Fire up the floor", p: "Seven tables, honest odds and real casino rules. Sandbox chips only, never real money.", cta: "Play now", href: "#games" },
  { k: "Canopy Spire", h: "Four live jackpots", p: "Mini, Minor, Major and Grand meters that grow only from real spins. Odds on the rules page.", cta: "Spin Canopy Spire", href: "/vault" },
  { k: "The Cage", h: "Daily sandbox chips", p: "Claim $25 of test chips once a Chicago day. No cash value, nothing to withdraw.", cta: "Open the Cage", href: "/wallet" },
];

function HeroBanner({ name }: { name: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % SLIDES.length), 7000);
    return () => window.clearInterval(t);
  }, []);
  const s = SLIDES[i]!;
  return (
    <section className="rd-hero" aria-roledescription="carousel" aria-label="Featured">
      <svg className="rd-hero-lanterns rd-hero-lanterns-l" viewBox="0 0 80 90" aria-hidden="true"><Lantern x={40} y={50} s={0.95} className="sway-a" /></svg>
      <svg className="rd-hero-lanterns rd-hero-lanterns-r" viewBox="0 0 80 90" aria-hidden="true"><Lantern x={40} y={50} s={0.95} className="sway-b" /></svg>
      <div className="rd-hero-copy">
        <p className="rd-hero-hello">Good evening, {name}</p>
        <div className="rd-hero-slide" key={i} aria-live="polite">
          <span className="rd-hero-kicker">{s.k}</span>
          <h1 className="foil rd-hero-title">{s.h}</h1>
          <p className="rd-hero-p">{s.p}</p>
          {s.href.startsWith("#") ? (
            <a href={s.href} className="btn primary rd-glow">{s.cta}</a>
          ) : (
            <Link href={s.href} className="btn primary rd-glow">{s.cta}</Link>
          )}
        </div>
        <div className="rd-hero-dots" role="group" aria-label="Choose slide">
          {SLIDES.map((sl, n) => (
            <button key={sl.h} type="button" className={n === i ? "on" : ""} aria-label={sl.h} aria-pressed={n === i} onClick={() => setI(n)} />
          ))}
        </div>
      </div>
      <DragonHero className="rd-hero-dragon" />
    </section>
  );
}

export default function Floor() {
  const [q, setQ] = useState("");
  const pause = usePauseInfo();
  const excl = exclusionNote(pause);
  const [tab, setTab] = useState<LobbyTab>("all");
  useEffect(() => {
    const sync = () => { const t = parseTab(window.location.hash); if (t !== "all" || window.location.hash === "#all") setTab(t); };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const shown = filterByTab(filterGames(GAMES, q), tab);
  const counts = tabCounts(GAMES);
  const [jp, setJp] = useState(true);
  useEffect(() => { try { setJp(localStorage.getItem("pit.showJackpots") !== "0"); } catch {} }, []);
  const toggleJp = () => { const v = !jp; setJp(v); try { localStorage.setItem("pit.showJackpots", v ? "1" : "0"); } catch {} };
  return (
    <Shell>
      {(u) => (
        <>
          <Onboarding user={u} />
          <div className="floor-hero">
            <HeroBanner name={u.displayName} />
            {!excl && <ExclusionEndedNote />}
            {excl && (
              <aside className="excl-note" role="note" aria-label="Self-exclusion">
                <p><b>You're taking time away.</b> {excl} You can still look around, see your history and use the cage; new bets stay closed until then, and the end time can't be shortened.</p>
                <p className="excl-links"><a href="/wallet#time">Your limits and time away</a> · <a href="/rules">House rules &amp; odds</a> · <a href="/activity">Your history</a> · <a href="tel:18004262537">Problem gambling helpline 1-800-GAMBLER</a></p>
              </aside>
            )}
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
          {jp && (
            <section className="rd-jackpots" aria-label="Canopy Spire jackpots">
              <div className="rd-section-head"><h2>Canopy Spire jackpots</h2><Link href="/vault" className="rd-section-link">Play →</Link></div>
              <VaultLobbyMeters />
            </section>
          )}
          <StartHere />
          <div className="rd-tabs-row" id="games">
            <div className="rd-tabs" role="tablist" aria-label="Game categories">
              {LOBBY_TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  className={`rd-tab${tab === t ? " on" : ""}`}
                  onClick={() => { setTab(t); try { history.replaceState(null, "", t === "all" ? "#all" : `#${t}`); } catch {} }}
                >
                  {TAB_LABEL[t]} <span className="rd-tab-n">{counts[t]}</span>
                </button>
              ))}
            </div>
          </div>
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
            <button type="button" role="switch" aria-checked={jp} className={`floor-jp-toggle${jp ? " on" : ""}`} onClick={toggleJp}>
              <span className="floor-jp-knob" aria-hidden />Show jackpots
            </button>
          </div>
          {!shown.length && (
            <p className="muted floor-empty" role="status">
              No table matches “{q}”. <button type="button" className="linkish" onClick={() => { setQ(""); setTab("all"); }}>Show all games</button>
            </p>
          )}
          <div className="rd-grid" role="tabpanel" aria-label={TAB_LABEL[tab]}>
            {shown.map((g: any) => (
              <Link
                key={g.href}
                href={g.href}
                className={`rd-tile${g.accent ? ` accent-${g.accent}` : ""}${g.progressive ? " progressive-card" : ""}`}
                aria-label={`${g.name}. ${g.line}`}
              >
                <span className="rd-tile-frame">
                  <GameArt kind={g.accent} variant="tile" />
                  <span className={`rd-ribbon rd-ribbon-${tileRibbon(g).toLowerCase()}`}>{tileRibbon(g)}</span>
                  {g.cash && <span className="rd-tile-seats">{g.taken}/{g.max} seated</span>}
                  <span className="rd-tile-play" aria-hidden>Play</span>
                  <span className="rd-tile-plate">
                    <h2 className="gname">{g.name}</h2>
                    <span className="gmeta">{g.meta}</span>
                    <span className="rd-tile-tags">{g.level} · {g.pace} pace</span>
                  </span>
                </span>
              </Link>
            ))}
          </div>
          <WeekCard w={pause?.week} />
          <AchievementStrip />
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
