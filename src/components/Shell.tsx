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
import { CoinIcon } from "./DragonArt";

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

/** Ambient embers drifting up the lacquer. Pure CSS, hidden under prefers-reduced-motion. */
function Embers() {
  return (
    <div className="rd-embers" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => <span key={i} style={{ ["--i" as string]: i } as React.CSSProperties} />)}
    </div>
  );
}

const GAME_PATHS = ["/blackjack", "/slot", "/vault", "/holdem", "/roulette", "/craps", "/paigow"];

/** Phone bottom nav, lobby-style. Hidden on game screens so it never covers a bet dock. */
function BottomNav({ path }: { path: string }) {
  if (GAME_PATHS.some((g) => path === g || path.startsWith(g + "/"))) return null;
  const is = (h: string) => path === h || path.startsWith(h + "/");
  const icon = (d: string) => <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d={d} fill="currentColor" /></svg>;
  return (
    <nav className="rd-bottomnav" aria-label="Quick">
      <Link href="/floor" className={is("/floor") ? "active" : ""}>{icon("M12 3 2 11h3v9h5v-6h4v6h5v-9h3z")}<span>Lobby</span></Link>
      <Link href="/floor#slots" className="">{icon("M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 3v8h4V8zm5 0v8h4V8zm5 0v8h4V8z")}<span>Slots</span></Link>
      <Link href="/wallet" className={`rd-bottomnav-cage${is("/wallet") ? " active" : ""}`}><span className="rd-bottomnav-orb"><CoinIcon size={30} /></span><span>Cage</span></Link>
      <Link href="/rules" className={is("/rules") ? "active" : ""}>{icon("M5 3h11l3 3v15H5zm3 6h8v2H8zm0 4h8v2H8zm0-8v2h6V5z")}<span>Odds</span></Link>
      <Link href="/activity" className={is("/activity") ? "active" : ""}>{icon("M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5v5l4 2-1 2-5-3V7z")}<span>History</span></Link>
    </nav>
  );
}

export default function Shell({ children, requireAuth = true }: { children: React.ReactNode | ((u: User) => React.ReactNode); requireAuth?: boolean }) {
  const { user, refresh } = useUser();
  const path = usePathname();
  const router = useRouter();
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

  const nav = [
    ["/floor", "Floor"],
    ["/wallet", "Cage"],
    ["/rules", "Rules"],
  ];
  if (user?.isOperator) nav.push(["/pit", "Pit boss"]);

  return (
    <div className="pit-shell">
      <Embers />
      <header className="topbar">
        <Link href="/floor" className="brand">
          <Logo />
          <div>
            <div className="name">Pit</div>
            <div className="tag">Sandbox casino · 21+</div>
          </div>
        </Link>
        <nav className="nav" aria-label="Main">
          {nav.map(([h, l]) => (
            <Link key={h} href={h} className={path === h || path.startsWith(h + "/") ? "active" : ""}>{l}</Link>
          ))}
        </nav>
        <div className="topbar-actions">
          <SoundToggle />
          {user && (
            <Link href="/wallet" className="wallet-pill" title="Open the cage">
              <CoinIcon size={22} />
              <span className="sandbox-chip">Sandbox</span>
              <span className="wallet-name muted">{user.displayName}</span>
              <AnimatedBalance cents={user.balanceCents} />
              <span className="wallet-plus" aria-label="Add test chips in the Cage">+</span>
            </Link>
          )}
          {user && <span className="rd-avatar" aria-hidden="true">{(user.displayName || "P").trim().charAt(0).toUpperCase()}</span>}
          {user && <button type="button" className="btn btn-signout" onClick={logout}>Sign out</button>}
        </div>
      </header>
      {user && path !== "/wallet" && <RefillBar />}
      {user && <RealityCheck />}
      {user && <SessionStrip />}
      {user && <AchievementToast />}
      {typeof children === "function" ? (user ? children(user) : null) : children}
      {user && <BottomNav path={path} />}
      <footer className="footer">
        <p className="footer-line">Adults 21+ only. Sandbox wallet — no live charges.</p>
        <p className="footer-line muted">Operating a real-money casino requires a gambling license and licensed payments. Pit is a local product, not a licensed operator.</p>
      </footer>
    </div>
  );
}
