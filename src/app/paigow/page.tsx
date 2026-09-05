"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import PlayingCard from "@/components/PlayingCard";
import { ActionDock, ChipRow, OutcomeBanner } from "@/components/TableUX";
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
  let hint = "Pick a bet, then Deal. Click an empty chair to sit.";
  if (game?.phase === "set") hint = "Set high (5) and low (2), or play the house way.";
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
      <div className="hero" style={{ paddingTop: 24 }}>
        <p className="lede">House banks · 5% commission on wins · 6 seats</p>
        <h1 style={{ fontSize: 48 }}>Pai Gow Poker</h1>
      </div>
      {err && <p className="err">{err}</p>}
      <div className="felt-table seated felt-rect bj-table">
        <DealerBooth>
          <div className="muted">Dealer high / low</div>
          <div className="hand">{(game?.dealerHigh || game?.dealerCards || []).map((c: any, i: number) => <PlayingCard key={"d"+i} card={c} size="sm" />)}</div>
          {game?.dealerLow && <div className="hand" style={{ marginTop: 8 }}>{game.dealerLow.map((c: any, i: number) => <PlayingCard key={"dl"+i} card={c} size="sm" />)}</div>}
        </DealerBooth>
        <TableHeart>
          <p className="rail-label">{game?.result || "Set high (5) and low (2). Both must beat the house."}</p>
          {won && (
            <OutcomeBanner
              win
              amountCents={pay}
              message={`You won ${money(pay)}${game.commissionCents ? ` (commission ${money(game.commissionCents)})` : ""} — added to your stack`}
            />
          )}
          {push && !won && <OutcomeBanner push amountCents={pay} />}
          {lost && <OutcomeBanner message={game.result || "You lost this hand."} />}
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
      <ActionDock hint={hint}>
        {betting && (
          <>
            <ChipRow amounts={[500, 1000, 2500, 5000]} selected={bet} onSelect={setBet} />
            <button className="btn primary hero-act" disabled={busy} onClick={() => act("deal")}>
              {game?.phase === "settled" ? "Next hand" : "Deal"}
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
