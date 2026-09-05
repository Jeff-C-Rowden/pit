"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

export type User = {
  id: string;
  email: string;
  displayName: string;
  ageConfirmed: boolean;
  isOperator: boolean;
  balanceCents: number;
  depositLimitCents: number | null;
  lossLimitCents: number | null;
};

export function money(cents: number) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

type UserCtx = {
  user: User | null | undefined;
  setUser: Dispatch<SetStateAction<User | null | undefined>>;
  refresh: () => Promise<User | null>;
  err: string | null;
  setErr: Dispatch<SetStateAction<string | null>>;
};

const Ctx = createContext<UserCtx | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const d = await api("/api/auth/me");
    setUser(d.user);
    return (d.user ?? null) as User | null;
  }, []);
  useEffect(() => { refresh().catch((e) => setErr(e.message)); }, [refresh]);
  const value = useMemo(() => ({ user, setUser, refresh, err, setErr }), [user, refresh, err]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUser() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUser requires UserProvider");
  return ctx;
}
