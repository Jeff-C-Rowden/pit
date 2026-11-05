"use client";
import { useEffect, useState } from "react";
import { api, useUser } from "./useUser";
import { pauseText, pausedLabel, type PauseInfo } from "@/lib/pauseText";

/** Calm bottom-bar line while the server is refusing new bets (break, self-exclusion, time's up). Reads the server's own state. */
/** The server's pause state, refreshed on load, on session/balance events and every minute. */
export function usePauseInfo(): PauseInfo | null {
  const { user } = useUser();
  const [d, setD] = useState<PauseInfo | null>(null);
  useEffect(() => {
    if (!user) return;
    let live = true;
    const refresh = () => api("/api/session").then((x: PauseInfo) => { if (live) setD(x); }).catch(() => {});
    refresh();
    const t = setInterval(refresh, 60_000);
    const on = () => refresh();
    window.addEventListener("pit:session", on); window.addEventListener("pit:balance", on);
    return () => { live = false; clearInterval(t); window.removeEventListener("pit:session", on); window.removeEventListener("pit:balance", on); };
  }, [user]);
  return d;
}

/** "Paused until h:mm AM" while new bets are refused, else null. For Deal / Spin / Roll buttons only. */
export function usePausedLabel(): string | null {
  return pausedLabel(usePauseInfo());
}

export default function PauseStatus() {
  const d = usePauseInfo();
  const text = pauseText(d);
  if (!text) return null;
  return (
    <p className="pause-status" role="status">
      <span aria-hidden="true" className="pause-dot" />{text} Anything already in play still finishes. <a href="/wallet#time">Details</a>
    </p>
  );
}
