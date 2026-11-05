"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { paigowResultLabel } from "@/lib/feel";
import PlayingCard from "@/components/PlayingCard";
import { ActionDock, ChipRow, OutcomeBanner, ResultsStrip, TableReplay } from "@/components/TableUX";
import { CARD_BACK, DealerBooth, TableHeart, TableSeat, botPaiGowCards, useTableSeats } from "@/components/Seating";
import { api, money, useUser } from "@/components/useUser";

export default function PaiGowPage() {
  const { setUser } = useUser();
  const [game, setGame] = useState<any>(null);
  const [bet, setBet] = useState(1000);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const d = await api("/api/games/paigow");
    setGame(d.game);
    if (d.user) setUser(d.user);
  }
  useEffect(() => { load().catch((e) => setErr(e.message)); }, []);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setErr(null);
    setBusy(true);
    try {
      const d = await api("/api/games/paigow", {
        method: "POST",
        body: JSON.stringify({ action, gameId: game?.id, betCents: bet, ...extra, idempotencyKey: crypto.randomUUID() }),
      });
      setGame(d.game);
      if (d.user) setUser(d.user);
      setSel([]);
    } catch (e) { setErr(e instanceof Error ? e.message : "failed"); }
    finally { setBusy(false); }
  }

  function toggle(i: number) {
    setSel((s) => s.includes(i) ? s.filter((x) => x !== i) : s.length < 2 ? [...s, i] : s);
  }

  function manualSet() {
    if (sel.length !== 2) { setErr("select exactly two cards for the low hand"); return; }
    const low = sel;
    const high = [0,1,2,3,4,5,6].filter((i) => !low.includes(i));
    act("set", { high, low });
  }

  const betting = !game || game.phase === "settled";
  const pay = game?.payoutCents ?? 0;
  const won = game?.phase === "settled" && pay > (game?.betCents || 0);
  const push = game?.phase === "settled" && pay > 0 && pay <= (game?.betCents || pay);
  const lost = game?.phase === "settled" && pay === 0;
  let hint = "Pick a chip, then Deal. Tap an empty chair to move.";
  if (game?.phase === "set") hint = "Set high 5 and low 2, or tap House way.";
  else if (game?.phase === "settled") hint = "Hand is over. Deal the next one when you are ready.";

  return (
    <Shell>
      {(u) => (
        <PaiGowFelt
          u={u} game={game} bet={bet} setBet={setBet} err={err} sel={sel} busy={busy}
          act={act} toggle={toggle} manualSet={manualSet} betting={betting}
          pay={pay} won={won} push={push} lost={lost} hint={hint}
        />
      )}
    </Shell>
  );
}

