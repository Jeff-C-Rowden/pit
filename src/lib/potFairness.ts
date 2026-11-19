/**
 * Jackpot Desk JD2 — provably fair hidden trigger for the Antler Ridge must-hit-by pots.
 *
 * Every Mini / Minor / Major cycle has a hidden point T (rolled by rollTriggerCents,
 * unchanged). When the cycle opens, the server draws a fresh 32-byte salt from the
 * CSPRNG and publishes
 *     commitment = SHA-256( "<T in cents>|<salt hex>|<cycle id>" )   (UTF-8, lowercase hex)
 * T and the salt stay server-side until the pot hits; then both are revealed so anyone
 * can recompute the hash and see the point was fixed before the first spin of the cycle.
 *
 * Cycles that were already running when commitments started (Nov 19 2026) are committed
 * the first time the server sees them and are flagged midCycle with the meter at that
 * moment: the point was already set and never changes, but the commitment was NOT
 * published at that cycle's start, and the copy says so.
 *
 * The Grand is a per-spin mystery roll with no hidden point, so it has nothing to commit.
 * Nothing here changes any odds or the RTP: T is the same uniform draw as before.
 */
import { createHash } from "crypto";
import { compactDollars } from "@/lib/mhbBar";

export const FAIRNESS_FORMAT = "SHA-256 of trigger cents|salt|cycle id";

export function commitmentPreimage(triggerCents: number, saltHex: string, cycleId: string): string {
  return `${Math.trunc(triggerCents)}|${saltHex}|${cycleId}`;
}

/** Server-side SHA-256 (Node crypto), lowercase hex. */
export function commitmentHash(triggerCents: number, saltHex: string, cycleId: string): string {
  return createHash("sha256").update(commitmentPreimage(triggerCents, saltHex, cycleId), "utf8").digest("hex");
}

/** Browser / Node-22 WebCrypto SHA-256 of a UTF-8 string, lowercase hex. Null if unavailable. */
export async function sha256HexWeb(text: string): Promise<string | null> {
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (!subtle) return null;
  const buf = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type FairCurrent = {
  cycleId: string;
  commitment: string;
  committedAt: string;
  /** true = cycle was already running when commitments started; committed later, not at its start */
  midCycle: boolean;
  meterAtCommitCents: number;
};

export type FairReveal = FairCurrent & {
  triggerCents: number;
  salt: string;
  preimage: string;
  endedAt: string;
  /** "hit" = the pot paid; "settings" = point redrawn because the pot's seed/cap changed */
  reason: "hit" | "settings";
  /** meter before the spin that paid, and the amount paid (meter after that spin's share) */
  meterBeforeCents: number | null;
  hitAmountCents: number | null;
};

export type FairTier = {
  tierId: string;
  name: string;
  kind: "must-hit" | "mystery";
  seedCents: number;
  ceilingCents: number | null;
  current: FairCurrent | null;
  revealed: FairReveal[];
};

export type RevealCheck = {
  hashOk: boolean;
  preimageOk: boolean;
  inRange: boolean;
  /** the paying spin took the meter from below the point to at/over it */
  crossed: boolean | null;
  ok: boolean;
};

/** Pure check of one reveal given the recomputed hash (sync or WebCrypto). */
export function checkReveal(r: FairReveal, tier: { seedCents: number; ceilingCents: number | null }, recomputedHex: string | null): RevealCheck {
  const preimageOk = r.preimage === commitmentPreimage(r.triggerCents, r.salt, r.cycleId);
  const hashOk = !!recomputedHex && recomputedHex === r.commitment && preimageOk;
  const inRange = tier.ceilingCents != null && r.triggerCents >= tier.seedCents && r.triggerCents <= tier.ceilingCents;
  const crossed =
    r.reason === "hit" && r.hitAmountCents != null && r.meterBeforeCents != null
      ? r.meterBeforeCents < r.triggerCents && r.hitAmountCents >= r.triggerCents
      : null;
  return { hashOk, preimageOk, inRange, crossed, ok: hashOk && inRange && crossed !== false };
}

export function shortHash(h: string): string {
  return h.length > 20 ? `${h.slice(0, 10)}…${h.slice(-8)}` : h;
}

export function shellCheck(preimage: string): string {
  return `printf '%s' '${preimage}' | sha256sum`;
}

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago", timeZoneName: "short" });
};

/** All copy for the pot-sheet "Provably fair" block (pure, for wording tests). */
export function fairnessCopy(t: FairTier) {
  if (t.kind === "mystery") {
    return {
      heading: "Provably fair point",
      lines: [
        `The ${t.name} has no hidden point: every spin gets its own mystery roll, so there is nothing to commit in advance.`,
      ],
    };
  }
  const lines: string[] = [
    `When each ${t.name} cycle starts, the server picks the hidden point and a random salt and publishes their SHA-256 fingerprint here: ${FAIRNESS_FORMAT}. The point and salt stay secret until the pot pays; then both are shown so you can recompute the hash and see the point never moved.`,
  ];
  const c = t.current;
  if (c) {
    lines.push(
      c.midCycle
        ? `This cycle began before fingerprints were published. Its fingerprint was published ${when(c.committedAt)} with the meter at ${compactDollars(c.meterAtCommitCents)}; the point was already set then and does not change. Every cycle from the next reset is fingerprinted at its start.`
        : `Fingerprint published at the start of this cycle, ${when(c.committedAt)}.`,
    );
  }
  if (!t.revealed.length) lines.push("No fingerprinted cycle has paid yet, so nothing is revealed yet.");
  return { heading: "Provably fair point", lines };
}

export function revealCopy(r: FairReveal) {
  const ended = r.reason === "hit"
    ? `Paid ${r.hitAmountCents != null ? compactDollars(r.hitAmountCents) : ""} ${when(r.endedAt)}${r.meterBeforeCents != null ? `; that spin took the meter from ${compactDollars(r.meterBeforeCents)} past the point` : ""}.`
    : `Point redrawn ${when(r.endedAt)} because this pot's settings changed; it never paid.`;
  return {
    point: `Hidden point ${compactDollars(r.triggerCents)}`,
    ended,
    committed: r.midCycle
      ? `Fingerprint published mid-cycle ${when(r.committedAt)} (meter ${compactDollars(r.meterAtCommitCents)}), not at the cycle start.`
      : `Fingerprint published at cycle start ${when(r.committedAt)}.`,
  };
}
