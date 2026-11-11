"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import FeltThumb from "@/components/FeltThumb";
import GameArt from "@/components/GameArt";
import { HeroArt } from "@/components/WesternArt";
import { LOBBY_TABS, TAB_LABEL, filterByTab, parseTab, tabCounts, tileRibbon, type LobbyTab } from "@/lib/lobbyTabs";
import { AchievementStrip } from "@/components/Achievements";
import Shell from "@/components/Shell";
import Onboarding from "@/components/Onboarding";
import { api, money } from "@/components/useUser";
import { filterGames, readRecent } from "@/lib/lobby";
import { filterByVolatility, type VolFilter } from "@/lib/gameMath";
import { MathStrip, volAria } from "@/components/VolatilityMeter";
import { usePauseInfo } from "@/components/PauseStatus";
import { ExclusionEndedNote } from "@/components/ExclusionReminder";
import { exclusionNote } from "@/lib/pauseText";
import { useReseedMoments } from "@/components/ProgressiveMeter";
import MhbBar from "@/components/MhbBar";
import PotSheet from "@/components/PotSheet";
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
  { href: "/buckshot", level: "Easiest", pace: "Fast", name: "Buckshot Bars", meta: "Classic 3 reels · 1 line · 94.44% RTP", line: "Cherries, bars and a horseshoe wild. Play 1 to 3 coins.", accent: "bb", isNew: true },
  { href: "/bounty", level: "Easiest", pace: "Fast", name: "Bounty Bars", meta: "Bonus to Cash · 3 reels · 1 line · 90.31% RTP", line: "Play your Bonus here: bonus-funded winnings pay out in cash.", accent: "bb", bonusCash: true },
  { href: "/mine", level: "Easy", pace: "Fast", name: "Canary Creek Mine", meta: "Story slot · 5 reels · 9 lines · 95.42% RTP", line: "Dynamite free spins and a Mine Cart pick bonus with Clem and Pip.", accent: "mine", isNew: true },
  { href: "/clover", level: "Easy", pace: "Fast", name: "Kettle of Clover", meta: "Story slot · 5 reels · 10 lines · 95.35% RTP", line: "A Rainbow Wheel with a Pot-of-Gold upgrade and expanding-clover free spins with Orla.", accent: "clover", isNew: true },
  { href: "/prairie", level: "Easy", pace: "Fast", name: "Thunderhoof Prairie", meta: "Story slot · 5 reels · 243 ways · 95.25% RTP", line: "Storm free spins with 2×/3× wilds and a Hold & Spin coin round with Ada.", accent: "prairie", isNew: true },
  { href: "/slot", level: "Easiest", pace: "Fast", name: "Sundown Trail", meta: "5 reels · 9 lines · exact RTP 95.53%", line: "A western video slot with a real paytable.", accent: "slot" },
  {
    href: "/vault", level: "Easiest", pace: "Fast",
    name: "Antler Ridge",
    meta: "5 reels · 9 lines · 4-tier progressive",
    line: "Frontier progressive — Mini · Minor · Major · Grand.",
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
  const [potId, setPotId] = useState<string | null>(null);
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
    <div className="vault-lobby-prog" aria-label="Live Antler Ridge progressive">
      <div className="vault-lobby-prog-head">
        <span className="sandbox-chip">Sandbox / test chips</span>
        <span className="vault-lobby-live">LIVE</span>
      </div>
      <div className="vault-lobby-meters" aria-label="Live progressive meters">
        {sorted.map((m) => {
          const moment = activeMoment(reseed, m.id, Date.now());
          return (
            <button
              type="button"
              key={m.id}
              className={`vault-lobby-tier vault-lobby-tier-btn vault-lobby-${m.name.toLowerCase()}${moment ? " vault-lobby-reseeding" : ""}`}
              aria-haspopup="dialog"
              aria-label={`${m.name} progressive ${money(m.progressiveCents)}. How this pot works.`}
              onClick={() => setPotId(m.id)}
            >
              <span className="vault-lobby-tier-name">{m.name}</span>
              <span className="vault-lobby-tier-amt">{money(displayCents(m.progressiveCents, moment))}</span>
              {moment && <span className="vault-lobby-reseed">{reseedLabel(moment)}</span>}
              <MhbBar meter={m} shownCents={displayCents(m.progressiveCents, moment)} />
            </button>
          );
        })}
      </div>
      <span className="vault-lobby-info-hint muted">Tap a meter to see how that pot works.</span>
      {potId && sorted.some((m) => m.id === potId) && (
        <PotSheet meter={sorted.find((m) => m.id === potId)!} onClose={() => setPotId(null)} />
      )}
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
  { k: "Sandbox casino · 21+", h: "Saddle up, partner", p: "Twelve games, honest odds and real casino rules. Sandbox chips only, never real money.", cta: "Play now", href: "#games" },
  { k: "New story slot", h: "Kettle of Clover", p: "Spin the Rainbow Wheel, upgrade to the Pot-of-Gold wheel, and chase expanding clovers in free spins. Exact RTP 95.35% with features included.", cta: "Meet Orla & Bramble", href: "/clover" },
  { k: "Story slot", h: "Thunderhoof Prairie", p: "243 ways, storm free spins with 2×/3× wilds and a Hold & Spin coin round. Exact RTP 95.25% with features included.", cta: "Ride with Ada", href: "/prairie" },
  { k: "Story slot", h: "Canary Creek Mine", p: "Light the dynamite for free spins, roll the mine carts for a pick bonus. Exact RTP 95.42% with features included.", cta: "Meet Clem & Pip", href: "/mine" },
  { k: "New on the floor", h: "Buckshot Bars", p: "A classic three-reel machine with a horseshoe wild. Exact RTP published on the glass.", cta: "Spin Buckshot Bars", href: "/buckshot" },
  { k: "The Cage", h: "Daily sandbox chips", p: "Claim free test chips once a Chicago day. No cash value, nothing to withdraw.", cta: "Open the Cage", href: "/wallet" },
];

