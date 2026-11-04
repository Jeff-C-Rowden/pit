"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { pocketColor } from "@/lib/games/rouletteFelt";
import Shell from "@/components/Shell";
import { ActionDock, ChipRow, OutcomeBanner } from "@/components/TableUX";
import { StandingRail } from "@/components/Seating";
import { api, money, useUser } from "@/components/useUser";
import RouletteCloth, {
  PIT_ROULETTE_BOTS,
  RouletteBots,
  RouletteStats,
  RouletteWheel,
  type ClothBet,
  type GhostChip,
} from "@/components/RouletteCloth";

const TURBO_KEY = "pit-rl-turbo";
const NORMAL_MS = 4200;
const TURBO_MS = 1300;
const HISTORY_N = 20;

const ODDS: [string, string, number, number][] = [
  ["Straight up", "35:1", 1, 5.26], ["Split", "17:1", 2, 5.26], ["Street", "11:1", 3, 5.26], ["Corner", "8:1", 4, 5.26],
  ["Five-number 0-00-1-2-3", "6:1", 5, 7.89], ["Six line", "5:1", 6, 5.26], ["Dozen / Column", "2:1", 12, 5.26],
  ["Red/Black, Even/Odd, 1-18/19-36", "1:1", 18, 5.26],
];

function HistoryStrip({ pockets }: { pockets: string[] }) {
  return (
    <div className="rl-history" aria-label={`Last ${HISTORY_N} results`}>
      {Array.from({ length: HISTORY_N }, (_, i) => {
        const p = pockets[i];
        if (!p) return <span key={`e${i}`} className="rl-hpip empty" />;
        return <span key={`${i}-${p}`} className={`rl-hpip ${pocketColor(p)}${i === 0 ? " newest" : ""}`}>{p}</span>;
      })}
    </div>
  );
}

function HotCold({ pockets }: { pockets: string[] }) {
  const counts = new Map<string, number>();
  pockets.forEach((p) => counts.set(p, (counts.get(p) || 0) + 1));
  const hot = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const all = ["0", "00", ...Array.from({ length: 36 }, (_, i) => String(i + 1))];
  const cold = all.filter((p) => !counts.has(p)).slice(0, 4);
  if (!pockets.length) return null;
  return (
    <div className="rl-hotcold">
      <div>Most seen: {hot.map(([p, n]) => <span key={p} className={`rl-hpip ${pocketColor(p)}`} title={`${n}×`} style={{ display: "inline-grid", placeItems: "center", margin: "0 2px", borderRadius: 4 }}>{p}<sub>{n}</sub></span>)}
        {" · "}Not seen: {cold.map((p) => <span key={p} className={`rl-hpip ${pocketColor(p)}`} style={{ display: "inline-grid", placeItems: "center", margin: "0 2px", borderRadius: 4 }}>{p}</span>)}</div>
      <div className="rl-hotcold-note">Counts from your last {pockets.length} real spins. Past results don't predict anything; every spin is independent.</div>
    </div>
  );
}

