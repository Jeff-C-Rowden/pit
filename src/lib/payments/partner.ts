/**
 * Skeleton for a licensed partner wallet / PAM client.
 *
 * A SoftSwiss, SoftGamings, EveryMatrix, Strive Gaming, or White Hat Gaming
 * integration would implement PartnerWalletClient and wire it into
 * getPaymentsAdapter() — never enable live charges from env alone.
 *
 * See GO_LIVE.md for partner outreach. Do not add Stripe for gambling.
 */

export type PartnerDepositSession = {
  sessionId: string;
  checkoutUrl: string;
};

export type PartnerWithdrawal = {
  withdrawalId: string;
  status: "pending" | "processing" | "completed" | "failed";
};

/**
 * Implement this against the partner's wallet / payment API after contracts
 * and credentials are in place. Until then, partnerStubPayments refuses all
 * money movement.
 */
export interface PartnerWalletClient {
  createDepositSession(args: {
    userId: string;
    amountCents: number;
    returnUrl: string;
  }): Promise<PartnerDepositSession>;

  createWithdrawal(args: {
    userId: string;
    amountCents: number;
  }): Promise<PartnerWithdrawal>;

  verifyWebhook(payload: string | Buffer, signature: string): Promise<{
    ok: boolean;
    event?: string;
    userId?: string;
    amountCents?: number;
    providerRef?: string;
  }>;
}

// Example (commented): once a real client exists, export it and select it
// from getPaymentsAdapter() only when PIT_PAYMENTS=partner AND credentials
// are present AND an explicit live-enable flag is set.
//
// export function createPartnerWalletClient(_env: {
//   apiKey: string;
//   baseUrl: string;
//   webhookSecret: string;
// }): PartnerWalletClient {
//   throw new Error("PartnerWalletClient not implemented — wire SoftSwiss / SoftGamings / etc.");
// }