function HeroBanner({ name }: { name: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % SLIDES.length), 7000);
    return () => window.clearInterval(t);
  }, []);
  const s = SLIDES[i]!;
  const go = (d: number) => setI((n) => (n + d + SLIDES.length) % SLIDES.length);
  return (
    <section className="st-hero" aria-roledescription="carousel" aria-label="Featured">
      <div className="st-hero-art" key={`art${i}`}><HeroArt slide={i} /></div>
      <div className="st-hero-copy">
        <p className="st-hero-hello">Howdy, {name}</p>
        <div className="st-hero-slide" key={i} aria-live="polite">
          <span className="st-hero-kicker">{s.k}</span>
          <h1 className="st-hero-title">{s.h}</h1>
          <p className="st-hero-p">{s.p}</p>
          {s.href.startsWith("#") ? (
            <a href={s.href} className="st-pill st-pill-gold st-hero-cta">{s.cta}</a>
          ) : (
            <Link href={s.href} className="st-pill st-pill-gold st-hero-cta">{s.cta}</Link>
          )}
        </div>
      </div>
      <button type="button" className="st-hero-arrow st-hero-prev" aria-label="Previous slide" onClick={() => go(-1)}>‹</button>
      <button type="button" className="st-hero-arrow st-hero-next" aria-label="Next slide" onClick={() => go(1)}>›</button>
      <div className="st-hero-dots" role="group" aria-label="Choose slide">
        {SLIDES.map((sl, n) => (
          <button key={sl.h} type="button" className={n === i ? "on" : ""} aria-label={sl.h} aria-pressed={n === i} onClick={() => setI(n)} />
        ))}
      </div>
    </section>
  );
}

const SHORTCUTS: { href: string; label: string; icon: React.ReactNode }[] = [
  { href: "/wallet#daily", label: "Daily Chips", icon: <svg viewBox="0 0 40 40"><defs><radialGradient id="scg1" cx="38%" cy="30%" r="70%"><stop offset="0" stopColor="#fff1a8" /><stop offset=".55" stopColor="#fedd52" /><stop offset="1" stopColor="#b86f00" /></radialGradient></defs><circle cx="20" cy="22" r="15" fill="url(#scg1)" stroke="#6a3a08" strokeWidth="1.5" /><circle cx="20" cy="22" r="10.5" fill="none" stroke="#a8700f" strokeDasharray="3 2.5" /><path d="M15 17c-2.5 4-1 10 5 10.5 6-.5 7.5-6.5 5-10.5" fill="none" stroke="#7a2a12" strokeWidth="2.6" strokeLinecap="round" /></svg> },
  { href: "/rules", label: "How to Play", icon: <svg viewBox="0 0 40 40"><rect x="9" y="5" width="22" height="30" rx="3" fill="#fffdf4" stroke="#6a3a08" strokeWidth="1.5" transform="rotate(-8 20 20)" /><rect x="11" y="7" width="22" height="30" rx="3" fill="#fffdf4" stroke="#6a3a08" strokeWidth="1.5" transform="rotate(8 20 20)" /><text x="22" y="28" textAnchor="middle" fontSize="15" fontWeight="900" fill="#c0201e" transform="rotate(8 20 20)">A</text></svg> },
  { href: "/wallet#time", label: "Play Limits", icon: <svg viewBox="0 0 40 40"><circle cx="20" cy="21" r="14" fill="#fffdf4" stroke="#b86f00" strokeWidth="3" /><path d="M20 12v9l6 4" stroke="#7a2a12" strokeWidth="2.6" fill="none" strokeLinecap="round" /><rect x="16" y="3" width="8" height="4" rx="1" fill="#fedd52" stroke="#6a3a08" /></svg> },
  { href: "/activity", label: "History", icon: <svg viewBox="0 0 40 40"><path d="M10 6h16l6 6v22H10z" fill="#f2e6c4" stroke="#6a3a08" strokeWidth="1.5" /><path d="M14 16h14M14 21h14M14 26h9" stroke="#7a2a12" strokeWidth="2" /><path d="M26 6v6h6" fill="#fedd52" stroke="#6a3a08" /></svg> },
  { href: "/wallet", label: "The Cage", icon: <svg viewBox="0 0 40 40"><ellipse cx="20" cy="30" rx="13" ry="5" fill="#9c3835" stroke="#fff3d0" strokeDasharray="4 3" /><ellipse cx="20" cy="25" rx="13" ry="5" fill="#243460" stroke="#fff3d0" strokeDasharray="4 3" /><ellipse cx="20" cy="20" rx="13" ry="5" fill="#0f5a32" stroke="#fff3d0" strokeDasharray="4 3" /><ellipse cx="20" cy="15" rx="13" ry="5" fill="#fedd52" stroke="#6a3a08" /></svg> },
];

