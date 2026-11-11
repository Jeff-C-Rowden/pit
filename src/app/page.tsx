"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";
import { DesertScene, AntlerShoe } from "@/components/WesternArt";
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
        <div className="st-gate-scene" aria-hidden="true">
          <DesertScene className="st-gate-desert" />
          <div className="st-gate-logo"><Logo size={96} /></div>
          <AntlerShoe size={54} className="st-gate-shoe" />
        </div>
        <h1 className="home-title">Are you 21 or over?</h1>
        <p className="home-sell">Pit is a western-style sandbox casino: eight games, honest odds, real casino rules. Play free with sandbox chips.</p>
        <button type="button" className="btn primary home-enter" disabled={busy} onClick={confirm}>
          {busy ? "Confirming…" : "I’m 21+ · enter"}
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
          ["Buckshot Bars", "Classic 3-reel slot"],
          ["Sundown Trail", "Five-reel video slot"],
          ["Canary Creek Mine", "Story slot · free spins · pick bonus"],
          ["Antler Ridge", "4-tier progressive"],
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
