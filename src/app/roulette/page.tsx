"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { pocketColor } from "@/lib/games/rouletteFelt";
import { planSpin, type SpinPlan } from "@/lib/games/rouletteBall";
import Shell from "@/components/Shell";
import { Chip } from "@/components/TableUX";
import { StandingRail } from "@/components/Seating";
import { api, money, useUser } from "@/components/useUser";
import RouletteCloth, {
  PIT_ROULETTE_BOTS,
  RouletteBots,
  RouletteWheel,
  type ClothBet,
  type GhostChip,
} from "@/components/RouletteCloth";

const TURBO_KEY = "pit-rl-turbo";
const HINT_KEY = "pit-rl-hint-v1";
const CHIPS = [25, 100, 500, 1000, 2500];
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
  const [plan, setPlan] = useState<SpinPlan | null>(null);
  const rotorRef = useRef(0);
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const [removeMode, setRemoveMode] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [turbo, setTurbo] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const skipRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    try { setTurbo(localStorage.getItem(TURBO_KEY) === "1"); } catch { /* ignore */ }
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (mq) { setReduced(mq.matches); mq.addEventListener?.("change", (e) => setReduced(e.matches)); }
    api("/api/games/roulette/history").then((d) => { if (Array.isArray(d.pockets)) setHistory(d.pockets); }).catch(() => {});
    try { setShowHint(localStorage.getItem(HINT_KEY) !== "1"); } catch { setShowHint(true); }
    setHydrated(true);
  }, []);

  function dismissHint() {
    setShowHint(false);
    try { localStorage.setItem(HINT_KEY, "1"); } catch { /* ignore */ }
  }

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 1400);
  }

  function remove(label: string) {
    if (busy) return;
    setBets((x) => {
      const j = x.map((b) => b.label).lastIndexOf(label);
      if (j < 0) return x;
      flash(`Removed ${money(x[j]!.amountCents)} from ${label}`);
      return [...x.slice(0, j), ...x.slice(j + 1)];
    });
  }

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(TURBO_KEY, turbo ? "1" : "0"); } catch { /* ignore */ }
  }, [turbo, hydrated]);

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
    if (showHint) dismissHint();
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
    setRemoveMode(false);
    // Bring the wheel fully into view; the dock collapses while the ball is live.
    wheelRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
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
      const p = planSpin(d.spin.pocket, rotorRef.current, { turbo });
      rotorRef.current = p.frames[p.frames.length - 1]!.rotor % 360;
      setPlan(p);
      setSpinning(true);
      await waitSpin(reduced ? 0 : p.durationMs);
      setSpinning(false);
      setSpin(d.spin);
      setHistory(Array.isArray(d.history) ? d.history : (h) => [d.spin.pocket, ...h].slice(0, HISTORY_N));
      if (d.user) setUser(d.user);
      setBets([]);
    } catch (e) { setErr(e instanceof Error ? e.message : "failed"); }
    finally { setBusy(false); }
  }

  const net = spin ? (spin.netCents ?? (spin.payoutCents - (spin.stakeCents ?? 0))) : 0;
  const paid = spin?.payoutCents ?? 0;
  const staked = spin?.stakeCents ?? 0;
  const tone = !spin ? null : net > 0 ? "win" : net === 0 ? "push" : "loss";
  const displayPocket = spinning ? livePocket : (spin?.pocket ?? livePocket);
  const lastWin = spin && !spinning ? net : null;
  const colorName = (p: string) => (pocketColor(p) === "green" ? "green" : pocketColor(p));

  return (
    <Shell>
      {(u) => (
        <div className={`roulette-page rl-ux${spinning ? " is-spinning" : ""}`}>
          <div className="rl-chrome">
            <div className="rl-chrome-title">American Roulette · 0 / 00</div>
            <div className="rl-chrome-meta"><span className="rl-sandbox-tag">Sandbox chips · 21+</span> · Not real money</div>
          </div>

          <div className="rl-status" role="status" aria-live="polite">
            <div><span>Balance</span><strong>{money(u.balanceCents)}</strong></div>
            <div><span>Bet on table</span><strong>{money(stake)}</strong></div>
            <div><span>Last spin</span><strong className={lastWin == null ? "" : lastWin > 0 ? "up" : lastWin < 0 ? "down" : ""}>
              {lastWin == null ? "—" : `${lastWin > 0 ? "+" : ""}${money(lastWin)}`}</strong></div>
          </div>

          {showHint && (
            <div className="rl-hint" role="note">
              <div>
                <strong>How to play</strong>
                <ol>
                  <li>Pick a chip value at the bottom.</li>
                  <li>Tap a number or area on the table to place it. Tap again to add more.</li>
                  <li>Press <b>Spin</b>. The server picks the number; the wheel just shows it.</li>
                </ol>
                <p>To take a chip back, press and hold it, or use <b>Remove</b>.</p>
              </div>
              <button className="btn rl-hint-x" onClick={dismissHint} aria-label="Dismiss how to play">Got it</button>
            </div>
          )}

          {err && <p className="err" role="alert" style={{ textAlign: "center" }}>{err}</p>}

          <div className="rl-stage">
            <div className="rl-star" ref={wheelRef}>
              <RouletteWheel pocket={displayPocket} spinning={spinning} plan={plan} instant={reduced || skipped} />
              <div className="rl-tools">
                <label className="rl-toggle"><input type="checkbox" checked={turbo} onChange={(e) => setTurbo(e.target.checked)} /> Turbo spin</label>
                {reduced && <span className="muted">Reduced motion: results show instantly</span>}
              </div>
              <div className="rl-last9-wrap">
                <div className="rl-last9-lab">Last {HISTORY_N} numbers (newest first)</div>
                <HistoryStrip pockets={history} />
                <HotCold pockets={history} />
              </div>
              <RouletteBots active={spinning} flashes={spinning || ghosts.length ? botFlashes : []} />
            </div>
            <div className="rl-felt-wrap">
              {removeMode && <div className="rl-remove-banner">Remove mode: tap a chip on the table to take it back.</div>}
              <RouletteCloth
                onAdd={add}
                onRemove={remove}
                removeMode={removeMode}
                onAmount={on}
                hit={spinning ? null : spin?.pocket}
                lastNine={history}
                ghosts={ghosts}
                locked={busy}
                hideLastNine
              />
            </div>
          </div>
          <OddsPanel />
          <StandingRail youName={u.displayName} youStack={u.balanceCents} coinIn={stake} />

          {toast && <div className="rl-toast" role="status">{toast}</div>}

          <div className={`rl-dock${spinning ? " collapsed" : ""}`} aria-busy={busy || undefined}>
            {spinning ? (
              <div className="rl-dock-live">
                <span>Ball in play · {money(stake || lastStake.reduce((a, b) => a + b.amountCents, 0))} on the table</span>
                <button className="btn rl-btn" onClick={() => skipRef.current?.()} aria-label="Skip the spin animation">Skip</button>
              </div>
            ) : (
              <>
          {spin && !spinning && tone && (
                  <div className={`rl-result in-dock ${tone}`} role="status" aria-live="polite">
                    <span className={`rl-pocket-pip ${pocketColor(spin.pocket)}`}>{spin.pocket}</span>
                    <div>
                      <div className="rl-result-h">
                        {tone === "win" ? `You won ${money(net)}` : tone === "push" ? "You broke even" : `You lost ${money(-net)}`}
                      </div>
                      <div className="rl-result-d">
                        Ball landed on {spin.pocket} {colorName(spin.pocket)}. You bet {money(staked)}, got back {money(paid)}.
                      </div>
                    </div>
                  </div>
                )}
                <div className="rl-dock-chips" role="group" aria-label="Chip value">
                  <span className="rl-dock-lab">Chip<b>{money(chip)}</b></span>
                  {CHIPS.map((c) => (
                    <Chip key={c} cents={c} size={46} selected={chip === c} onClick={() => { setChip(c); setRemoveMode(false); }} label={`Chip value ${money(c)}`} />
                  ))}
                </div>
                <div className="rl-dock-actions">
                  <div className="rl-dock-sec" role="group" aria-label="Bet tools">
                    <button className="btn rl-btn" onClick={undo} disabled={busy || !bets.length} aria-label="Undo last chip">↶<span>Undo</span></button>
                    <button className={`btn rl-btn${removeMode ? " on" : ""}`} onClick={() => setRemoveMode((m) => !m)} disabled={busy || !bets.length} aria-pressed={removeMode} aria-label="Remove mode">✕<span>Remove</span></button>
                    <button className="btn rl-btn" onClick={() => { setBets([]); setRemoveMode(false); }} disabled={busy || !bets.length} aria-label="Clear all bets">⌫<span>Clear</span></button>
                    <button className="btn rl-btn" onClick={repeat} disabled={busy || !lastStake.length || bets.length > 0} aria-label="Repeat last bets">↻<span>Repeat</span></button>
                    <button className="btn rl-btn" onClick={double} disabled={busy || !bets.length} aria-label="Double all bets">×2<span>Double</span></button>
                  </div>
                  <button className="btn primary rl-spin" onClick={go} disabled={!bets.length || busy} aria-describedby="rl-spin-hint">
                    {busy ? "Spinning…" : "Spin"}
                    <small>{bets.length ? `${money(stake)} bet` : "No bets yet"}</small>
                  </button>
                </div>
                <p id="rl-spin-hint" className="rl-dock-hint">
                  {bets.length
                    ? `${bets.length} chip${bets.length === 1 ? "" : "s"} placed · tap Spin when ready`
                    : lastStake.length ? "Tap the table to bet, or Repeat your last bets" : "Tap the table to place a chip"}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}