function ShortcutRow() {
  return (
    <nav className="st-shortcuts" aria-label="Shortcuts">
      {SHORTCUTS.map((s) => (
        <Link key={s.label} href={s.href} className="st-shortcut">
          <span className="st-shortcut-ico" aria-hidden>{s.icon}</span>
          <span>{s.label}</span>
        </Link>
      ))}
    </nav>
  );
}

type Game = (typeof GAMES)[number] & { isNew?: boolean; progressive?: boolean; cash?: boolean; taken?: number; max?: number; bonusCash?: boolean };

function GameCard({ g, size = "grid" }: { g: Game; size?: "grid" | "row" | "tall" }) {
  const ribbon = g.bonusCash ? "Bonus to Cash" : g.isNew ? "New" : tileRibbon(g);
  return (
    <Link href={g.href} className={`st-card st-card-${size}${g.accent ? ` accent-${g.accent}` : ""}${g.progressive ? " progressive-card" : ""}${g.bonusCash ? " b2c-card" : ""}`} aria-label={`${g.name}. ${g.line}. ${volAria(g.href)}`}>
      <span className="st-card-art">
        <GameArt kind={g.accent} variant="tile" />
        <span className={`st-ribbon st-ribbon-${ribbon.toLowerCase().replace(/ /g, "-")}`}>{ribbon}</span>
        {g.cash && <span className="st-card-seats">{g.taken}/{g.max} seated</span>}
        <span className="st-card-play" aria-hidden>Play</span>
      </span>
      <span className="st-card-info">
        <h2 className="gname">{g.name}</h2>
        <span className="gmeta">{g.meta}</span>
        <MathStrip game={g.href} variant="lobby" />
      </span>
    </Link>
  );
}

