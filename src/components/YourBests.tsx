"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SandboxChip } from "@/components/SandboxChip";
import { useUser, money } from "@/components/useUser";
import { BESTS_COPY as C, bestsDate, type PersonalBests } from "@/lib/personalBests";

/**
 * SS4 — private "Your bests" for one machine: biggest win, bonuses triggered, spins/hands played,
 * read from the player's own ledger (GET /api/bests) each time the card is opened. A small button
 * until tapped; nothing pops up on its own, nothing is compared with anyone or counted down.
 */
export default function YourBests({ game }: { game: string }) {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PersonalBests | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setMsg(null);
    setData(null); // always show fresh figures, never the last open's
    fetch(`/api/bests?game=${encodeURIComponent(game)}`, { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (live) setData(d.bests as PersonalBests); })
      .catch(() => { if (live) setMsg("Couldn't load your figures. Try again in a moment."); });
    return () => { live = false; };
  }, [open, game]);
  if (!user) return null;
  if (!open) {
    return (
      <button ref={btn} type="button" className="tip-reopen yb-open" aria-expanded={false} data-testid="your-bests-open" onClick={() => setOpen(true)}>
        <span aria-hidden="true">i</span> {C.button}
      </button>
    );
  }
  const close = () => { setOpen(false); setTimeout(() => btn.current?.focus(), 0); };
  const d = data && data.machine === game ? data : null;
  return (
    <section className="yb" aria-label={`${C.title}${d ? ` · ${d.name}` : ""}`} data-testid="your-bests">
      <div className="yb-head">
        <h2 className="yb-title">{C.title}{d && <span className="yb-name"> · {d.name}</span>}</h2>
        <SandboxChip className="yb-sandbox" />
      </div>
      {msg && <p className="yb-empty" role="status">{msg}</p>}
      {!msg && !d && <p className="yb-empty" role="status">Loading…</p>}
      {d && d.count === 0 && <p className="yb-empty" data-testid="yb-empty">{C.noPlay}</p>}
      {d && d.count > 0 && (
        <dl className="yb-grid">
          <div className="yb-cell" data-testid="yb-win">
            <dt>Biggest win</dt>
            {d.biggestWin ? (
              <dd>
                <span className="yb-big">{money(d.biggestWin.cents)}</span>
                <small>{d.kind === "slot"
                  ? C.slotWinNote(money(d.biggestWin.betCents ?? 0), bestsDate(d.biggestWin.at))
                  : C.tableWinNote(d.biggestWin.betCents ? money(d.biggestWin.betCents) : null, bestsDate(d.biggestWin.at))}</small>
              </dd>
            ) : <dd><span className="yb-big yb-none">{C.noWin}</span></dd>}
          </div>
          <div className="yb-cell" data-testid="yb-bonus">
            <dt>Bonuses triggered</dt>
            {d.bonuses ? (
              <dd>
                <span className="yb-big">{d.bonuses.total.toLocaleString("en-US")}</span>
                {d.bonuses.byKind.length > 0 && <small>{d.bonuses.byKind.map((k) => `${k.name} ${k.count}`).join(" · ")}</small>}
              </dd>
            ) : <dd><small className="yb-na">{C.noBonusRound}</small></dd>}
          </div>
          <div className="yb-cell" data-testid="yb-count">
            <dt>{d.countLabel}</dt>
            <dd><span className="yb-big">{d.count.toLocaleString("en-US")}</span>{d.firstAt && <small>since {bestsDate(d.firstAt)}</small>}</dd>
          </div>
        </dl>
      )}
      <p className="yb-note">{C.private} {C.tourney}</p>
      <div className="yb-foot">
        <Link href="/wallet#time" className="yb-link">{C.limits}</Link>
        <span className="yb-help">Help: 1-800-GAMBLER · 21+</span>
        <button type="button" className="btn yb-close" onClick={close}>{C.close}</button>
      </div>
    </section>
  );
}
