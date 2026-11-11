"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Shell from "@/components/Shell";
import BuckshotMachine, { type BuckshotHandle } from "@/components/BuckshotMachine";
import { OutcomeBanner, FirstVisitTip, useClearErrOnBalance } from "@/components/TableUX";
import { MathStrip } from "@/components/VolatilityMeter";
import { api, money, useUser } from "@/components/useUser";
import { BB_DENOMS, BB_MAX_COINS, type BbSymbol } from "@/lib/games/buckshot";
import { slotGlowTier, soundOn, reducedMotion, playSpin } from "@/lib/feel";
import { SLOT_TURBO_KEY, slotTurboEffective } from "@/lib/slotFeel";
import { CabinetDeck, CabinetLever, CabinetTopper, useAutoSpin } from "@/components/SlotCabinet";
import { ledText } from "@/lib/cabinet";
import { AntlerShoe } from "@/components/WesternArt";
import { WalletSplit } from "@/components/WalletSplit";
import TournamentStrip from "@/components/TournamentStrip";
import SpinNotice from "@/components/SpinNotice";

const denomLabel = (c: number) => (c < 100 ? `${c}¢` : `$${c / 100}`);

export type BuckshotVariant = "buckshot" | "bounty";

const VARIANTS = {
  buckshot: { api: "/api/games/buckshot", title: "Buckshot Bars", lede: "Classic 3-reel slot", kicker: "Classic · 1 line · 3 coins", math: "buckshot" },
  bounty: { api: "/api/games/bounty", title: "Bounty Bars", lede: "Bonus to Cash · classic 3-reel slot", kicker: "Bonus to Cash · 1 line · 3 coins", math: "bounty" },
} as const;