function GameRow({ title, games, id }: { title: string; games: Game[]; id?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const by = (d: number) => ref.current?.scrollBy({ left: d * (ref.current.clientWidth * 0.8), behavior: "smooth" });
  if (!games.length) return null;
  return (
    <section className="st-row" aria-label={title} id={id}>
      <div className="st-row-head">
        <h2>{title}</h2>
        <span className="st-row-arrows">
          <button type="button" aria-label={`Scroll ${title} left`} onClick={() => by(-1)}>‹</button>
          <button type="button" className="gold" aria-label={`Scroll ${title} right`} onClick={() => by(1)}>›</button>
        </span>
      </div>
      <div className="st-row-track" ref={ref}>
        {games.map((g) => <GameCard key={g.href} g={g} size="row" />)}
      </div>
    </section>
  );
}

export default function Floor() {
  const [q, setQ] = useState("");
  const [vol, setVol] = useState<VolFilter>("all");
  useEffect(() => { try { const v = new URLSearchParams(window.location.search).get("q"); if (v) setQ(v); } catch {} }, []);
  const pause = usePauseInfo();
  const excl = exclusionNote(pause);
  const [tab, setTab] = useState<LobbyTab>("all");
  useEffect(() => {
    const sync = () => { const t = parseTab(window.location.hash); if (t !== "all" || window.location.hash === "#all") setTab(t); };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const [b2c, setB2c] = useState(false);
  useEffect(() => { if (window.location.hash === "#bonus") setB2c(true); }, []);
  const shown = filterByVolatility(filterByTab(filterGames(GAMES.map((g) => ({ ...g, math: volAria(g.href) })), q), tab), vol)
    .filter((g: Game) => !b2c || g.bonusCash);
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
          <ShortcutRow />
          <div className="floor-banner" role="status">
            <span className="sandbox-chip">Sandbox</span>
            <span className="floor-banner-text">
              Balance <strong>{money(u.balanceCents)}</strong>
              <span className="floor-banner-sep">·</span>
              Bonus <strong data-testid="floor-bonus">{money(u.bonusCents ?? 0)}</strong>
              <span className="floor-banner-sep">·</span>
              Free test chips in the <Link href="/wallet">Cage</Link>
              <span className="floor-banner-sep">·</span>
              No cash value · 21+
            </span>
          </div>
          <Link href="/tournaments" className="tny-lobby-link" data-testid="tny-lobby-link">
            <span className="tny-lobby-trophy" aria-hidden>🏆</span>
            <span><b>Tournaments</b><small>Free rolls and $1–$10 buy-ins · real entrants only · see the lobby</small></span>
            <span className="tny-lobby-go" aria-hidden>›</span>
          </Link>
          <StartHere />
          {jp && (
            <section className="st-jackpots" aria-label="Antler Ridge jackpots">
              <div className="st-row-head"><h2>Jackpot Desk</h2><Link href="/vault" className="st-section-link">Play Antler Ridge ›</Link></div>
              <VaultLobbyMeters />
            </section>
          )}
          <GameRow title="New on the Floor" games={GAMES.filter((g: Game) => g.isNew || g.progressive) as Game[]} />
          <section className="st-band" aria-label="Slot row">
            <div className="st-row-head"><h2>Slot Row</h2><Link href="/floor#slots" className="st-section-link" onClick={() => setTab("slots")}>All slots ›</Link></div>
            <div className="st-band-track">
              {filterByTab(GAMES, "slots").map((g) => <GameCard key={g.href} g={g as Game} size="tall" />)}
            </div>
          </section>
          <GameRow title="Table Games" games={filterByTab(GAMES, "tables") as Game[]} />
          <h2 className="st-featured-title" id="games">All Games</h2>
          <div className="st-filterbar">
            <label className="st-filter-select">
              <span className="sr-only">Category</span>
              <select value={tab} onChange={(e) => { const t = parseTab(e.target.value); setTab(t); try { history.replaceState(null, "", `#${t}`); } catch {} }} aria-label="Game category">
                {LOBBY_TABS.map((t) => <option key={t} value={t}>{TAB_LABEL[t]} ({counts[t]})</option>)}
              </select>
            </label>
            <label className="st-filter-select">
              <span className="sr-only">Volatility</span>
              <select value={vol} onChange={(e) => setVol(e.target.value as VolFilter)} aria-label="Filter by volatility">
                <option value="all">All volatilities</option>
                <option value="Low">Low volatility</option>
                <option value="Medium">Medium volatility</option>
                <option value="High">High volatility</option>
              </select>
            </label>
            <label className="floor-search st-filter-search">
              <span className="sr-only">Search games</span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search — try “wheel” or “jackpot”"
                aria-label="Search games"
                autoComplete="off"
                enterKeyHint="search"
              />
            </label>
            <button type="button" role="switch" aria-checked={b2c} className={`floor-jp-toggle floor-b2c-toggle${b2c ? " on" : ""}`} onClick={() => setB2c((v) => !v)} data-testid="b2c-filter">
              <span className="floor-jp-knob" aria-hidden />Bonus to Cash
            </button>
            <button type="button" role="switch" aria-checked={jp} className={`floor-jp-toggle${jp ? " on" : ""}`} onClick={toggleJp}>
              <span className="floor-jp-knob" aria-hidden />Jackpots
            </button>
          </div>
          <div className="st-tabs" role="tablist" aria-label="Game categories">
            {LOBBY_TABS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                className={`st-tab${tab === t ? " on" : ""}`}
                onClick={() => { setTab(t); try { history.replaceState(null, "", t === "all" ? "#all" : `#${t}`); } catch {} }}
              >
                {TAB_LABEL[t]} <span className="st-tab-n">{counts[t]}</span>
              </button>
            ))}
          </div>
          <RecentlyPlayed />
          {!shown.length && (
            <p className="muted floor-empty" role="status">
              No game matches “{q}”. <button type="button" className="linkish" onClick={() => { setQ(""); setTab("all"); setVol("all"); setB2c(false); }}>Show all games</button>
            </p>
          )}
          <div className="st-grid" role="tabpanel" aria-label={TAB_LABEL[tab]}>
            {shown.map((g: any) => <GameCard key={g.href} g={g} />)}
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
