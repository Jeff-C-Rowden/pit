"use client";
/**
 * Tournament lobby: Live / Upcoming / Finished tabs, a Red Stag-style table on desktop and
 * stacked cards on phones, and a detail panel under the list (deep link ?id=). Real entrants
 * only; empty leaderboard rows show "—". Sandbox tournament chips, no cash value.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { api, money, useUser } from "@/components/useUser";
import { ModeBadge, PrizeBadge, scoreLabel, timeLeft } from "@/components/TournamentStrip";
import GameArt from "@/components/GameArt";

type Row = {
  id: string; shortId: string; name: string; format: string; category: string; game: string; gameName: string; gameHref: string; mode: string;
  startsAt: string; endsAt: string; regClosesAt: string; durationMin: number; buyinCents: number; feeBps: number; seedCents: number; prizeType: string;
  rebuyFeeCents: number | null; status: string; entrants: number; qualifiedCount: number; poolCents: number; firstPrizeCents: number; placesPaid: number;
  minQualifyingBets: number;
  fixedPlays?: number | null; unit?: string;
  my: null | { testAccount?: boolean; rank?: number | null; qualified?: boolean; betsMade?: number; score?: number; prizeCents?: number; finalPrizeCents?: number | null; withdrawn?: boolean };
};
type Tab = "live" | "upcoming" | "finished";
type Filter = "all" | "free" | "slots" | "tables" | "mine";
const ART: Record<string, string> = { buckshot: "bb", slot: "slot", roulette: "rl", blackjack: "bj", craps: "cr" };
const ct = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", hour: "numeric", minute: "2-digit" }) + " CT";
const dur = (m: number) => (m < 60 ? `${m} min` : `${m / 60} h`);
const buyin = (c: number) => (c ? money(c) : "Free");

function useClock(serverNow: string | null) {
  const [skew, setSkew] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => { if (serverNow) setSkew(Date.parse(serverNow) - Date.now()); }, [serverNow]);
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 1000); return () => window.clearInterval(t); }, []);
  return () => Date.now() + skew;
}

export default function TournamentsPage() {
  const { setUser } = useUser();
  const [tab, setTab] = useState<Tab>("live");
  const [filter, setFilter] = useState<Filter>("all");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [serverNow, setServerNow] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const now = useClock(serverNow);

  const load = useCallback(async (t: Tab) => {
    try {
      const d = await api(`/api/tournaments?tab=${t}`);
      setRows(d.tournaments);
      setServerNow(d.serverNow);
    } catch (e) { setErr(e instanceof Error ? e.message : "failed"); }
  }, []);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = q.get("id");
    const t = q.get("tab") as Tab | null;
    if (t && ["live", "upcoming", "finished"].includes(t)) setTab(t);
    if (id) setSel(id);
  }, []);
  useEffect(() => { setRows(null); void load(tab); const i = window.setInterval(() => { if (!document.hidden) void load(tab); }, 15_000); return () => window.clearInterval(i); }, [tab, load]);

  const shown = useMemo(() => (rows ?? []).filter((r) =>
    filter === "all" ? true : filter === "free" ? r.buyinCents === 0 : filter === "mine" ? !!r.my && !r.my.withdrawn : r.category === filter), [rows, filter]);
  const pick = (id: string) => {
    setSel(id);
    try { history.replaceState(null, "", `/tournaments?id=${encodeURIComponent(id)}${tab !== "live" ? `&tab=${tab}` : ""}`); } catch { /* ignore */ }
    setTimeout(() => document.getElementById("tny-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  return (
    <Shell>
      {() => (
        <div className="tny-page">
          <header className="tny-head">
            <h1>Tournament Lobby</h1>
            <p className="tny-caption">All times in Central Time (CT) · <span className="tny-clock">{new Date(now()).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit", second: "2-digit" })} CT</span></p>
            <p className="tny-sandbox"><span className="sandbox-chip">Sandbox</span> Sandbox chips · no cash value · 21+ · flat 25% house fee on paid buy-ins · never cancelled</p>
          </header>
          <div className="tny-controls">
            <div className="tny-tabs" role="tablist" aria-label="Tournament status">
              {(["live", "upcoming", "finished"] as Tab[]).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} className={`tny-tab${tab === t ? " on" : ""}`} onClick={() => setTab(t)}>
                  {t === "live" ? "Live" : t === "upcoming" ? "Upcoming" : "Finished"}
                </button>
              ))}
            </div>
            <label className="st-filter-select tny-filter">
              <span className="sr-only">Filter</span>
              <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Filter tournaments">
                <option value="all">All</option>
                <option value="free">Free rolls</option>
                <option value="slots">Slots</option>
                <option value="tables">Table games</option>
                <option value="mine">My tournaments</option>
              </select>
            </label>
            <span className="tny-count">{rows ? `${shown.length} tournament${shown.length === 1 ? "" : "s"} listed` : "Loading…"}</span>
          </div>
          {err && <p className="err">{err}</p>}
          {rows && !shown.length && <p className="muted tny-empty">Nothing here right now. {tab === "live" ? "Check Upcoming for the next start." : ""}</p>}

          <table className="tny-table" aria-label="Tournaments">
            <thead><tr><th>ID</th><th>Tournament</th><th>Mode</th><th>Starts</th><th>{tab === "finished" ? "Ended" : "Ends in"}</th><th>Game</th><th>Prize pool</th><th>Buy-in</th><th>Rebuy</th><th>Entrants</th><th>Status</th><th /></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className={sel === r.id ? "on" : ""} onClick={() => pick(r.id)}>
                  <td className="mono">#{r.shortId}</td>
                  <td><b>{r.name}</b><div className="tny-sub">{r.format} · {dur(r.durationMin)} · <PrizeBadge type={r.prizeType} /></div></td>
                  <td><ModeBadge mode={r.mode} /></td>
                  <td>{ct(r.startsAt)}</td>
                  <td className="tny-gold">{tab === "upcoming" ? `starts in ${timeLeft(Date.parse(r.startsAt) - now())}` : timeLeft(Date.parse(r.endsAt) - now())}</td>
                  <td>{r.gameName}</td>
                  <td className="tny-gold">{money(r.poolCents)}</td>
                  <td>{buyin(r.buyinCents)}</td>
                  <td>{r.rebuyFeeCents ? money(r.rebuyFeeCents) : "—"}</td>
                  <td>{r.entrants}</td>
                  <td><StatusPill r={r} tab={tab} /></td>
                  <td><button type="button" className="st-pill st-pill-gold tny-row-btn" onClick={(e) => { e.stopPropagation(); pick(r.id); }}>{r.my && !r.my.withdrawn ? (tab === "finished" ? "Results" : "Play") : tab === "finished" ? "View" : "Register"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="tny-cards">
            {shown.map((r) => (
              <article key={r.id} className={`tny-card${sel === r.id ? " on" : ""}`}>
                <header><span className="mono">#{r.shortId}</span> · <b>{r.name}</b></header>
                <div className="tny-card-body">
                  <div className="tny-card-art"><GameArt kind={ART[r.game] ?? "bb"} variant="tile" /><span className="tny-card-rank">{r.my?.testAccount ? "Test account · not ranked" : r.my?.rank ? `Your rank: ${r.my.rank} / ${r.entrants}` : "Not entered"}</span></div>
                  <dl>
                    <div><dt>Status</dt><dd><StatusPill r={r} tab={tab} /></dd></div>
                    <div><dt>Mode</dt><dd><ModeBadge mode={r.mode} /></dd></div>
                    <div><dt>Game</dt><dd>{r.gameName}</dd></div>
                    <div><dt>Starts</dt><dd>{ct(r.startsAt)}</dd></div>
                    <div><dt>Ends</dt><dd className="tny-gold">{tab === "upcoming" ? dur(r.durationMin) : timeLeft(Date.parse(r.endsAt) - now())}</dd></div>
                    <div><dt>Buy-in</dt><dd>{buyin(r.buyinCents)}</dd></div>
                    <div><dt>Prize pool</dt><dd className="tny-gold">{money(r.poolCents)} <PrizeBadge type={r.prizeType} /></dd></div>
                    <div><dt>Entrants</dt><dd>{r.entrants} · 1st ≈ {money(r.firstPrizeCents)}</dd></div>
                  </dl>
                </div>
                <button type="button" className={`tny-card-cta${r.my && !r.my.withdrawn ? " gold" : tab === "finished" ? " ended" : ""}`} onClick={() => pick(r.id)}>
                  {r.my && !r.my.withdrawn ? (tab === "finished" ? "Results" : "Play") : tab === "finished" ? "Ended" : "Register"}
                </button>
              </article>
            ))}
          </div>

          <ul className="tny-legend" aria-label="Status legend">
            <li><span className="tny-st tny-st-live" /> In progress</li>
            <li><span className="tny-st tny-st-reg" /> Registration open</li>
            <li><span className="tny-st tny-st-in" /> Registered</li>
            <li><span className="tny-st tny-st-closed" /> Closed</li>
            <li><span className="tny-st tny-st-ended" /> Ended</li>
          </ul>

          {sel && <Detail id={sel} now={now} onUser={setUser} onChanged={() => load(tab)} />}

          <section className="panel tny-howto">
            <h2>How tournaments work</h2>
            <ul>
              <li><b>Separate stacks.</b> Everyone gets the same tournament stack. It never touches your Cash or Bonus, and leftover chips have no value.</li>
              <li><b>Two ranking modes.</b> <ModeBadge mode="balance" /> highest stack at the end wins. <ModeBadge mode="accumulated" /> only wins count, as a multiple of your bet.</li>
              <li><b>Qualify.</b> Make the minimum number of bets shown on each event to rank for a prize.</li>
              <li><b>Fees and pool.</b> Paid buy-ins are Cash only (never Bonus). 25% is the house fee; 75% builds the pool. Free rolls have a house-funded pool.</li>
              <li><b>Prizes.</b> Paid places grow with the field, up to the top 10. <PrizeBadge type="cash" /> pays to Cash; <PrizeBadge type="bonus" /> pays to your Bonus balance (play-only, see <Link href="/rules#bonus">bonus rules</Link>).</li>
              <li><b>Never cancelled.</b> No minimum players. A solo qualifier takes the whole pool; if nobody qualifies, the top-ranked entrant does.</li>
            </ul>
            <p className="muted">Sandbox · test chips only · no cash value · 21+. Real-money tournaments would require a gaming licence. <Link href="/rules#tournaments">Full rules</Link></p>
          </section>
        </div>
      )}
    </Shell>
  );
}

