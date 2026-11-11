"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Logo from "./Logo";
import { api, money, useUser, type User } from "./useUser";
import { recordRecent } from "@/lib/lobby";
import { recordAchievement } from "@/lib/achievements";
import { AchievementToast } from "./Achievements";
import RealityCheck from "./RealityCheck";
import SessionStrip from "./SessionStrip";
import RefillBar from "./RefillBar";
import { playChip, setSoundOn, soundOn } from "@/lib/feel";
import { ChipCoin } from "./WesternArt";

function AnimatedBalance({ cents }: { cents: number }) {
  const prev = useRef<number | null>(null);
  const [display, setDisplay] = useState(cents);
  const [flash, setFlash] = useState("");

  useEffect(() => {
    const from = prev.current;
    prev.current = cents;
    if (from == null || from === cents) {
      setDisplay(cents);
      return;
    }
    setFlash(cents > from ? "tick-up" : "tick-down");
    const t0 = performance.now();
    const dur = 520;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - (1 - p) * (1 - p);
      setDisplay(Math.round(from + (cents - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const to = window.setTimeout(() => setFlash(""), 850);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(to);
    };
  }, [cents]);

  return <strong className={flash}>{money(display)}</strong>;
}

function SoundToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(soundOn());
    const f = () => setOn(soundOn());
    window.addEventListener("pit-sound", f);
    return () => window.removeEventListener("pit-sound", f);
  }, []);
  return (
    <button type="button" className={`nav-sound${on ? " on" : ""}`} aria-pressed={on} title={`Sound & feel ${on ? "on" : "off"}`} onClick={() => { setSoundOn(!on); if (!on) setTimeout(playChip, 30); }}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />{on ? <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /> : <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}</svg>
      <span className="nav-sound-text">Sound &amp; feel {on ? "on" : "off"}</span>
    </button>
  );
}

const GAME_PATHS = ["/blackjack", "/slot", "/vault", "/buckshot", "/bounty", "/holdem", "/roulette", "/craps", "/paigow"];

const ico = (d: string) => <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const ICONS = {
  home: "M3 11 12 3l9 8M5 10v10h5v-6h4v6h5V10",
  classic: "M7 15a3 3 0 1 0 0 .1M15 15a3 3 0 1 0 0 .1M7 12c1-5 4-8 8-9M15 12c0-4 0-7 0-9",
  video: "M3 6h14v12H3zM7 6v12M11 6v12M17 9h3v4M20 13v2",
  jackpot: "M4 7h16v10H4zM12 9.5v5M10.5 10.5c0-1 3-1 3 0s-3 1-3 2 3 1 3 0",
  roulette: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 3v4M12 17v4M3 12h4M17 12h4",
  cards: "M8 4h9a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM4 7l3-1M12.5 9l-2 3h4l-2 3",
  dice: "M5 5h14v14H5zM9 9h.1M15 9h.1M12 12h.1M9 15h.1M15 15h.1",
  poker: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3v3M12 18v3M3 12h3M18 12h3M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  recent: "M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z",
  history: "M12 3a9 9 0 1 0 9 9M12 7v5l3 2M21 3v5h-5",
  rules: "M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4",
  boss: "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z",
  bonus: "M4 9h16v11H4zM3 6h18v3H3zM12 6v14M12 6c-2-3-6-3-5 0M12 6c2-3 6-3 5 0",
  trophy: "M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9 18h6",
};

const RAIL: [string, string, keyof typeof ICONS][] = [
  ["/floor", "Home", "home"],
  ["/buckshot", "3-Reel Slots", "classic"],
  ["/floor#slots", "Video Slots", "video"],
  ["/vault", "Progressives", "jackpot"],
  ["/bounty", "Bonus to Cash", "bonus"],
  ["/roulette", "Roulette", "roulette"],
  ["/blackjack", "Blackjack", "cards"],
  ["/craps", "Craps", "dice"],
  ["/floor#tables", "Table Games", "poker"],
  ["/activity", "My History", "history"],
];

