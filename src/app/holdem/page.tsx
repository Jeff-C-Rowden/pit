"use client";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import PlayingCard from "@/components/PlayingCard";
import { ActionDock, ChipStack, OutcomeBanner } from "@/components/TableUX";
import { CARD_BACK, TableHeart, TableSeat, useTableSeats } from "@/components/Seating";
import { api, money, useUser } from "@/components/useUser";

export default function HoldemPage() {
  const { setUser } = useUser();
  const [game, setGame] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flyPot, setFlyPot] = useState<number | null>(null);

  async function load() {
    const d = await api("/api/games/holdem");
    setGame(d.game);
    if (d.user) setUser(d.user);
  }
  useEffect(() => { load().catch((e) => setErr(e.message)); }, []);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setErr(null);
    setBusy(true);
    try {
      const d = await api("/api/games/holdem", {
        method: "POST",
        body: JSON.stringify({ action, gameId: game?.id, ...extra, idempotencyKey: crypto.randomUUID() }),
      });
      setGame(d.game);
      if (d.user) setUser(d.user);
      if (d.game?.winner === "player" && d.game.payoutCents > 0) setFlyPot(d.game.payoutCents);
      else setFlyPot(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "failed"); }
    finally { setBusy(false); }
  }

  const live = game && game.street !== "showdown" && game.street !== "folded";
  const bb = game?.blinds?.bb ?? 200;
  const toCall = game?.toCall || 0;
  const minRaiseTo = game?.minRaiseTo || bb;
  const pot = game?.pot || 0;
  const raising = !!(game && game.currentBet);

  let hint = "Sit anywhere empty. Post the blinds, then play the hand.";
  if (live && game.toAct === "player") hint = "Your action — Fold, Check/Call, or Bet/Raise stay in the same slots.";
  else if (live && game.toAct === "house") hint = "House to act…";
  else if (game && !live) hint = "Hand is over. Next hand when you are ready.";

  const won = game && !live && game.winner === "player";
  const split = game && !live && game.winner === "split";
  const lost = game && !live && game.winner === "house";

  return (
    <Shell>
      {(u) => (
        <HoldemFelt
          u={u}
          game={game}
          err={err}
          busy={busy}
          act={act}
          flyPot={flyPot}
          live={live}
          bb={bb}
          toCall={toCall}
          minRaiseTo={minRaiseTo}
          pot={pot}
          raising={raising}
          hint={hint}
          won={won}
          split={split}
          lost={lost}
        />
      )}
    </Shell>
  );
}

