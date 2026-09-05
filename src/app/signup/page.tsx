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
    <div className="pit-shell auth-shell">
      <div className="hero auth-hero">
        <Logo />
        <h1>Take a seat</h1>
        <p className="muted">Create an account. Cage starts with sandbox credits.</p>
      </div>
      <form className="panel auth-panel" onSubmit={submit}>
        <label htmlFor="su-name">Display name</label>
        <input id="su-name" autoComplete="nickname" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <label htmlFor="su-email">Email</label>
        <input id="su-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label htmlFor="su-pass">Password (8+)</label>
        <input id="su-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <label className="age-check">
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          <span>I confirm I am 21 years of age or older.</span>
        </label>
        {err && <p className="err">{err}</p>}
        <div className="btn-row auth-actions">
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
          <a className="btn" href="/login">Sign in</a>
        </div>
      </form>
      <p className="auth-foot muted"><a href="/">Age gate</a> · Sandbox wallet · No live charges</p>
    </div>
  );
}
