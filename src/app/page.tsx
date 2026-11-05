"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";
import { api } from "@/components/useUser";
import { Suspense } from "react";

function Gate() {
  const router = useRouter();
  const sp = useSearchParams();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aged, setAged] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { if (d.user) router.replace("/floor"); });
    if (document.cookie.includes("pit_age=21")) setAged(true);
  }, [router]);

  async function confirm() {
    setBusy(true);
    setErr(null);
    try {
      await api("/api/auth/me", { method: "POST", body: JSON.stringify({ age: 21 }) });
      setAged(true);
      router.replace("/signup");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "denied");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pit-shell gate-shell">
      <section className="home-hero" aria-label="Welcome to Pit">
        <div className="felt-scene" aria-hidden="true">
          <svg viewBox="0 0 360 200" className="felt-svg">
            <defs>
              <radialGradient id="hf" cx="50%" cy="30%" r="80%"><stop offset="0" stopColor="#1f7a52" /><stop offset="1" stopColor="#0b3524" /></radialGradient>
            </defs>
            <rect x="0" y="0" width="360" height="200" rx="22" fill="url(#hf)" />
            <path d="M30 170 Q180 70 330 170" fill="none" stroke="#d8b25a" strokeOpacity=".55" strokeWidth="2" />
            <g transform="translate(150 54) rotate(-10)"><rect width="46" height="64" rx="6" fill="#f7f1e3" /><text x="8" y="22" fontSize="18" fill="#b3261e" fontWeight="700">A♥</text></g>
            <g transform="translate(184 50) rotate(9)"><rect width="46" height="64" rx="6" fill="#f7f1e3" /><text x="8" y="22" fontSize="18" fill="#1c1c1c" fontWeight="700">K♠</text></g>
            {[[70,150,"#b3261e"],[70,142,"#b3261e"],[70,134,"#b3261e"],[290,150,"#1f4fa8"],[290,142,"#1f4fa8"],[110,160,"#d8b25a"]].map(([x,y,c],k)=>(
              <g key={k}><ellipse cx={x as number} cy={y as number} rx="22" ry="8" fill={c as string} stroke="#f7f1e3" strokeWidth="2" strokeDasharray="5 4" /></g>
            ))}
          </svg>
          <div className="felt-logo"><Logo size={44} /></div>
        </div>
        <h1 className="home-title">Pit</h1>
        <p className="home-sell">Seven tables, honest odds, real casino rules. Play free with sandbox chips.</p>
        <button type="button" className="btn primary home-enter" disabled={busy} onClick={confirm}>
          {busy ? "Confirming…" : "I am 21 or older — enter"}
        </button>
        <p className="home-age-line">21+ only · sandbox chips, no real money</p>
      </section>
      <div className="age-card">
        <div className="sandbox-chip age-sandbox">Sandbox · test credits</div>
        <h2>Adults 21 and over</h2>
        <p className="muted age-copy">
          Pit is a casino sandbox. Confirm you are at least 21 before signup or play.
          No live payments — cage deposits are ledger test funds only.
        </p>
        {sp.get("gate") && <p className="err">Age confirmation is required to enter the floor.</p>}
        {err && <p className="err">{err}</p>}
        <div className="btn-row age-actions">
          <button type="button" className="btn" onClick={() => setErr("Pit does not admit anyone under 21.")}>
            I am under 21
          </button>
        </div>
        {aged && <p className="ok age-ok">Age confirmed. Continue to signup or login.</p>}
        <p className="age-links">
          <a href="/login" className="age-link">Log in</a>
          <a href="/rules" className="age-link">House rules & odds</a>
        </p>
      </div>
      <div className="grid-games gate-preview">
        {[
          ["Blackjack", "Six-deck · S17 · 3:2"],
          ["Gilded Track", "Five-reel video slot"],
          ["Canopy Spire", "Jungle 4-tier progressive"],
          ["Hold'em", "Heads-up vs the house"],
          ["Roulette", "American 0 / 00"],
          ["Craps", "Pass, odds, place, field"],
          ["Pai Gow", "House banks · 5%"],
        ].map(([n, m]) => (
          <div key={n} className="game-card preview-card">
            <h3 className="gname">{n}</h3>
            <div className="gmeta">{m}</div>
          </div>
        ))}
      </div>
      <footer className="footer">
        <p className="footer-line">Not a licensed gambling operator.</p>
        <p className="footer-line muted">Live real-money operation requires a license and licensed payments.</p>
      </footer>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Gate />
    </Suspense>
  );
}