function OddsPanel() {
  return (
    <details className="rl-odds panel">
      <summary>Odds &amp; payouts · house edge 5.26% (five-number 7.89%)</summary>
      <table>
        <thead><tr><th>Bet</th><th className="num">Pays</th><th className="num">Win chance</th><th className="num">House edge</th></tr></thead>
        <tbody>{ODDS.map(([name, pay, n, edge]) => (
          <tr key={name}><td>{name}</td><td className="num">{pay}</td><td className="num">{n}/38 · {((n / 38) * 100).toFixed(2)}%</td><td className="num">{edge.toFixed(2)}%</td></tr>
        ))}</tbody>
      </table>
      <p className="muted">American wheel: 38 pockets (1-36, 0, 00). Results come from the server's RNG; the animation only shows the result. Sandbox chips only, no real money. 21+.</p>
    </details>
  );
}
const OUTSIDE = [
  "1st 12", "2nd 12", "3rd 12",
  "1-18", "even", "red", "black", "odd", "19-36",
  "col 1", "col 2", "col 3",
];
const BOT_CHIP_CENTS = [25, 100, 500, 1000, 2500];


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

  const [turbo, setTurbo] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const skipRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    try { setTurbo(localStorage.getItem(TURBO_KEY) === "1"); } catch { /* ignore */ }
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (mq) { setReduced(mq.matches); mq.addEventListener?.("change", (e) => setReduced(e.matches)); }
    api("/api/games/roulette/history").then((d) => { if (Array.isArray(d.pockets)) setHistory(d.pockets); }).catch(() => {});
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(TURBO_KEY, turbo ? "1" : "0"); } catch { /* ignore */ }
  }, [turbo, hydrated]);

  const spinMs = reduced ? 0 : turbo ? TURBO_MS : NORMAL_MS;

  function waitSpin(ms: number) {
    return new Promise<void>((resolve) => {
      if (ms <= 0) return resolve();
      const t = setTimeout(done, ms);
      function done() { clearTimeout(t); skipRef.current = null; resolve(); }
      skipRef.current = () => { setSkipped(true); done(); };
    });
  }

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

  function undo() {
    if (busy) return;
    setBets((x) => x.slice(0, -1));
  }

  function double() {
    if (busy || !bets.length) return;
    setBets((x) => [...x, ...x.map((b) => ({ ...b }))]);
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
      setSkipped(false);
      setSpinId((n) => n + 1);
      setSpinning(true);
      await waitSpin(spinMs);
      setSpinning(false);
      setSpin(d.spin);
      setHistory(Array.isArray(d.history) ? d.history : (h) => [d.spin.pocket, ...h].slice(0, HISTORY_N));
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
            <div className="rl-chrome-meta">House edge 5.26% · <span className="rl-sandbox-tag">Sandbox chips · 21+</span></div>
          </div>
          {err && <p className="err" style={{ textAlign: "center" }}>{err}</p>}
          {won && !spinning && (
            <OutcomeBanner
              win
              title="YOU WIN"
              amountCents={net}
              subtitle={`${money(net)} added to your stack`}
            />
          )}
          {push && !spinning && (
            <OutcomeBanner
              push
              title="EVEN"
              amountCents={paid}
              subtitle="Even money. Stake came back."
            />
          )}
          {lost && !spinning && (
            <OutcomeBanner
              title="YOU LOSE"
              subtitle={
                paid > 0
                  ? `Ball on ${spin.pocket}. Winning bets paid ${money(paid)} against ${money(spin.stakeCents || paid)} in. Net ${money(net)}.`
                  : `Ball on ${spin.pocket}. You lost this spin.`
              }
            />
          )}
          <div className="rl-stage">
            <div className="rl-star">
              <RouletteWheel pocket={displayPocket} spinning={spinning} spinId={spinId} durationMs={spinMs || 1} instant={reduced || skipped} />
              <div className="rl-tools">
                <label><input type="checkbox" checked={turbo} onChange={(e) => setTurbo(e.target.checked)} /> Turbo spin</label>
                {spinning && <button className="btn" onClick={() => skipRef.current?.()}>Skip animation</button>}
                {reduced && <span className="muted">Reduced motion: results show instantly</span>}
              </div>
              <div className="rl-last9-wrap">
                <div className="rl-last9-lab">Last {HISTORY_N} results</div>
                <HistoryStrip pockets={history} />
                <HotCold pockets={history} />
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
          <OddsPanel />
          <StandingRail youName={u.displayName} youStack={u.balanceCents} coinIn={stake} />
          <ActionDock hint={spinning ? "Ball in play — bots dropping chips." : bets.length ? "Spin the wheel." : "Pick a chip, drop it on a number, then Spin."} busy={busy}>
            <ChipRow amounts={[25, 100, 500, 1000, 2500]} selected={chip} onSelect={setChip} minCents={25} maxCents={500_000} />
            <button className="btn" onClick={undo} disabled={busy || !bets.length}>Undo</button>
            <button className="btn" onClick={() => setBets([])} disabled={busy || !bets.length}>Clear</button>
            <button className="btn" onClick={double} disabled={busy || !bets.length}>Double</button>
            <button className="btn" onClick={repeat} disabled={busy || !lastStake.length}>Repeat</button>
            <button className="btn primary hero-act" onClick={go} disabled={!bets.length || busy}>
              {busy || spinning ? "Spinning…" : `Spin${stake ? ` · ${money(stake)}` : ""}`}
            </button>
          </ActionDock>
        </div>
      )}
    </Shell>
  );
}
