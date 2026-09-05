"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { api, useUser } from "@/components/useUser";

export default function Login() {
  const r = useRouter();
  const { refresh } = useUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
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
        <h1>The door</h1>
        <p className="muted">Sign in to your sandbox seat.</p>
      </div>
      <form className="panel auth-panel" onSubmit={submit}>
        <label htmlFor="login-email">Email</label>
        <input id="login-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label htmlFor="login-password">Password</label>
        <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <p className="err">{err}</p>}
        <div className="btn-row auth-actions">
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          <a className="btn" href="/signup">Create account</a>
        </div>
      </form>
      <p className="auth-foot muted"><a href="/">Age gate</a> · Adults 21+ · Sandbox only</p>
    </div>
  );
}
