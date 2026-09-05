"use client";
import { useEffect, useRef, useState } from "react";
import Shell from "@/components/Shell";
import PlayingCard from "@/components/PlayingCard";
import { ActionDock, ChipRow, OutcomeBanner } from "@/components/TableUX";
import { DealerBooth, TableHeart, TableSeat, botBlackjackHand, botHandValue, useTableSeats } from "@/components/Seating";
import { api, money, useUser } from "@/components/useUser";

export default function BlackjackPage() {
  const { setUser } = useUser();
  const [game, setGame] = useState<any>(null);
  const [bet, setBet] = useState(1000);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const settledFor = useRef<string | null>(null);

  async function load() {
    const d = await api("/api/games/blackjack");
    setGame(d.game);
    if (d.user) setUser(d.user);
  }
  useEffect(() => { load().catch((e) => setErr(e.message)); }, []);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setErr(null);
    setBusy(true);
    try {
      const d = await api("/api/games/blackjack", {
        method: "POST",
        body: JSON.stringify({ action, gameId: game?.id, betCents: bet, ...extra, idempotencyKey: crypto.randomUUID() }),
      });
      setGame(d.game);
      if (d.user) setUser(d.user);
    } catch (e) { setErr(e instanceof Error ? e.message : "failed"); }
    finally { setBusy(false); }
  }

  const betting = !game || game.phase === "settled";
  const result = String(game?.result || "");
  const isPush = result.includes("push") && !result.includes("win") && !result.includes("blackjack");
  const isWin = game?.phase === "settled" && (game.payoutCents || 0) > 0 && !isPush;
  const isLoss = game?.phase === "settled" && !isWin && !isPush && result !== "hand closed";
  let hint = "Pick a bet, then Deal. Click an empty chair to sit.";
  if (game?.phase === "insurance") hint = "Dealer shows an Ace — insurance?";
  else if (game?.phase === "play") hint = "Hit or Stand. Double and split when offered.";
  else if (game?.phase === "settled") hint = "Hand is over. Deal the next one when you are ready.";

  return (
    <Shell>
      {(u) => (
        <BlackjackFelt
          u={u}
          game={game}
          bet={bet}
          setBet={setBet}
          err={err}
          busy={busy}
          act={act}
          betting={betting}
          isPush={isPush}
          isWin={isWin}
          isLoss={isLoss}
          result={result}
          hint={hint}
          settledFor={settledFor}
        />
      )}
    </Shell>
  );
}

