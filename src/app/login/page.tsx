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
    <div className="pit-shell" style={{ maxWidth: 480 }}>
      <div className="hero" style={{ paddingBottom: 12 }}>
        <Logo />
        <h1 style={{ fontSize: 42 }}>The door</h1>
      </div>
      <form className="panel" onSubmit={submit}>
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <p className="err">{err}</p>}
        <div className="btn-row" style={{ marginTop: 18 }}>
          <button className="btn primary" disabled={busy}>Sign in</button>
          <a className="btn" href="/signup">Create account</a>
        </div>
      </form>
    </div>
  );
}
