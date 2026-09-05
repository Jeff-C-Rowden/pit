# Go live (real money)

Honest shortest legal path = white-label / platform partner.

Pit is **not** a licensed gambling operator. Do not claim it is licensed. Do not add Stripe for gambling. Sandbox Cage remains the only money path until a licensed partner wallet is wired through `PaymentsAdapter` / `PartnerWalletClient`.

## Soft demo (now)

- GitHub free account → push Pit
- Host demo (Railway/Fly preferred over Vercel because better-sqlite3; or migrate to Postgres later)
- Sandbox Cage only (`PIT_PAYMENTS=sandbox` or unset)

## Partner tracks

### Fastest offshore / international (weeks–months, capital for setup fees)

1. SoftGamings — mid-market WL, broader payments — https://www.softgamings.com/
2. SoftSwiss — crypto + aggregation heavy — https://www.softswiss.com/
3. EveryMatrix — modular enterprise — https://everymatrix.com/

Note setup fees often tens of thousands EUR + rev share. Confirm current contact pages when emailing.

### US regulated (longer: state license + market access + certified PAM)

US does not work like offshore WL under someone else's umbrella the same way. Need licensed operator / market access (often with a land-based partner) + US-certified platform.

1. Strive Gaming — NA-focused PAM — https://strivegaming.com/
2. White Hat Gaming — US PAM deployments — search whitehatgaming.com
3. EveryMatrix — more US readiness among big WL names

## Pitch (what Pit is)

Original web casino: blackjack, Hold'em, American roulette, craps, pai gow, slot. Server-authoritative ledger in integer cents. Sandbox wallet today; PaymentsAdapter ready for partner wallet.

## Email template

**Subject:** Pit — original casino product seeking white-label / wallet partnership

**Body:**

Hi,

I'm Jeff Rowden. I built Pit — an original web casino (blackjack, Texas Hold'em, American roulette, craps, pai gow poker, and a video slot) with a server-authoritative ledger in integer cents.

Today the Cage is sandbox-only. The payments layer is already adapter-shaped so we can plug into a licensed partner wallet / PAM without rewriting game code.

I'm looking for licensed rails and optionally a white-label platform partnership (wallet, KYC/AML, game aggregation as needed). Could you point me to the right sales / partnerships contact for an intro call?

Happy to share a hosted demo link when available.

Thanks,  
Jeff Rowden

## Env note

- `PIT_PAYMENTS=sandbox` (default) — Cage test funds
- `PIT_PAYMENTS=partner` or `partner_stub` — stub that refuses deposits until `PartnerWalletClient` is implemented
- `PIT_PAYMENTS=live` — still refuses; live client is not implemented and must not be enabled from env alone

See `src/lib/payments.ts` and `src/lib/payments/partner.ts`.
