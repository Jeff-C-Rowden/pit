"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  checkReveal,
  fairnessCopy,
  revealCopy,
  sha256HexWeb,
  shellCheck,
  type FairReveal,
  type FairTier,
  type RevealCheck,
} from "@/lib/potFairness";

/**
 * JD2 "Provably fair point" block inside the pot sheet. Shows the open cycle's
 * published SHA-256 fingerprint and, for cycles that already paid, the revealed
 * point + salt with an in-browser re-hash and a copyable shell check.
 */
export default function PotFairness({ tierId }: { tierId: string }) {
  const [tier, setTier] = useState<FairTier | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/games/slot-progressive/fairness", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { tiers: FairTier[] }) => { if (live) setTier(d.tiers.find((t) => t.tierId === tierId) ?? null); })
      .catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, [tierId]);

  if (err) return <section className="pf" data-testid="pot-fair"><p className="pf-line">Fingerprints could not load. Try again in a moment.</p></section>;
  if (!tier) return <section className="pf" data-testid="pot-fair" aria-busy="true"><p className="pf-line muted">Loading fingerprints…</p></section>;
  const copy = fairnessCopy(tier);
  return (
    <section className="pf" data-testid="pot-fair" data-tier={tier.tierId} data-kind={tier.kind}>
      <h4 className="pf-head">{copy.heading}</h4>
      {tier.current && (
        <div className="pf-current" data-cycle={tier.current.cycleId} data-mid={tier.current.midCycle ? "1" : "0"}>
          <div className="pf-lab">Fingerprint for this cycle</div>
          <code className="pf-hash" data-testid="pf-commitment">{tier.current.commitment}</code>
        </div>
      )}
      {copy.lines.map((l, i) => <p key={i} className="pf-line">{l}</p>)}
      {tier.revealed.length > 0 && (
        <div className="pf-reveals">
          <div className="pf-lab">Revealed after the pot paid</div>
          {tier.revealed.map((r) => <Reveal key={r.cycleId} r={r} tier={tier} />)}
        </div>
      )}
      <p className="pf-help">
        <Link href="/wallet#time">Set limits</Link> · Help: 1-800-GAMBLER · 21+
      </p>
    </section>
  );
}

function Reveal({ r, tier }: { r: FairReveal; tier: FairTier }) {
  const [res, setRes] = useState<{ hex: string | null; check: RevealCheck } | null>(null);
  const [copied, setCopied] = useState(false);
  const c = revealCopy(r);
  const cmd = shellCheck(r.preimage);
  const run = async () => {
    const hex = await sha256HexWeb(r.preimage).catch(() => null);
    setRes({ hex, check: checkReveal(r, tier, hex) });
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(cmd); setCopied(true); } catch { setCopied(false); }
  };
  return (
    <div className="pf-reveal" data-testid="pf-reveal" data-cycle={r.cycleId} data-reason={r.reason}>
      <div className="pf-reveal-top"><strong>{c.point}</strong> <span>{c.ended}</span></div>
      <div className="pf-kv"><span>Salt</span><code className="pf-hash" data-testid="pf-salt">{r.salt}</code></div>
      <div className="pf-kv"><span>Fingerprint</span><code className="pf-hash" data-testid="pf-rev-commitment">{r.commitment}</code></div>
      <p className="pf-line">{c.committed}</p>
      <div className="pf-kv"><span>Check it yourself</span><code className="pf-hash pf-cmd" data-testid="pf-cmd">{cmd}</code></div>
      <div className="pf-actions">
        <button type="button" className="btn pf-verify" onClick={run}>Re-hash in this browser</button>
        <button type="button" className="btn pf-copy" onClick={copy}>{copied ? "Copied" : "Copy command"}</button>
      </div>
      {res && (
        <p className={`pf-result ${res.check.ok ? "pf-ok" : "pf-bad"}`} role="status" data-testid="pf-result" data-ok={res.check.ok ? "1" : "0"}>
          {res.hex == null
            ? "This browser can't hash here; use the command above."
            : res.check.ok
              ? `Verified: SHA-256 matches the published fingerprint, the point is inside ${tier.name}'s range${res.check.crossed ? " and the paying spin crossed it" : ""}.`
              : `Does not match: ${!res.check.hashOk ? "hash differs from the fingerprint" : !res.check.inRange ? "point outside the pot's range" : "paying spin did not cross the point"}.`}
        </p>
      )}
    </div>
  );
}
