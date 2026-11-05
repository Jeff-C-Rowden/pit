"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Shell from "@/components/Shell";
import { blackjackResultLabel } from "@/lib/feel";
import PlayingCard from "@/components/PlayingCard";
import { ActionDock, ChipRow, OutcomeBanner, ReplayCard, ResultsStrip, cageHref, useHasPlayed, FirstVisitTip, useClearErrOnBalance } from "@/components/TableUX";
import { DealerBooth, TableHeart, TableSeat, botBlackjackHand, botHandValue, useTableSeats } from "@/components/Seating";
import LiveAnnounce from "@/components/LiveAnnounce";
import { api, money, useUser } from "@/components/useUser";
import { usePausedLabel } from "@/components/PauseStatus";

export default function BlackjackPage() {
  const { setUser } = useUser();
  const [game, setGame] = useState<any>(null);
  const [bet, setBet] = useState(1000);
  const [err, setErr] = useState<string | null>(null);
  useClearErrOnBalance(setErr);
  const [busy, setBusy] = useState(false);
  const [replay, setReplay] = useState<any>(null);
  const closeReplay = useCallback(() => setReplay(null), []);
  async function replayLast() {
    setErr(null);
    try {
      const d = await api("/api/replay?game=blackjack");
      if (!d.last) { setErr("No settled hand to replay yet."); return; }
      setReplay(d.last);
    } catch (e) { setErr(e instanceof Error ? e.message : "failed"); }
  }
  const settledFor = useRef<string | null>(null);

  async function load() {
    const d = await api("/api/games/blackjack");
    setGame(d.game);
    if (d.user) setUser(d.user);
  }
  useEffect(() => { load().catch((e) => setErr(e.message)); }, []);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setErr(null);
    setReplay(null);
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
  let hint = "Pick a chip, then Deal. Tap an empty chair to move.";
  if (game?.phase === "insurance") hint = "Dealer shows an Ace — insurance?";
  else if (game?.phase === "play") hint = "Hit or Stand. Double and split when offered.";
  else if (game?.phase === "settled") hint = "Hand is over. Deal the next one when you are ready.";

  return (
    <Shell>
      {(u) => (
        <BlackjackFelt
          u={u}
          replay={replay}
          closeReplay={closeReplay}
          replayLast={replayLast}
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

function BlackjackFelt({ u, replay, closeReplay, replayLast, game, bet, setBet, err, busy, act, betting, isPush, isWin, isLoss, result, hint, settledFor }: any) {
  const paused = usePausedLabel();
  const hasPlayed = useHasPlayed("blackjack", `${game?.id}-${game?.phase}`);
  const { occupants, setYouSeat, n, nudgeBot } = useTableSeats("blackjack", u.displayName, u.balanceCents);
  const dealerRank = game?.dealer?.cards?.[0]?.rank;
  const youBet = game?.playerHands?.reduce((s: number, h: any) => s + (h.betCents || 0), 0)
    || (game?.insuranceCents || 0)
    || (betting ? bet : 0);
  const canAfford = u.balanceCents >= bet;
  const openHand = game && game.phase !== "settled";
  const dealHint = betting && !canAfford
    ? "Add sandbox chips above to deal."
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
      <LiveAnnounce text={game?.phase === "settled" && result !== "hand closed" ? `Hand over: ${result}. ${(game.payoutCents || 0) > 0 ? `Paid ${money(game.payoutCents)}.` : "No payout."}` : null} />
      <ResultsStrip game="blackjack" refreshKey={`${game?.id}-${game?.phase}`} />
      <div className="felt-table seated bj-table">
        <DealerBooth>
          {game?.dealer?.value ? <div className="muted">Showing {game.dealer.value.total}</div> : null}
          <div className="hand">
            {game?.dealer?.cards?.map((c: any, i: number) => <PlayingCard key={i} card={c} />)}
          </div>
        </DealerBooth>
        <div className="bj-felt-rules" aria-label="Table rules: Blackjack pays 3 to 2. Dealer stands on all 17s. Insurance pays 2 to 1.">
          <svg viewBox="0 0 300 70" aria-hidden>
            <defs><path id="bjArc" d="M10,12 Q150,72 290,12" /></defs>
            <text className="bj-arc-big"><textPath href="#bjArc" startOffset="50%" textAnchor="middle">BLACKJACK PAYS 3 TO 2</textPath></text>
          </svg>
          <div className="bj-felt-sub">Dealer stands on all 17s · Insurance pays 2 to 1</div>
        </div>
        <TableHeart>
          {game?.phase === "insurance" && (
            <OutcomeBanner message="Dealer shows an Ace — insurance?" />
          )}
          {isWin && (
            <OutcomeBanner
              win
              title="YOU WIN"
              cageHref={cageHref("blackjack", game?.id)}
              amountCents={game.payoutCents}
              stakeCents={youBet}
              subtitle={`${money(game.payoutCents)} added to your stack`}
            />
          )}
          {isPush && (
            <OutcomeBanner
              push
              title="PUSH"
              cageHref={cageHref("blackjack", game?.id)}
              amountCents={game.payoutCents}
              subtitle={`${money(game.payoutCents || 0)} returned to your stack`}
            />
          )}
          {isLoss && (
            <OutcomeBanner
              title="DEALER WINS"
              cageHref={cageHref("blackjack", game?.id)}
              subtitle={blackjackResultLabel(result) || "You lost this hand."}
            />
          )}
          {game?.phase === "settled" && result === "hand closed" && (
            <OutcomeBanner
              title="HAND CLOSED"
              subtitle="Bets already taken stay taken. Deal when ready."
            />
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
              betAction={isYou && betting ? { label: canAfford ? `Your bet spot. Tap to deal a hand for ${money(bet)}` : `Your bet spot. ${money(bet)} is more than your balance`, onPress: () => act("deal"), disabled: busy || !canAfford } : undefined}
            />
          );
        })}
      </div>
      {/* r26: tip sits below the felt so the bet circle stays above the dock */}
      <FirstVisitTip game="blackjack" />
      <ActionDock hint={dealHint} busy={busy}>
        {err && <p className="err dock-err">{err}</p>}
        {betting && replay && (
          <ReplayCard onClose={closeReplay} cageHref={cageHref("blackjack", replay.ref)}>
            <div className="replay-bj">
              <div className="replay-hand"><span className="muted">Dealer {replay.dealer?.value?.total ?? ""}</span>
                <div className="hand">{replay.dealer?.cards?.map((c: any, i: number) => <PlayingCard key={i} card={c} size="sm" />)}</div></div>
              {replay.playerHands?.map((h: any, i: number) => (
                <div className="replay-hand" key={i}><span className="muted">You {h.value?.total}</span>
                  <div className="hand">{h.cards.map((c: any, j: number) => <PlayingCard key={j} card={c} size="sm" />)}</div></div>
              ))}
            </div>
            <div className="replay-h">{blackjackResultLabel(replay.result) || "Settled"} · bet {money(replay.stakeCents)} · paid {money(replay.payoutCents)}</div>
          </ReplayCard>
        )}
        {betting && !replay && hasPlayed && (
          <button type="button" className="rl-replay" onClick={replayLast} disabled={busy}>↺ Replay last result</button>
        )}
        {betting && (
          <>
            <ChipRow amounts={[500, 1000, 2500, 5000]} selected={bet} onSelect={setBet} minCents={100} maxCents={500_000} />
            <button
              className="btn primary hero-act"
              disabled={busy || !canAfford || !!paused}
              data-paused={paused ? "1" : undefined}
              title={!canAfford ? "Add sandbox chips above to deal." : undefined}
              onClick={() => act("deal")}
            >
              {paused || (busy ? "Dealing…" : game?.phase === "settled" ? "Next hand" : "Deal")}
            </button>{paused && <a className="paused-why" href="/wallet#time">Why is this paused?</a>}
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