function HoldemFelt({ u, game, err, busy, act, flyPot, live, bb, toCall, minRaiseTo, pot, raising, hint, won, split, lost }: any) {
  const { occupants, youSeat, setYouSeat, n, villainSeat } = useTableSeats("holdem", u.displayName, u.balanceCents);
  const maxTo = (game?.playerBet || 0) + (u.balanceCents || 0);
  const [raiseTo, setRaiseTo] = useState(minRaiseTo);

  useEffect(() => {
    const lo = minRaiseTo;
    const hi = Math.max(lo, maxTo);
    setRaiseTo((v: number) => Math.min(hi, Math.max(lo, v || lo)));
  }, [minRaiseTo, maxTo, game?.id, game?.street]);

  function sizeAmt(kind: "half" | "threeq" | "pot" | "allin") {
    if (kind === "allin") return Math.max(0, maxTo);
    if (!raising) {
      if (kind === "half") return Math.max(bb, Math.floor(pot / 2) || bb);
      if (kind === "threeq") return Math.max(bb, Math.floor((pot * 3) / 4) || bb);
      return Math.max(bb, pot || bb);
    }
    if (kind === "half") return Math.max(minRaiseTo, game.currentBet + Math.max(bb, Math.floor(pot / 2)));
    if (kind === "threeq") return Math.max(minRaiseTo, game.currentBet + Math.max(bb, Math.floor((pot * 3) / 4)));
    return Math.max(minRaiseTo, game.currentBet + pot + toCall);
  }

  const canRaise = maxTo >= minRaiseTo;
  const sliderMax = Math.max(minRaiseTo, maxTo);
  const sliderMin = Math.min(minRaiseTo, sliderMax);

  const hole = game?.playerHole || [];
  const board = game?.board || [];
  const youActing = live && game.toAct === "player";
  const houseActing = live && game.toAct === "house";
  const houseFolded = !live && game?.result === "You folded" ? false : game?.winner === "player" && String(game?.result || "").toLowerCase().includes("folded");

  return (
    <>
      <div className="rail-label" style={{ marginTop: 20 }}>Texas Hold&apos;em · 8-max felt · $1 / $2 NL · house banks</div>
      {err && <p className="err" style={{ textAlign: "center" }}>{err}</p>}
      <div className="felt-table seated holdem-table">
        {flyPot != null && won && (
          <div className="pot-fly">
            <ChipStack cents={flyPot} size={32} showTotal={false} winning />
          </div>
        )}
        <TableHeart>
          <div className="hand">
            {board.map((c: any, i: number) => <PlayingCard key={i} card={c} />)}
          </div>
          <ChipStack cents={pot} size={36} winning={!!won} />
          <p className="pot-meta">Pot {game ? money(game.pot) : "$0.00"} · {game?.street || "waiting"}</p>
          {live && <p className="pot-meta">To call {money(toCall)}</p>}
        </TableHeart>
        {occupants.map((occ) => {
          const isYou = occ.kind === "you";
          const isVillain = occ.seat === villainSeat && occ.kind !== "you";
          const isOtherBot = occ.kind === "bot" && !isVillain;
          let cards: any[] | undefined;
          let betCents = 0;
          let folded = false;
          let status: string | undefined;
          let dealer = false;
          let blind: "SB" | "BB" | null = null;
          let acting = false;
          if (game) {
            dealer = game.buttonIsPlayer ? isYou : isVillain;
            if (game.buttonIsPlayer) {
              if (isYou) blind = "SB";
              if (isVillain) blind = "BB";
            } else {
              if (isVillain) blind = "SB";
              if (isYou) blind = "BB";
            }
          }
          if (isYou && hole.length) {
            betCents = live ? (game.playerBet || 0) : 0;
            acting = !!youActing;
            if (game?.playerHandName) status = game.playerHandName;
            if (!live && game?.winner === "house" && game?.result === "You folded") {
              folded = true;
              status = "Fold";
            }
          } else if (isVillain && live) {
            cards = [CARD_BACK, CARD_BACK];
            betCents = game.houseBet || 0;
            acting = !!houseActing;
          } else if (isVillain && game && !live) {
            if (houseFolded) {
              folded = true;
              status = "Fold";
            } else if (game.houseHole) {
              cards = game.houseHole;
              if (game.houseHandName) status = game.houseHandName;
            } else {
              cards = [CARD_BACK, CARD_BACK];
            }
          } else if (isOtherBot && game) {
            folded = true;
            status = "Fold";
          }
          return (
            <TableSeat
              key={occ.seat}
              occ={occ}
              layout="holdem"
              total={n}
              cards={cards}
              betCents={betCents}
              dealer={dealer}
              blind={blind}
              acting={acting}
              folded={folded}
              status={status}
              onSit={setYouSeat}
              winning={isYou && !!won}
            />
          );
        })}
      </div>
      {won && (
        <OutcomeBanner
          win
          title="YOU WIN"
          amountCents={game.payoutCents}
          subtitle={`${money(game.payoutCents)} — pot added to your stack`}
        />
      )}
      {split && (
        <OutcomeBanner
          push
          title="SPLIT"
          amountCents={game.payoutCents}
          subtitle={`Split pot — ${money(game.payoutCents)} returned to your stack`}
        />
      )}
      {lost && (
        <OutcomeBanner
          win={false}
          title="HOUSE WINS"
          subtitle={
            game.result === "You folded"
              ? "You folded. The house takes the pot."
              : (game.result || "House takes the pot.")
          }
        />
      )}
      {game?.log && <div className="panel log" style={{ marginTop: 16 }}>{game.log.map((l: string, i: number) => <div key={i}>{l}</div>)}</div>}
      <ActionDock hint={hint} busy={busy}>
        {hole.length > 0 && (
          <div className="hero-hole in-dock">
            <div className="hand hole-fan">
              {hole.map((c: any, i: number) => (
                <PlayingCard key={i} card={c} size="lg" />
              ))}
            </div>
            {youActing && <p className="your-action">Your action</p>}
          </div>
        )}
        {(!game || !live) && (
          <button className="btn primary hero-act" disabled={busy} onClick={() => act("deal")}>
            {busy ? "Dealing…" : game && !live ? "Next hand" : "Deal"}
          </button>
        )}
        {live && game.toAct === "house" && <span className="muted">House to act…</span>}
        {live && game.toAct === "player" && (
          <div className="he-dock">
            <div className="he-sizes">
              <button type="button" className="btn" disabled={busy || !canRaise} onClick={() => setRaiseTo(Math.min(sliderMax, sizeAmt("half")))}>1/2 pot</button>
              <button type="button" className="btn" disabled={busy || !canRaise} onClick={() => setRaiseTo(Math.min(sliderMax, sizeAmt("threeq")))}>3/4 pot</button>
              <button type="button" className="btn" disabled={busy || !canRaise} onClick={() => setRaiseTo(Math.min(sliderMax, sizeAmt("pot")))}>Pot</button>
              <button type="button" className="btn" disabled={busy || maxTo <= 0} onClick={() => setRaiseTo(sizeAmt("allin"))}>All-in</button>
            </div>
            <div className="he-slider">
              <input
                type="range"
                min={sliderMin}
                max={sliderMax}
                step={bb}
                value={Math.min(sliderMax, Math.max(sliderMin, raiseTo))}
                onChange={(e) => setRaiseTo(Number(e.target.value))}
                disabled={busy || !canRaise}
              />
              <span className="mono">{money(raiseTo)}</span>
            </div>
            <div className="he-slots">
              <div className="he-slot fold">
                <button type="button" className="btn" disabled={busy} onClick={() => act("fold")}>Fold</button>
              </div>
              <div className="he-slot call">
                {toCall > 0
                  ? <button type="button" className="btn" disabled={busy} onClick={() => act("call")}>Call {money(toCall)}</button>
                  : <button type="button" className="btn" disabled={busy} onClick={() => act("check")}>Check</button>}
              </div>
              <div className="he-slot bet">
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !canRaise}
                  onClick={() => act(raising ? "raise" : "bet", { amountCents: raiseTo })}
                >
                  {raising ? "Raise to" : "Bet"} {money(raiseTo)}
                </button>
              </div>
            </div>
          </div>
        )}
      </ActionDock>
    </>
  );
}
