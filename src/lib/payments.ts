/**
 * Payments adapter. Pit v1 is sandbox-only: no live charges, no Stripe keys.
 * Partner mode is a stub until a licensed PartnerWalletClient is wired.
 * See GO_LIVE.md and ./payments/partner.ts.
 */

export type DepositRequest = {
  userId: string;
  amountCents: number;
  source: "sandbox_test_funds" | "partner";
};

export type WithdrawalRequest = {
  userId: string;
  amountCents: number;
};

export type PaymentsMode = "sandbox" | "partner_stub" | "partner_live";

export type PaymentsStatus = {
  mode: PaymentsMode;
  live: boolean;
  message: string;
};

export type PaymentsAdapter = {
  name: string;
  mode: PaymentsMode;
  live: boolean;
  deposit(
    req: DepositRequest
  ): Promise<{ ok: true; providerRef: string } | { ok: false; error: string }>;
  requestWithdrawal(
    req: WithdrawalRequest
  ): Promise<{ ok: true; providerRef: string; status: "pending" } | { ok: false; error: string }>;
  getStatus(): PaymentsStatus;
};

export const sandboxPayments: PaymentsAdapter = {
  name: "sandbox",
  mode: "sandbox",
  live: false,
  async deposit(req) {
    if (req.source !== "sandbox_test_funds") {
      return { ok: false, error: "sandbox adapter only accepts sandbox_test_funds" };
    }
    if (req.amountCents <= 0) return { ok: false, error: "invalid amount" };
    if (req.amountCents > 100_000_00) return { ok: false, error: "sandbox cap is $100,000" };
    return { ok: true, providerRef: `sandbox-dep-${req.userId}-${Date.now()}` };
  },
  async requestWithdrawal(req) {
    if (req.amountCents <= 0) return { ok: false, error: "invalid amount" };
    return { ok: true, providerRef: `sandbox-wd-${req.userId}-${Date.now()}`, status: "pending" };
  },
  getStatus() {
    return {
      mode: "sandbox",
      live: false,
      message: "Sandbox Cage — test funds only. No cards, no ACH, no live partner wallet.",
    };
  },
};

const PARTNER_NOT_CONNECTED =
  "partner wallet not connected — set PIT_PAYMENTS=partner and wire PartnerWalletClient";

const LIVE_NOT_IMPLEMENTED =
  "live partner client not implemented — implement PartnerWalletClient and enable only with credentials + explicit live flag";

function makePartnerStub(opts: {
  name: string;
  mode: PaymentsMode;
  refuseMessage: string;
  statusMessage: string;
}): PaymentsAdapter {
  return {
    name: opts.name,
    mode: opts.mode,
    live: false,
    async deposit() {
      return { ok: false, error: opts.refuseMessage };
    },
    async requestWithdrawal() {
      return { ok: false, error: opts.refuseMessage };
    },
    getStatus() {
      return {
        mode: opts.mode,
        live: false,
        message: opts.statusMessage,
      };
    },
  };
}

/** Partner path selected via env, but no real wallet client — always refuses money movement. */
export const partnerStubPayments: PaymentsAdapter = makePartnerStub({
  name: "partner_stub",
  mode: "partner_stub",
  refuseMessage: PARTNER_NOT_CONNECTED,
  statusMessage:
    "Partner mode selected, but PartnerWalletClient is not wired. No deposits or withdrawals. See GO_LIVE.md.",
});

/** PIT_PAYMENTS=live still never charges — requires a real client, not env alone. */
export const partnerLiveNotImplemented: PaymentsAdapter = makePartnerStub({
  name: "partner_stub",
  mode: "partner_stub",
  refuseMessage: LIVE_NOT_IMPLEMENTED,
  statusMessage:
    "PIT_PAYMENTS=live requested, but live partner client is not implemented. Refusing all charges.",
});

/**
 * Select adapter from PIT_PAYMENTS.
 * - unset / sandbox → sandbox (only path that credits the ledger today)
 * - partner / partner_stub → partner stub (refuses deposits)
 * - live → still stub; never live-charges from env alone
 */
export function getPaymentsAdapter(): PaymentsAdapter {
  const raw = (process.env.PIT_PAYMENTS || "sandbox").trim().toLowerCase();
  if (raw === "partner" || raw === "partner_stub") return partnerStubPayments;
  if (raw === "live" || raw === "partner_live") return partnerLiveNotImplemented;
  return sandboxPayments;
}

export function getPaymentsStatus(): PaymentsStatus & { adapter: string } {
  const pay = getPaymentsAdapter();
  const status = pay.getStatus();
  return { adapter: pay.name, ...status };
}

export type { PartnerWalletClient } from "./payments/partner";
