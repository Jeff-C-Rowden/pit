"use client";
import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { ActionDock, ChipRow, OutcomeBanner } from "@/components/TableUX";
import { StandingRail } from "@/components/Seating";
import { api, money, useUser } from "@/components/useUser";
import RouletteCloth, {
  LastNine,
  PIT_ROULETTE_BOTS,
  RouletteBots,
  RouletteStats,
  RouletteWheel,
  SPIN_MS,
  type ClothBet,
  type GhostChip,
} from "@/components/RouletteCloth";

const LAST9_KEY = "pit-rl-last9";
const OUTSIDE = [
  "1st 12", "2nd 12", "3rd 12",
  "1-18", "even", "red", "black", "odd", "19-36",
  "col 1", "col 2", "col 3",
];
const BOT_CHIP_CENTS = [25, 100, 500, 1000, 2500];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function pickGhosts(): GhostChip[] {
  const n = 2 + Math.floor(Math.random() * 3); // 2–4 outside drops
  const pool = [...OUTSIDE];
  const bots = [...PIT_ROULETTE_BOTS];
  const out: GhostChip[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    const j = Math.floor(Math.random() * pool.length);
    const label = pool.splice(j, 1)[0]!;
    const bot = bots.length
      ? bots.splice(Math.floor(Math.random() * bots.length), 1)[0]!
      : PIT_ROULETTE_BOTS[i % PIT_ROULETTE_BOTS.length]!;
    const cents = BOT_CHIP_CENTS[Math.floor(Math.random() * BOT_CHIP_CENTS.length)]!;
    out.push({ label, cents, bot });
  }
  return out;
}

export default function RoulettePage() {
  const { setUser } = useUser();
  const [chip, setChip] = useState(100);
  const [bets, setBets] = useState<(ClothBet & { amountCents: number })[]>([]);
  const [lastStake, setLastStake] = useState<(ClothBet & { amountCents: number })[]>([]);
  const [spin, setSpin] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [livePocket, setLivePocket] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [ghosts, setGhosts] = useState<GhostChip[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [spinId, setSpinId] = useState(0);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LAST9_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setHistory(parsed.filter((x) => typeof x === "string").slice(0, 9));
      }
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(LAST9_KEY, JSON.stringify(history.slice(0, 9)));
    } catch { /* ignore */ }
  }, [history, hydrated]);

  const stake = bets.reduce((a, b) => a + b.amountCents, 0);
  const on = (label: string) => bets.filter((b) => b.label === label).reduce((s, b) => s + b.amountCents, 0);

  const botFlashes = useMemo(
    () => ghosts.filter((g) => g.bot).map((g) => ({ bot: g.bot!, label: g.label })),
    [ghosts],
  );

  function add(b: ClothBet) {
    if (busy) return;
    setGhosts([]);
    setBets((x) => [...x, { ...b, amountCents: chip }]);
  }

  function repeat() {
    if (busy || !lastStake.length) return;
    setGhosts([]);
    setBets(lastStake.map((b) => ({ ...b })));
  }

  async function go() {
    setErr(null);
    setBusy(true);
    setSpin(null);
    try {
      const pattern = bets.map((b) => ({ ...b }));
      const d = await api("/api/games/roulette", {
        method: "POST",
        body: JSON.stringify({ bets, idempotencyKey: crypto.randomUUID() }),
      });
      setLastStake(pattern);
      setGhosts(pickGhosts());
      setLivePocket(d.spin.pocket);
      setSpinId((n) => n + 1);
      setSpinning(true);
      await sleep(SPIN_MS);
      setSpinning(false);
      setSpin(d.spin);
      setHistory((h) => [d.spin.pocket, ...h].slice(0, 9));
      if (d.user) setUser(d.user);
      setBets([]);
    } catch (e) { setErr(e instanceof Error ? e.message : "failed"); }
    finally { setBusy(false); }
  }

  const net = spin ? (spin.netCents ?? spin.payoutCents) : 0;
  const paid = spin?.payoutCents ?? 0;
  const won = spin && net > 0;
  const push = spin && net === 0 && paid > 0;
  const lost = !!(spin && !won && !push);
  const displayPocket = spinning ? livePocket : (spin?.pocket ?? livePocket);

  return (
    <Shell>
      {(u) => (
        <div className="roulette-page">
          <div className="rl-chrome">
            <div className="rl-chrome-mark">Pit</div>
            <div className="rl-chrome-title">American · 0 / 00</div>
            <div className="rl-chrome-meta">House edge 5.26%</div>
          </div>
          {err && <p className="err" style={{ textAlign: "center" }}>{err}</p>}
          {won && !spinning && (
            <OutcomeBanner
              win
              amountCents={net}
              message={`You won ${money(net)} — added to your stack`}
            />
          )}
          {push && !spinning && (
            <OutcomeBanner push amountCents={paid} message={`Even money. Stake came back.`} />
          )}
          {lost && !spinning && (
            <OutcomeBanner
              message={
                paid > 0
                  ? `Ball on ${spin.pocket}. Winning bets paid ${money(paid)} against ${money(spin.stakeCents || paid)} in. Net ${money(net)}.`
                  : `Ball on ${spin.pocket}. You lost this spin.`
              }
            />
          )}
          <div className="rl-stage">
            <div className="rl-star">
              <RouletteWheel pocket={displayPocket} spinning={spinning} spinId={spinId} />
              <div className="rl-last9-wrap">
                <div className="rl-last9-lab">Last 9</div>
                <LastNine pockets={history} />
              </div>
              <RouletteStats pockets={history} />
              <RouletteBots active={spinning} flashes={spinning || ghosts.length ? botFlashes : []} />
            </div>
            <RouletteCloth
              onAdd={add}
              onAmount={on}
              hit={spinning ? null : spin?.pocket}
              lastNine={history}
              ghosts={ghosts}
              locked={busy}
              hideLastNine
            />
          </div>
          <StandingRail youName={u.displayName} youStack={u.balanceCents} coinIn={stake} />
          <ActionDock hint={spinning ? "Ball in play — bots dropping chips." : bets.length ? "Spin the wheel." : "Pick a chip, drop it on a number, then Spin."}>
            <ChipRow amounts={[25, 100, 500, 1000, 2500]} selected={chip} onSelect={setChip} minCents={25} maxCents={500_000} />
            <button className="btn" onClick={() => setBets([])} disabled={busy || !bets.length}>Clear</button>
            <button className="btn" onClick={repeat} disabled={busy || !lastStake.length}>Repeat</button>
            <button className="btn primary hero-act" onClick={go} disabled={!bets.length || busy}>
              Spin{stake ? ` · ${money(stake)}` : ""}
            </button>
          </ActionDock>
        </div>
      )}
    </Shell>
  );
}