export default function BuckshotGame({ variant = "buckshot", tournamentId = null }: { variant?: BuckshotVariant; tournamentId?: string | null }) {
  const V = VARIANTS[variant];
  const { setUser } = useUser();
  const [info, setInfo] = useState<any>(null);
  const [spin, setSpin] = useState<any>(null);
  const [win, setWin] = useState<BbSymbol[][] | null>(null);
  const [coins, setCoins] = useState(1);
  const [denomIdx, setDenomIdx] = useState(1);
  const denom = BB_DENOMS[denomIdx]!;
  const [err, setErr] = useState<string | null>(null);
  useClearErrOnBalance(setErr);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [showOutcome, setShowOutcome] = useState(false);
  const [feelLive, setFeelLive] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [spins, setSpins] = useState(0);
  const [paid, setPaid] = useState(0);
  const winRef = useRef(0);
  const machineRef = useRef<BuckshotHandle>(null);
  const balRef = useRef(0);
  const [settleTick, setSettleTick] = useState(0);
  const [funding, setFunding] = useState<{ funded: { cashCents: number; bonusCents: number }; paid: { cashCents: number; bonusCents: number; convertedCents: number } | null } | null>(null);
  const [tourney, setTourney] = useState<any>(null);

  useEffect(() => {
    const f = () => setFeelLive(soundOn() && !reducedMotion());
    f(); window.addEventListener("pit-sound", f);
    return () => window.removeEventListener("pit-sound", f);
  }, []);
  useEffect(() => {
    try { setTurbo(localStorage.getItem(SLOT_TURBO_KEY) === "1"); } catch { /* ignore */ }
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  useEffect(() => {
    api(V.api).then((d) => setInfo(d.info)).catch((e) => setErr(e.message));
  }, []);
  const turboOn = slotTurboEffective(turbo, reduced);
  const betCents = coins * denom;

  const auto = useAutoSpin({
    settleTick,
    spinOnce: () => void go(),
    balanceCents: useCallback(() => balRef.current, []),
    costCents: betCents,
    jackpot: useCallback(() => false, []),
  });

  const onSpinComplete = useCallback(() => {
    setPaid((p) => p + winRef.current);
    winRef.current = 0;
    setSpinning(false);
    setBusy(false);
    setShowOutcome(true);
    setSettleTick((n) => n + 1);
  }, []);

  async function go(coinsOverride?: number) {
    if (busy || spinning) return;
    const c = coinsOverride ?? coins;
    setErr(null);
    setBusy(true);
    setShowOutcome(false);
    setWin(null);
    setSpinning(true);
    playSpin();
    try {
      const d = await api(V.api, {
        method: "POST",
        body: JSON.stringify({ coins: c, denomCents: denom, idempotencyKey: crypto.randomUUID(), ...(tournamentId ? { tournamentId } : {}) }),
      });
      setFunding(d.funded ? { funded: d.funded, paid: d.paid } : null);
      if (d.tournament) setTourney(d.tournament);
      winRef.current = d.spin.winCents || 0;
      setSpin(d.spin);
      setWin(d.spin.window as BbSymbol[][]);
      setSpins((n) => n + 1);
      if (d.user) setUser(d.user);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
      auto.fail();
      setSpinning(false);
      setBusy(false);
    }
  }

  function onPrimary() {
    if (spinning) {
      machineRef.current?.stopAll();
      if (auto.running) auto.cancel();
      return;
    }
    if (auto.running) { auto.cancel(); return; }
    void go();
  }

  /** PLAY MAX: three coins at the current coin value, then spin (max is only 3 × coin). */
  function onPlayMax() {
    if (busy || spinning) return;
    setCoins(BB_MAX_COINS);
    void go(BB_MAX_COINS);
  }

  const won = !!(showOutcome && spin && spin.winCents > 0);
  const stake = spin?.betCents ?? betCents;

  return (
    <Shell>
      {(u) => { const credit = tournamentId ? (tourney?.stackCents ?? 0) : u.balanceCents + (u.bonusCents ?? 0); balRef.current = credit; return (
        <div className={`slot-page bb-page${variant === "bounty" ? " bb-bounty" : ""}`}>
          <div className="slot-page-hero">
            <p className="lede">{V.lede}</p>
            <h1>{V.title}</h1>
            <p className="muted">1 payline · play 1–3 coins</p>
            {variant === "bounty" && <p className="b2c-badge-row"><span className="b2c-badge">Bonus to Cash</span> <span className="muted">Bonus-funded bets pay their winnings in cash. Bets draw from Bonus first.</span></p>}
            <MathStrip game={V.math} variant="hero" />
          </div>
          {tournamentId && <TournamentStrip tournamentId={tournamentId} hud={tourney} onHud={setTourney} />}
          <FirstVisitTip game="buckshot" />

          <div className="slot-stage-wrap">
            <BuckshotMachine
              ref={machineRef}
              window={win}
              spinning={spinning}
              turbo={turboOn}
              reduced={reduced}
              onSpinComplete={onSpinComplete}
              glow={showOutcome && spin ? slotGlowTier(stake, spin.winCents) : 0}
              glowLive={feelLive}
              won={won}
              topper={
                <CabinetTopper
                  title={V.title}
                  kicker={V.kicker}
                  emblem={<AntlerShoe size={40} />}
                  info={<>Coins played: {coins} of {BB_MAX_COINS} · Spins this visit: {spins} · Horseshoe is wild</>}
                />
              }
              side={
                <>
                  <div className="bb-play-sign"><span>Play</span><b>3</b><span>coins</span><small>for top award</small></div>
                  <div className="bb-arrow">Sandbox chips · no cash value</div>
                </>
              }
              deck={
                <CabinetDeck
                  creditCents={credit}
                  creditLabel={tournamentId ? "Tourney credit" : undefined}
                  betCents={betCents}
                  win={ledText(showOutcome && spin ? spin.winCents : 0)}
                  winLit={won}
                  paidCents={paid}
                  coinLabel={denomLabel(denom)}
                  spinning={spinning}
                  busy={busy}
                  canBetDown={denomIdx > 0}
                  canBetUp={denomIdx < BB_DENOMS.length - 1}
                  onBetDown={() => setDenomIdx((i) => Math.max(0, i - 1))}
                  onBetUp={() => setDenomIdx((i) => Math.min(BB_DENOMS.length - 1, i + 1))}
                  onBetOne={() => setCoins((c) => (c >= BB_MAX_COINS ? 1 : c + 1))}
                  onMax={onPlayMax}
                  maxArmed={false}
                  maxLabel="Play max"
                  onSpin={onPrimary}
                  onPayTable={() => document.getElementById("paytable")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  auto={tournamentId ? undefined : auto}
                  note={tournamentId ? "TOURNEY CREDIT · tournament chips · no cash value" : "Sandbox / test chips · no cash value · 21+"}
                />
              }
              lever={<CabinetLever onPull={() => void go()} disabled={busy || spinning || auto.running} reduced={reduced} />}
            />
          </div>
          <SpinNotice msg={err} onClose={() => setErr(null)} where="stage" />

          {!tournamentId && <WalletSplit cash={u.balanceCents} bonus={u.bonusCents ?? 0} funding={showOutcome ? funding : null} bonusToCash={variant === "bounty"} />}
          {showOutcome && spin && spin.winCents > 0 && spin.winCents <= stake && (
            <OutcomeBanner
              push
              title={spin.winCents === stake ? "BET BACK" : "PART BACK"}
              amountCents={spin.winCents}
              stakeCents={stake}
              subtitle={`${money(spin.winCents)} back on a ${money(stake)} bet · net ${spin.winCents === stake ? "$0.00" : `−${money(stake - spin.winCents)}`}`}
            />
          )}
          {showOutcome && spin && spin.winCents > stake && (
            <OutcomeBanner
              win
              title="YOU WIN"
              amountCents={spin.winCents}
              stakeCents={stake}
              subtitle={`${money(spin.winCents)} back on a ${money(stake)} bet · net +${money(spin.winCents - stake)}`}
            />
          )}
          {showOutcome && spin && spin.winCents === 0 && <OutcomeBanner title="NO WIN" subtitle="You lose this spin." />}

          {info && (
            <div className="panel bb-paytable" id="paytable" style={{ marginTop: 20 }}>
              <h3>Pay table (coins paid, centre line)</h3>
              <table className="paytable">
                <thead>
                  <tr><th>Line</th>{[1, 2, 3].map((n) => <th key={n} className={n === coins ? "pt-hot" : undefined}>{n} coin{n > 1 ? "s" : ""}</th>)}</tr>
                </thead>
                <tbody>
                  {(info.paytable as { label: string; pays: number[] }[]).map((r) => (
                    <tr key={r.label}>
                      <td>{r.label}</td>
                      {r.pays.map((p, i) => <td key={i} className={i + 1 === coins ? "pt-hot" : undefined}>{p.toLocaleString("en-US")}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted">{info.wildNote}</p>
              <MathStrip game={V.math} variant="panel" />
              <p className="muted">{info.rtpPublished}</p>
              <p className="muted">Every reel stop is equally likely and the window shows the real strip around the payline. Reels stop left to right on a fixed schedule; tap a reel or press Stop reels to stop early. Sandbox / test chips only.</p>
            </div>
          )}

          <div className="rl-tools">
            <label className="rl-toggle">
              <input type="checkbox" checked={turboOn} onChange={(e) => setTurbo(e.target.checked)} disabled={reduced} />
              {" "}Turbo spin
            </label>
          </div>
        </div>
      ); }}
    </Shell>
  );
}
