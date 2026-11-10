"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ACHIEVEMENTS, ACH_EVENT, type AchId, type AchProgress, emptyProgress, markToasted, pendingToasts,
  readProgress, recordAchievement, summary, toastText, writeProgress,
} from "@/lib/achievements";

/** Original Pit medallion: gold-rimmed chip with a small glyph per achievement. Decorative. */
export function AchBadgeArt({ id, on }: { id: AchId; on: boolean }) {
  const ink = on ? "#1b130a" : "rgba(245,230,191,.45)";
  const glyph: Record<AchId, React.ReactNode> = {
    "first-seat": <path d="M13 9v9h10M13 18v5M23 18v5M15 13h8" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" />,
    "every-table": <g fill="none" stroke={ink} strokeWidth="1.8"><circle cx="18" cy="18" r="6.5" /><path d="M18 9.5v3M18 23.5v3M9.5 18h3M23.5 18h3" strokeLinecap="round" /><path d="M18 14l1.8 4-1.8 4-1.8-4z" fill={ink} stroke="none" /></g>,
    rules: <g fill="none" stroke={ink} strokeWidth="1.8" strokeLinejoin="round"><path d="M10 12c3-1.5 5.5-1.5 8 0v12c-2.5-1.5-5-1.5-8 0z" /><path d="M26 12c-3-1.5-5.5-1.5-8 0v12c2.5-1.5 5-1.5 8 0z" /></g>,
    coach: <g fill="none" stroke={ink} strokeWidth="1.8" strokeLinecap="round"><path d="M15 15a3 3 0 1 1 4 2.8c-.8.4-1 1-1 1.7v.5" /><circle cx="18" cy="23.5" r=".6" fill={ink} /></g>,
    limit: <g fill="none" stroke={ink} strokeWidth="1.8" strokeLinejoin="round"><path d="M18 9.5l7 2.5v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9v-5z" /><path d="M14.8 17.8l2.3 2.3 4.2-4.3" strokeLinecap="round" /></g>,
  };
  return (
    <svg className="ach-art" viewBox="0 0 36 36" width="36" height="36" aria-hidden="true">
      <defs>
        <radialGradient id={`achG-${id}`} cx="45%" cy="35%" r="70%"><stop offset="0" stopColor="#f7dc8a" /><stop offset="1" stopColor="#a87b1c" /></radialGradient>
      </defs>
      <circle cx="18" cy="18" r="16.5" fill={on ? `url(#achG-${id})` : "rgba(255,255,255,.04)"} stroke={on ? "#f5e6bf" : "rgba(245,230,191,.35)"} strokeWidth="1.2" strokeDasharray={on ? "5 3.6" : "2 3"} />
      <circle cx="18" cy="18" r="12.5" fill="none" stroke={on ? "rgba(27,19,10,.35)" : "rgba(245,230,191,.18)"} strokeWidth="1" />
      {glyph[id]}
    </svg>
  );
}

/** Floor card: compact badge strip with exploration progress. Sandbox, device-only, no rewards. */
export function AchievementStrip() {
  const [p, setP] = useState<AchProgress | null>(null);
  useEffect(() => {
    const load = () => setP(readProgress());
    load();
    window.addEventListener(ACH_EVENT, load);
    window.addEventListener("storage", load);
    return () => { window.removeEventListener(ACH_EVENT, load); window.removeEventListener("storage", load); };
  }, []);
  const s = summary(p || emptyProgress());
  return (
    <section className="ach-card" aria-label="Exploration achievements">
      <div className="ach-head">
        <h2>Explore the floor</h2>
        <span className="ach-count">{s.done} / {s.total}</span>
        <span className="sandbox-chip">Sandbox / test chips</span>
      </div>
      <ul className="ach-strip">
        {ACHIEVEMENTS.map((a) => {
          const on = s.got.includes(a.id);
          const extra = a.id === "every-table" && !on ? ` (${s.tablesSeen} of ${s.tablesTotal})` : "";
          return (
            <li key={a.id} className={`ach-badge${on ? " on" : ""}`} title={`${a.title}: ${on ? "done" : a.hint}`}>
              <AchBadgeArt id={a.id} on={on} />
              <span className="ach-title">{a.title}</span>
              <span className="ach-hint">{on ? "Done" : a.hint + extra}</span>
              <span className="sr-only">{on ? "Unlocked" : "Not yet"}</span>
            </li>
          );
        })}
      </ul>
      <p className="ach-foot">Just for exploring — no chips, never for bets or losses. Saved on this device only. <Link href="/rules">Rules &amp; odds</Link> · <Link href="/wallet#time">Limits</Link></p>
    </section>
  );
}

/** One quiet, non-modal toast per unlock (at most). No sound, no motion with reduced-motion. */
export function AchievementToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let hide = 0;
    const flush = () => {
      const p = readProgress();
      const ids = pendingToasts(p);
      if (!ids.length) return;
      writeProgress(markToasted(p, ids));
      setMsg(toastText(ids));
      window.clearTimeout(hide);
      hide = window.setTimeout(() => setMsg(null), 5000);
    };
    flush();
    window.addEventListener(ACH_EVENT, flush);
    return () => { window.removeEventListener(ACH_EVENT, flush); window.clearTimeout(hide); };
  }, []);
  return (
    <div className="ach-toast-wrap" role="status" aria-live="polite">
      {msg && (
        <div className="ach-toast">
          <span className="ach-toast-dot" aria-hidden="true" />
          <span>{msg}</span>
          <Link href="/floor" className="ach-toast-link">See all</Link>
          <button type="button" className="ach-toast-x" aria-label="Dismiss" onClick={() => setMsg(null)}>×</button>
        </div>
      )}
    </div>
  );
}

/** Drop-in for pages outside the Shell (e.g. /rules). Records the visit; renders nothing. */
export function RecordAchievement({ kind }: { kind: "rules" }) {
  useEffect(() => { recordAchievement({ kind }); }, [kind]);
  return null;
}