function StatusPill({ r, tab }: { r: Row; tab: Tab }) {
  if (tab === "finished") return <span className="tny-status ended">Ended</span>;
  if (r.my && !r.my.withdrawn) return <span className="tny-status in">Registered</span>;
  if (Date.parse(r.regClosesAt) <= Date.now()) return <span className="tny-status closed">Closed</span>;
  return <span className={`tny-status ${tab === "live" ? "live" : "reg"}`}>{tab === "live" ? "Join now" : "Register"}</span>;
}

type DetailData = {
  tournament: Row & { startStackCents: number; minBetCents: number; maxBetCents: number; minQualifyingBets: number; rebuyStackCents: number | null; rebuyMaxBalanceCents: number | null; rebuyLimit: number };
  pool: { entrants: number; grossCents: number; feeCents: number; seedCents: number; poolCents: number };
  feeSplit: { toPoolCents: number; feeCents: number };
  qualifiedCount: number; fallback: boolean; ladder: number[]; legend: string;
  top: { rank: number; name: string; score: number; betsMade: number; qualified: boolean; prizeCents: number; me: boolean }[];
  me: null | { rank: number | null; name: string; score: number; stackCents: number; betsMade: number; playsUsed?: number; qualified: boolean; prizeCents: number; rebuys: number; status: string; testAccount?: boolean };
  canRebuy: boolean; canWithdraw: boolean; regOpen: boolean;
};

