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
    <div className="pit-shell">
      <div className="hero">
        <Logo size={72} />
        <h1>Pit</h1>
        <div className="rule" />
        <p className="lede">A private floor · felt, gold, and a house that keeps the books</p>
      </div>
      <div className="age-card">
        <h2>Adults 21 and over</h2>
        <p className="muted">Pit is a casino. You must confirm you are at least 21 years old before signup or play. This is a sandbox: test credits only, no live payments.</p>
        {sp.get("gate") && <p className="err">Age confirmation is required to enter the floor.</p>}
        {err && <p className="err">{err}</p>}
        <div className="btn-row" style={{ justifyContent: "center", marginTop: 18 }}>
          <button className="btn primary" disabled={busy} onClick={confirm}>I am 21 or older — enter</button>
          <button className="btn" onClick={() => setErr("Pit does not admit anyone under 21.")}>I am under 21</button>
        </div>
        {aged && <p className="ok" style={{ marginTop: 12 }}>Age confirmed. Continue to signup or login.</p>}
        <p style={{ marginTop: 22 }}>
          <a href="/login">Already have a seat</a>
          {" · "}
          <a href="/rules">House rules & RTP</a>
        </p>
      </div>
      <div className="grid-games" style={{ marginTop: 48 }}>
        {[
          ["Blackjack", "Six-deck · S17 · 3:2"],
          ["Gilded Track", "Five-reel video slot"],
          ["Hold'em", "Heads-up vs the house"],
          ["Roulette", "American 0 / 00"],
          ["Craps", "Pass, odds, place, field"],
          ["Pai Gow", "House banks · 5%"],
        ].map(([n, m]) => (
          <div key={n} className="game-card">
            <h3 className="gname">{n}</h3>
            <div className="gmeta">{m}</div>
          </div>
        ))}
      </div>
      <footer className="footer">Not a licensed gambling operator. Live real-money operation requires a license and licensed payments.</footer>
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