function BlackjackFelt({ u, game, bet, setBet, err, busy, act, betting, isPush, isWin, isLoss, result, hint, settledFor }: any) {
  const { occupants, setYouSeat, n, nudgeBot } = useTableSeats("blackjack", u.displayName, u.balanceCents);
  const dealerRank = game?.dealer?.cards?.[0]?.rank;
  const youBet = game?.playerHands?.reduce((s: number, h: any) => s + (h.betCents || 0), 0)
    || (game?.insuranceCents || 0)
    || (betting ? bet : 0);
  const canAfford = u.balanceCents >= bet;
  const openHand = game && game.phase !== "settled";
  const dealHint = betting && !canAfford
    ? "Cage needs funds first — open Cage and add test money."
    : hint;

  useEffect(() => {
    if (!game || game.phase !== "settled") return;
    if (settledFor.current === game.id) return;
    settledFor.current = game.id;
    const dealerTotal = game.dealer?.value?.total;
    for (const o of occupants) {
      if (o.kind !== "bot") continue;
      const cards = botBlackjackHand(`${game.id}-${o.seat}`, dealerRank, true);
      const v = botHandValue(cards);
      const b = 1000;
      let delta = -b;
      if (typeof dealerTotal === "number") {
        if (v.total > 21) delta = -b;
        else if (dealerTotal > 21 || v.total > dealerTotal) delta = b;
        else if (v.total === dealerTotal) delta = 0;
      }
      if (delta) nudgeBot(o.seat, delta);
    }
  }, [game, occupants, nudgeBot, dealerRank, settledFor]);

  return (
    <>
      <div className="rail-label" style={{ marginTop: 20 }}>Blackjack · 7-spot · 6 decks · S17 · 3:2</div>
      <div className="felt-table seated bj-table">
        <DealerBooth>
          <div className="muted">Dealer {game?.dealer?.value ? `(${game.dealer.value.total})` : ""}</div>
          <div className="hand">
            {game?.dealer?.cards?.map((c: any, i: number) => <PlayingCard key={i} card={c} />)}
          </div>
        </DealerBooth>
        <TableHeart>
          {game?.phase === "insurance" && (
            <OutcomeBanner message="Dealer shows an Ace — insurance?" />
          )}
          {isWin && <OutcomeBanner win amountCents={game.payoutCents} message={`You won ${money(game.payoutCents)} — added to your stack`} />}
          {isPush && <OutcomeBanner push amountCents={game.payoutCents} />}
          {isLoss && <OutcomeBanner message={result || "You lost this hand."} />}
          {game?.phase === "settled" && result === "hand closed" && (
            <OutcomeBanner message="Hand closed — bets already taken stay taken. Deal when ready." />
          )}
        </TableHeart>
        {occupants.map((occ) => {
          const isYou = occ.kind === "you";
          let cards: any[] | undefined;
          let betCents = 0;
          let status: string | undefined;
          if (isYou) {
            cards = game?.playerHands?.flatMap((h: any) => h.cards);
            betCents = youBet;
            const h = game?.playerHands?.[game.active] || game?.playerHands?.[0];
            if (h?.value) status = `${h.value.total}${h.value.soft ? " soft" : ""}`;
          } else if (occ.kind === "bot" && game) {
            const hit = game.phase === "play" || game.phase === "settled" || game.phase === "dealer" || game.phase === "insurance";
            cards = botBlackjackHand(`${game.id}-${occ.seat}`, dealerRank, hit);
            betCents = 1000;
            const v = botHandValue(cards);
            status = v.total > 21 ? "bust" : String(v.total);
          }
          return (
            <TableSeat
              key={occ.seat}
              occ={occ}
              layout="blackjack"
              total={n}
              cards={cards}
              betCents={betCents}
              status={status}
              onSit={setYouSeat}
              winning={isYou && isWin}
            />
          );
        })}
      </div>
      <ActionDock hint={dealHint}>
        {err && <p className="err dock-err">{err}</p>}
        {betting && (
          <>
            <ChipRow amounts={[500, 1000, 2500, 5000]} selected={bet} onSelect={setBet} />
            <button
              className="btn primary hero-act"
              disabled={busy || !canAfford}
              title={!canAfford ? "Cage needs funds first — open Cage and add test money." : undefined}
              onClick={() => act("deal")}
            >
              {game?.phase === "settled" ? "Next hand" : "Deal"}
            </button>
          </>
        )}
        {game?.phase === "insurance" && (
          <>
            <button className="btn" disabled={busy} onClick={() => act("insurance", { take: true })}>Insurance</button>
            <button className="btn primary hero-act" disabled={busy} onClick={() => act("insurance", { take: false })}>No insurance</button>
          </>
        )}
        {game?.phase === "play" && (
          <>
            <button className="btn felt" disabled={busy} onClick={() => act("hit")}>Hit</button>
            <button className="btn primary hero-act" disabled={busy} onClick={() => act("stand")}>Stand</button>
            {game.canDouble && <button className="btn" disabled={busy} onClick={() => act("double")}>Double</button>}
            {game.canSplit && <button className="btn" disabled={busy} onClick={() => act("split")}>Split</button>}
          </>
        )}
        {openHand && (
          <button className="btn" disabled={busy} onClick={() => act("abandon")}>
            Leave hand
          </button>
        )}
      </ActionDock>
    </>
  );
}