/** Left red rail on desktop; a slide-in drawer on phones. */
function Rail({ path, open, onClose, isOperator }: { path: string; open: boolean; onClose: () => void; isOperator?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const isOn = (h: string) => !h.includes("#") && (path === h || path.startsWith(h + "/"));
  const items = isOperator ? [...RAIL, ["/pit", "Pit Boss", "boss"] as [string, string, keyof typeof ICONS]] : RAIL;
  return (
    <>
      <div className={`st-scrim${open ? " open" : ""}`} onClick={onClose} aria-hidden="true" />
      <aside className={`st-rail${open ? " open" : ""}`} aria-label="Casino menu">
        <Link href="/floor" className="st-rail-logo" onClick={onClose} aria-label="Pit home">
          <Logo size={78} />
          <span className="st-rail-word">Pit</span>
          <span className="st-rail-tag">Sandbox casino · 21+</span>
        </Link>
        <form className="st-rail-search" role="search" onSubmit={(e) => { e.preventDefault(); onClose(); router.push(`/floor?q=${encodeURIComponent(q)}#games`); }}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find games" aria-label="Find games" enterKeyHint="search" />
        </form>
        <nav className="st-rail-nav" aria-label="Main">
          {items.map(([h, l, i]) => (
            <Link key={h} href={h} className={isOn(h) ? "active" : ""} onClick={onClose} aria-current={isOn(h) ? "page" : undefined}>
              <span>{l}</span>{ico(ICONS[i])}
            </Link>
          ))}
        </nav>
        <div className="st-rail-pills">
          <Link href="/rules" className="st-pill st-pill-outline" onClick={onClose}>Odds &amp; Rules</Link>
          <Link href="/wallet" className="st-pill st-pill-gold" onClick={onClose}>The Cage</Link>
        </div>
        <p className="st-rail-note">Sandbox chips only · no cash value</p>
      </aside>
    </>
  );
}

/** Phone bottom nav, maroon and gold. Hidden on game screens so it never covers a bet dock. */
function BottomNav({ path }: { path: string }) {
  if (GAME_PATHS.some((g) => path === g || path.startsWith(g + "/"))) return null;
  const is = (h: string) => path === h || path.startsWith(h + "/");
  return (
    <nav className="st-bottomnav" aria-label="Quick">
      <Link href="/floor" className={is("/floor") ? "active" : ""}>{ico(ICONS.home)}<span>Lobby</span></Link>
      <Link href="/floor#slots" className="">{ico(ICONS.video)}<span>Slots</span></Link>
      <Link href="/wallet" className={`st-bottomnav-cage${is("/wallet") ? " active" : ""}`}><span className="st-bottomnav-orb"><ChipCoin size={30} /></span><span>Cage</span></Link>
      <Link href="/rules" className={is("/rules") ? "active" : ""}>{ico(ICONS.rules)}<span>Odds</span></Link>
      <Link href="/activity" className={is("/activity") ? "active" : ""}>{ico(ICONS.history)}<span>History</span></Link>
    </nav>
  );
}

export default function Shell({ children, requireAuth = true }: { children: React.ReactNode | ((u: User) => React.ReactNode); requireAuth?: boolean }) {
  const { user, refresh } = useUser();
  const path = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => {
    if (user && path) { recordRecent(path); recordAchievement({ kind: "seat", href: path }); }
  }, [user, path]);

  if (user === undefined) {
    return (
      <div className="pit-shell">
        <div className="topbar">
          <div className="brand"><Logo /><div><div className="name">Pit</div><div className="tag">Private tables</div></div></div>
        </div>
        <p className="muted shell-loading">Opening the floor…</p>
      </div>
    );
  }
  if (requireAuth && !user) {
    if (typeof window !== "undefined") router.replace("/login");
    return null;
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
    await refresh();
    router.push("/");
  }

  return (
    <div className="st-app">
      {user && <Rail path={path} open={drawer} onClose={() => setDrawer(false)} isOperator={user.isOperator} />}
    <div className="pit-shell">
      <header className="topbar">
        {user && (
          <button type="button" className="st-burger" aria-label="Open menu" aria-expanded={drawer} onClick={() => setDrawer(true)}>
            <span /><span /><span />
          </button>
        )}
        <Link href="/floor" className="brand">
          <Logo />
          <div>
            <div className="name">Pit</div>
            <div className="tag">Sandbox casino · 21+</div>
          </div>
        </Link>
        <div className="topbar-actions">
          <SoundToggle />
          {user && (
            <Link href="/wallet" className="wallet-pill" title="Open the Cage">
              <ChipCoin size={20} />
              <span className="sandbox-chip">Sandbox</span>
              <span className="wallet-name muted">{user.displayName}</span>
              <AnimatedBalance cents={user.balanceCents} />
              <span className="wallet-bonus" title="Bonus · play only, not withdrawable" data-testid="top-bonus"><span className="wallet-bonus-lab">Bonus</span> {money(user.bonusCents ?? 0)}</span>
            </Link>
          )}
          {user && <Link href="/wallet" className="st-pill st-pill-gold st-top-cage">Cage</Link>}
          {user && <span className="st-avatar" aria-hidden="true">{(user.displayName || "P").trim().charAt(0).toUpperCase()}</span>}
          {user && <button type="button" className="st-pill st-pill-outline btn-signout" onClick={logout}>Sign out</button>}
          <Link href="/rules" className="st-help" aria-label="Odds, rules and help">?</Link>
        </div>
      </header>
      {user && path !== "/wallet" && <RefillBar />}
      {user && <RealityCheck />}
      {user && <SessionStrip />}
      {user && <AchievementToast />}
      {typeof children === "function" ? (user ? children(user) : null) : children}
      {user && <BottomNav path={path} />}
      <footer className="footer st-footer">
        <nav className="st-footer-links" aria-label="Footer">
          <Link href="/rules">Odds &amp; Rules</Link>
          <Link href="/wallet#time">Play Limits</Link>
          <Link href="/activity">History</Link>
          <Link href="/wallet">The Cage</Link>
          <a href="tel:18004262537">Problem gambling help</a>
        </nav>
        <p className="footer-line">Sandbox · test chips only · no cash value · 21+</p>
        <p className="footer-line muted">Operating a real-money casino requires a gambling license and licensed payments. Pit is a local product, not a licensed operator.</p>
      </footer>
    </div>
    </div>
  );
}
