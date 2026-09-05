"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { api, useUser } from "@/components/useUser";

export default function Signup() {
  const r = useRouter();
  const { refresh } = useUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      if (!confirm) throw new Error("confirm you are 21 or older");
      await api("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password, displayName }) });
      await refresh();
      r.push("/floor");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="pit-shell" style={{ maxWidth: 480 }}>
      <div className="hero" style={{ paddingBottom: 12 }}>
        <Logo />
        <h1 style={{ fontSize: 42 }}>Take a seat</h1>
      </div>
      <form className="panel" onSubmit={submit}>
        <label>Display name</label>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label>Password (8+)</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 16, textTransform: "none", letterSpacing: 0, fontSize: 14, color: "var(--ivory)" }}>
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          I confirm I am 21 years of age or older.
        </label>
        {err && <p className="err">{err}</p>}
        <div className="btn-row" style={{ marginTop: 18 }}>
          <button className="btn primary" disabled={busy}>Create account</button>
          <a className="btn" href="/login">Sign in</a>
        </div>
      </form>
    </div>
  );
}