function Detail({ id, now, onUser, onChanged }: { id: string; now: () => number; onUser: (u: any) => void; onChanged: () => void }) {
  const [d, setD] = useState<DetailData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api(`/api/tournaments/${encodeURIComponent(id)}`).then(setD).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { setD(null); setDone(false); setConfirm(false); void load(); const i = window.setInterval(() => { if (!document.hidden) void load(); }, 15_000); return () => window.clearInterval(i); }, [load]);
  async function act(path: "register" | "withdraw" | "rebuy") {
    setBusy(true); setErr(null);
    try {
      const r = await api(`/api/tournaments/${encodeURIComponent(id)}/${path}`, { method: "POST", body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }) });
      if (r.user) onUser(r.user);
      setD(r);
      if (path === "register") setDone(true);
      setConfirm(false);
      onChanged();
    } catch (e) { setErr(e instanceof Error ? e.message : "failed"); }
    finally { setBusy(false); }
  }
  if (!d) return <section id="tny-detail" className="tny-detail"><p className="muted">{err ?? "Loading tournament…"}</p></section>;
  const t = d.tournament;
  const playHref = `${t.gameHref}?t=${encodeURIComponent(t.id)}`;
  const finished = t.status === "finished";
  const started = Date.parse(t.startsAt) <= now();
  const rows = Array.from({ length: 10 }, (_, i) => d.top[i] ?? null);
  return (
    <section id="tny-detail" className="tny-detail" aria-label={`${t.name} details`}>
      <div className="tny-detail-head">
        <div className="tny-detail-art"><GameArt kind={ART[t.game] ?? "bb"} variant="tile" /></div>
        <div>
          <h2>{t.name} <span className="mono muted">#{t.shortId}</span></h2>
          <p><ModeBadge mode={t.mode} /> <PrizeBadge type={t.prizeType} /> <span className="tny-status-text">{finished ? "Ended" : started ? `${timeLeft(Date.parse(t.endsAt) - now())} left` : `Starts in ${timeLeft(Date.parse(t.startsAt) - now())}`}</span></p>
          <p className="tny-pool">Total prize pool <b data-testid="tny-pool">{money(d.pool.poolCents)}</b>{finished ? "" : " (projected)"} · Entrants <b>{d.pool.entrants}</b> · Qualified <b>{d.qualifiedCount}</b></p>
        </div>
      </div>
      {err && <p className="err">{err}</p>}
      <div className="tny-actions">
        {!d.me && d.regOpen && !confirm && <button type="button" className="tny-btn-register" onClick={() => setConfirm(true)} data-testid="tny-register">Register{t.buyinCents ? ` · ${money(t.buyinCents)}` : " · Free"}</button>}
        {confirm && (
          <div className="tny-confirm" role="dialog" aria-label="Confirm registration">
            <p>{t.buyinCents ? <>Buy in to {t.name} #{t.shortId} for <b>{money(t.buyinCents)}</b> test chips? Your Cash balance will be debited (Bonus can&apos;t be used).</> : <>Enter {t.name} #{t.shortId} for free?</>}</p>
            <button type="button" className="tny-btn-register" disabled={busy} onClick={() => act("register")} data-testid="tny-confirm">{busy ? "Registering…" : "Confirm"}</button>
            <button type="button" className="st-pill st-pill-outline" onClick={() => setConfirm(false)}>Cancel</button>
          </div>
        )}
        {d.me && !finished && (
          <>
            {done && <p className="ok">You&apos;re registered.{started ? "" : " Play opens when it starts."}</p>}
            {started ? <Link href={playHref} className="tny-btn-play" data-testid="tny-play">Play now</Link> : <span className="muted">Starts {ct(t.startsAt)}</span>}
            {done && <button type="button" className="st-pill st-pill-outline" onClick={() => setDone(false)}>Play later</button>}
            {d.canRebuy && <button type="button" className="st-pill st-pill-gold" disabled={busy} onClick={() => act("rebuy")}>Rebuy {money(t.rebuyFeeCents!)}</button>}
            {d.canWithdraw && <button type="button" className="st-pill st-pill-outline" disabled={busy} onClick={() => act("withdraw")}>Withdraw{t.buyinCents ? " (full refund)" : ""}</button>}
          </>
        )}
        {!d.regOpen && !d.me && !finished && <span className="muted">Registration closed.</span>}
      </div>
      <div className="tny-cards3">
        <div className="tny-c3">
          <h3>Tournament Info</h3>
          <dl className="tny-dl">
            <div><dt>Game</dt><dd>{t.gameName}</dd></div>
            <div><dt>Format</dt><dd>{t.format} · {t.fixedPlays ? `${t.fixedPlays} ${t.unit} within ${dur(t.durationMin)}` : dur(t.durationMin)}</dd></div>
            <div><dt>Mode</dt><dd>{t.mode === "balance" ? "Highest stack at the end" : "Only wins count (net × bet)"}</dd></div>
            <div><dt>Starts</dt><dd>{ct(t.startsAt)}</dd></div>
            <div><dt>Ends</dt><dd>{ct(t.endsAt)}</dd></div>
            <div><dt>Registration closes</dt><dd>{ct(t.regClosesAt)}</dd></div>
            <div><dt>Qualify</dt><dd>{t.game === "craps" ? `${t.minQualifyingBets} rolls that settle ${money(t.minBetCents)}+` : `${t.minQualifyingBets} ${t.game === "blackjack" ? "hands" : "bets"} of ${money(t.minBetCents)}+`}</dd></div>
            <div><dt>Bet limits</dt><dd>{money(t.minBetCents)} – {money(t.maxBetCents)}{t.game === "craps" ? " new bets a roll" : t.game === "blackjack" ? " a hand (doubles/splits may exceed)" : ""}</dd></div>
          </dl>
        </div>
        <div className="tny-c3">
          <h3>Fees &amp; Stack</h3>
          <dl className="tny-dl">
            <div><dt>Entry fee</dt><dd>{t.buyinCents ? `${money(t.buyinCents)} = ${money(d.feeSplit.toPoolCents)} pool + ${money(d.feeSplit.feeCents)} fee (25%)` : "Free · house-funded pool"}</dd></div>
            <div><dt>Starting stack</dt><dd>{money(t.startStackCents)} tournament chips</dd></div>
            <div><dt>Rebuy</dt><dd>{t.rebuyFeeCents ? `${money(t.rebuyFeeCents)} for ${money(t.rebuyStackCents!)} when stack ≤ ${money(t.rebuyMaxBalanceCents!)} · max ${t.rebuyLimit}` : "None"}</dd></div>
            <div><dt>Prize currency</dt><dd>{t.prizeType === "bonus" ? "Bonus (play-only)" : "Cash"}</dd></div>
            <div><dt>Players</dt><dd>No minimum · never cancelled</dd></div>
            <div><dt>Fees collected</dt><dd>{money(d.pool.feeCents)}</dd></div>
          </dl>
        </div>
        <div className="tny-c3 tny-board">
          <h3>Prize Pool &amp; Leaderboard</h3>
          <table>
            <thead><tr><th>#</th><th>Player</th><th>Score</th><th>Bets</th><th>Prize</th></tr></thead>
            <tbody>
              {rows.map((r, i) => r ? (
                <tr key={i} className={`${r.me ? "me" : ""}${r.qualified ? "" : " nq"}`} data-testid={r.me ? "tny-my-row" : undefined}>
                  <td>{r.rank}</td><td>{r.name}{r.me ? " (you)" : ""}</td><td>{scoreLabel(t.mode, r.score)}</td>
                  <td>{r.qualified ? r.betsMade : `${r.betsMade}/${t.minQualifyingBets}`}</td>
                  <td className="tny-gold">{r.prizeCents ? money(r.prizeCents) : r.qualified ? "—" : "needs bets"}</td>
                </tr>
              ) : <tr key={i} className="empty"><td>{i + 1}</td><td>—</td><td>—</td><td>—</td><td>{d.ladder[i] && !d.top.length ? money(d.ladder[i]!) : "—"}</td></tr>)}
              {d.me && d.me.testAccount && (
                <tr className="me tny-test-row" data-testid="tny-my-row"><td>—</td><td>{d.me.name} (you) · test account, not ranked</td><td>{scoreLabel(t.mode, d.me.score)}</td><td>{d.me.qualified ? d.me.betsMade : `${d.me.betsMade}/${t.minQualifyingBets}`}</td><td>—</td></tr>
              )}
              {d.me && !d.me.testAccount && (d.me.rank ?? 0) > 10 && (
                <tr className="me"><td>{d.me.rank}</td><td>{d.me.name} (you)</td><td>{scoreLabel(t.mode, d.me.score)}</td><td>{d.me.betsMade}</td><td>{d.me.prizeCents ? money(d.me.prizeCents) : "—"}</td></tr>
              )}
            </tbody>
          </table>
          <p className="muted tny-ladder">{d.ladder.length ? `${d.ladder.length} place${d.ladder.length > 1 ? "s" : ""} paid now: ${d.ladder.map((c) => money(c)).join(" / ")}` : "Prizes appear when someone enters."}{d.fallback ? " · nobody has qualified yet, so the top-ranked entrant would take it" : ""}</p>
          <details className="muted"><summary>Paid places grow with the field (qualified → places)</summary><p>{d.legend}. Leftover cents go to 1st.</p></details>
        </div>
      </div>
    </section>
  );
}
