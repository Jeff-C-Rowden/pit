"use client";
/**
 * In-game tournament strip (Red Stag / WGS style): a translucent bar over the game with
 * "Bets to qualify / Bets made", rank, score and time left, plus an ⓘ sheet. Polls every 10 s
 * while visible; refreshed by each round response. Tournament chips only, no cash value.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, money } from "./useUser";

export type Hud = {
  id: string; name: string; game: string; mode: "balance" | "accumulated"; status: string; startsAt: string; endsAt: string; serverNow: string;
  prizeType: "cash" | "bonus"; entrants: number; qualifiedCount: number; poolCents: number; ladder: number[]; minBetCents: number; maxBetCents: number;
  minQualifyingBets: number; entered: boolean; rank: number | null; score: number; stackCents: number; betsMade: number; toQualify: number; qualified: boolean;
  prizeIfEndedNowCents: number; canRebuy: boolean; top: { rank: number; name: string; score: number; qualified: boolean }[];
  testAccount?: boolean; fixedPlays?: number | null; playsUsed?: number; playsLeft?: number | null; unit?: string;
};

export const scoreLabel = (mode: string, score: number) => (mode === "accumulated" ? `${(score / 100).toFixed(2)}×` : money(score));

export function timeLeft(ms: number): string {
  if (ms <= 0) return "Ended";
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}:${String(sec).padStart(2, "0")}`;
}

export function ModeBadge({ mode }: { mode: string }) {
  return (
    <span className={`tny-mode tny-mode-${mode}`} title={mode === "balance" ? "Balance: wins and losses count; highest stack at the end wins." : "Accumulated: only wins count, as a multiple of your bet. Losses never take points away."}>
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">{mode === "balance" ? <path d="M3 12h10M4 9.5h8M5 7h6M6 4.5h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /> : <path d="M3 13V10M6.5 13V7.5M10 13V5M13.5 13V2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}</svg>
      {mode === "balance" ? "Balance" : "Accumulated"}
    </span>
  );
}

export function PrizeBadge({ type }: { type: string }) {
  return <span className={`tny-prize tny-prize-${type}`}>{type === "bonus" ? "Bonus prize" : "Cash prize"}</span>;
}

export default function TournamentStrip({ tournamentId, hud, onHud }: { tournamentId: string; hud: Hud | null; onHud: (h: Hud) => void }) {
  const [open, setOpen] = useState(false);
  const [skew, setSkew] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      api(`/api/tournaments/${encodeURIComponent(tournamentId)}/me`).then((d) => { if (alive && d.tournament) onHud(d.tournament); }).catch(() => {});
    };
    load();
    const t = window.setInterval(load, 10_000);
    const c = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => { alive = false; window.clearInterval(t); window.clearInterval(c); };
  }, [tournamentId, onHud]);
  useEffect(() => { if (hud?.serverNow) setSkew(Date.parse(hud.serverNow) - Date.now()); }, [hud?.serverNow]);
  if (!hud) return <div className="tny-strip" role="status"><span>Loading tournament…</span></div>;
  const left = Date.parse(hud.endsAt) - (Date.now() + skew);
  const notStarted = Date.parse(hud.startsAt) > Date.now() + skew;
  const exitHref = typeof window !== "undefined" ? window.location.pathname : "/floor";
  return (
    <>
      <div className="tny-strip" role="status" aria-live="polite" data-testid="tny-strip">
        <ModeBadge mode={hud.mode} />
        {!hud.entered ? (
          <span>Not registered · <Link href={`/tournaments?id=${encodeURIComponent(hud.id)}`}>Register</Link></span>
        ) : (
          <>
            {hud.qualified ? <span className="tny-q ok">Qualified ✓</span> : <span className="tny-q">Remaining bets to qualify: <b data-testid="tny-toq">{hud.toQualify}</b></span>}
            <span>Bets made: <b data-testid="tny-made">{hud.betsMade}</b></span>
            {hud.fixedPlays ? <span>{hud.unit === "rolls" ? "Rolls" : "Hands"} left: <b data-testid="tny-left-plays">{hud.playsLeft}</b>/{hud.fixedPlays}</span> : null}
            {hud.testAccount ? <span className="tny-test" title="Test accounts never rank, count or win">Test account · not ranked</span> : <span>Rank <b>{hud.rank ?? "—"}</b>/{hud.entrants}</span>}
            <span>Score <b>{scoreLabel(hud.mode, hud.score)}</b></span>
          </>
        )}
        <span className="tny-left">{notStarted ? `Starts in ${timeLeft(Date.parse(hud.startsAt) - (Date.now() + skew))}` : `${timeLeft(left)} left`}</span>
        <button type="button" className="tny-info" aria-label="Tournament info" onClick={() => setOpen(true)}>i</button>
      </div>
      <p className="tny-strip-sub"><b>{hud.name}</b> · tournament chips, no cash value · <Link href={exitHref}>Back to Pit balance</Link></p>
      {open && (
        <div className="tny-sheet-scrim" onClick={() => setOpen(false)}>
          <div className="tny-sheet" role="dialog" aria-label={`${hud.name} info`} onClick={(e) => e.stopPropagation()}>
            <h3>{hud.name}</h3>
            <p><ModeBadge mode={hud.mode} /> <PrizeBadge type={hud.prizeType} /></p>
            <p className="muted">{hud.mode === "balance" ? "Everyone starts with the same stack. Wins add, losses subtract. Highest stack at the end wins." : "Only wins count. Each winning round adds its net win as a multiple of your bet, so a bigger bet doesn't mean a bigger score."}</p>
            <dl className="tny-dl">
              <div><dt>Time left</dt><dd>{notStarted ? "Not started" : timeLeft(left)}</dd></div>
              <div><dt>Your rank</dt><dd>{hud.rank ? `${hud.rank} of ${hud.entrants}` : "—"}</dd></div>
              <div><dt>Score</dt><dd>{scoreLabel(hud.mode, hud.score)}</dd></div>
              <div><dt>Tourney stack</dt><dd>{money(hud.stackCents)}</dd></div>
              <div><dt>Bets made / needed</dt><dd>{hud.betsMade} / {hud.minQualifyingBets}</dd></div>
              <div><dt>Bet limits</dt><dd>{money(hud.minBetCents)} – {money(hud.maxBetCents)}</dd></div>
              <div><dt>Prize pool</dt><dd>{money(hud.poolCents)} ({hud.prizeType === "bonus" ? "bonus" : "cash"})</dd></div>
              <div><dt>If it ended now</dt><dd>{hud.prizeIfEndedNowCents ? money(hud.prizeIfEndedNowCents) : "No prize yet"}</dd></div>
            </dl>
            <h4>Top 5</h4>
            <ol className="tny-top5">{hud.top.length ? hud.top.map((r) => <li key={r.rank} className={r.qualified ? "" : "nq"}>{r.name} · {scoreLabel(hud.mode, r.score)}{r.qualified ? "" : " · not qualified"}</li>) : <li>No entries yet</li>}</ol>
            <p className="muted">Same odds as the floor. Sandbox tournament chips, no cash value. <Link href={`/tournaments?id=${encodeURIComponent(hud.id)}`}>Leaderboard</Link> · <Link href="/rules#tournaments">Rules</Link></p>
            <button type="button" className="st-pill st-pill-gold" onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