function PaiGowFelt({ u, game, bet, setBet, err, sel, busy, act, toggle, manualSet, betting, pay, won, push, lost, hint }: any) {
  const { occupants, setYouSeat, n } = useTableSeats("paigow", u.displayName, u.balanceCents);
  return (
    <>
      <div className="hero game-hero pg-hero">
        <p className="lede">House banks · 5% commission on wins · 6 seats</p>
        <h1 style={{ fontSize: 48 }}>Pai Gow Poker</h1>
      </div>
      <ResultsStrip game="paigow" refreshKey={`${game?.id}-${game?.phase}`} />
      {err && <p className="err">{err}</p>}
      <div className="felt-table seated felt-rect bj-table pg-table">
        <DealerBooth>
          <div className="muted">Dealer high / low</div>
          {!(game?.dealerHigh || game?.dealerCards || []).length && (
            <div className="pg-ghost-hands" aria-label="Dealer will set a five-card high hand and a two-card low hand">
              <div className="pg-ghost-row"><span className="pg-ghost-lbl">High · 5</span>{[0,1,2,3,4].map((i) => <span key={i} className="pg-ghost-card" aria-hidden />)}</div>
              <div className="pg-ghost-row"><span className="pg-ghost-lbl">Low · 2</span>{[0,1].map((i) => <span key={i} className="pg-ghost-card" aria-hidden />)}</div>
            </div>
          )}
          <div className="hand">{(game?.dealerHigh || game?.dealerCards || []).map((c: any, i: number) => <PlayingCard key={"d"+i} card={c} size="sm" />)}</div>
          {game?.dealerLow && <div className="hand" style={{ marginTop: 8 }}>{game.dealerLow.map((c: any, i: number) => <PlayingCard key={"dl"+i} card={c} size="sm" />)}</div>}
        </DealerBooth>
        <TableHeart>
          {game?.result ? <p className="rail-label">{game.result}</p> : (
            <div className="bj-felt-rules pg-felt-rules" aria-label="Table rules: Win both hands to win. Ties, called copies, go to the house. 5% commission on wins. The joker plays as an ace, or fills a straight or flush.">
              <svg viewBox="0 0 300 70" aria-hidden>
                <defs><path id="pgArc" d="M10,12 Q150,72 290,12" /></defs>
                <text className="bj-arc-big"><textPath href="#pgArc" startOffset="50%" textAnchor="middle">WIN BOTH HANDS TO WIN</textPath></text>
              </svg>
              <div className="bj-felt-sub">Ties (copies) go to the house</div>
              <div className="bj-felt-sub">5% commission on wins</div>
              <div className="bj-felt-sub">Joker: ace, straight or flush</div>
            </div>
          )}
          {won && (
            <OutcomeBanner
              win
              title="YOU WIN"
              amountCents={pay}
              stakeCents={game.betCents}
              subtitle={`You won ${money(pay)}${game.commissionCents ? ` (commission ${money(game.commissionCents)})` : ""} — added to your stack`}
            />
          )}
          {push && !won && (
            <OutcomeBanner
              push
              title="PUSH"
              amountCents={pay}
              subtitle={`${money(pay || 0)} returned to your stack`}
            />
          )}
          {lost && (
            <OutcomeBanner
              title="HOUSE WINS"
              subtitle={game.result || "You lost this hand."}
            />
          )}
        </TableHeart>
        {occupants.map((occ) => {
          const isYou = occ.kind === "you";
          let cards: any[] | undefined;
          let betCents = 0;
          if (isYou) {
            betCents = game?.betCents || (betting ? bet : 0);
            if (game?.playerHigh) cards = [...game.playerHigh, ...(game.playerLow || [])];
            else if (game?.phase === "set") cards = game.playerCards;
          } else if (occ.kind === "bot" && game) {
            betCents = 1000;
            const dealt = botPaiGowCards(`${game.id}-${occ.seat}`, game.phase === "settled");
            if (Array.isArray(dealt)) cards = Array.from({ length: 7 }, () => CARD_BACK);
            else cards = [...dealt.high, ...dealt.low];
          }
          return (
            <TableSeat
              key={occ.seat}
              occ={occ}
              layout="paigow"
              total={n}
              cards={cards}
              betCents={betCents}
              onSit={setYouSeat}
              winning={isYou && won}
            />
          );
        })}
      </div>
      {game?.phase === "set" && (
        <div className="hero-hole">
          <div className="muted">Tap two cards for the low hand</div>
          <div className="hand" style={{ flexWrap: "wrap" }}>
            {game.playerCards.map((c: any, i: number) => (
              <div key={i} onClick={() => toggle(i)} style={{ outline: sel.includes(i) ? "2px solid var(--gold)" : undefined, cursor: "pointer" }}>
                <PlayingCard card={c} size="lg" />
              </div>
            ))}
          </div>
        </div>
      )}
      <ActionDock hint={hint} busy={busy}>
        <TableReplay game="paigow" show={betting} resetKey={`${game?.id}-${game?.phase}`} render={(r) => (
          <>
            <div className="replay-bj">
              <div className="replay-hand"><span className="muted">Your high · low</span>
                <div className="hand">{(r.playerHigh || []).map((c: any, i: number) => <PlayingCard key={i} card={c} size="sm" />)}<span className="replay-gap" />{(r.playerLow || []).map((c: any, i: number) => <PlayingCard key={i} card={c} size="sm" />)}</div></div>
              <div className="replay-hand"><span className="muted">Dealer high · low</span>
                <div className="hand">{(r.dealerHigh || []).map((c: any, i: number) => <PlayingCard key={i} card={c} size="sm" />)}<span className="replay-gap" />{(r.dealerLow || []).map((c: any, i: number) => <PlayingCard key={i} card={c} size="sm" />)}</div></div>
            </div>
            <div className="replay-h">{paigowResultLabel(r.result)} · bet {money(r.stakeCents)} · paid {money(r.payoutCents)}</div>
          </>
        )} />
        {betting && (
          <>
            <ChipRow amounts={[500, 1000, 2500, 5000]} selected={bet} onSelect={setBet} minCents={500} maxCents={500_000} />
            <button className="btn primary hero-act" disabled={busy} onClick={() => act("deal")}>
              {busy ? "Dealing…" : game?.phase === "settled" ? "Next hand" : "Deal"}
            </button>
          </>
        )}
        {game?.phase === "set" && (
          <>
            <button className="btn felt" disabled={busy} onClick={() => act("houseway")}>House way</button>
            <button className="btn primary hero-act" disabled={busy} onClick={manualSet}>Set selected as low</button>
          </>
        )}
      </ActionDock>
    </>
  );
}
