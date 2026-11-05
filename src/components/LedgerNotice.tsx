"use client";
import { useEffect, useState } from "react";

/** Honest notice shown only when the server is running on an ephemeral (non-persisted) ledger. */
export default function LedgerNotice() {
  const [ephemeral, setEphemeral] = useState(false);
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setEphemeral(d?.ledger === "ephemeral"))
      .catch(() => undefined);
  }, []);
  if (!ephemeral) return null;
  return (
    <p className="ledger-notice" role="status">
      Temporary ledger: saved storage is offline, so sandbox accounts and chips may reset when the server restarts.
    </p>
  );
}
