"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Logo from "./Logo";
import { api, money, useUser, type User } from "./useUser";

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

export default function Shell({ children, requireAuth = true }: { children: React.ReactNode | ((u: User) => React.ReactNode); requireAuth?: boolean }) {
  const { user, refresh } = useUser();
  const path = usePathname();
  const router = useRouter();

  if (user === undefined) {
    return (
      <div className="pit-shell">
        <div className="topbar"><div className="brand"><Logo /><div><div className="name">Pit</div><div className="tag">Private tables</div></div></div></div>
        <p className="muted">Opening the floor…</p>
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
      <header className="topbar">
        <Link href="/floor" className="brand">
          <Logo />
          <div>
            <div className="name">Pit</div>
            <div className="tag">Private tables</div>
          </div>
        </Link>
        <nav className="nav">
          {nav.map(([h, l]) => (
            <Link key={h} href={h} className={path === h || path.startsWith(h + "/") ? "active" : ""}>{l}</Link>
          ))}
        </nav>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {user && (
            <Link href="/wallet" className="wallet-pill">
              <span className="muted">{user.displayName}</span>
              <AnimatedBalance cents={user.balanceCents} />
            </Link>
          )}
          {user && <button className="btn" onClick={logout}>Sign out</button>}
        </div>
      </header>
      {typeof children === "function" ? (user ? children(user) : null) : children}
      <footer className="footer">
        Adults 21+ only. Sandbox wallet — no live charges. Operating a real-money casino requires a gambling license and licensed payments. Pit is a local product, not a licensed operator.
      </footer>
    </div>
  );
}
