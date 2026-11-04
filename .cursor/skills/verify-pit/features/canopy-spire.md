# Canopy Spire progressive

Canopy Spire is the jungle progressive at `/vault` (API `/api/games/slot-progressive`). Players see live Mini/Minor/Major/Grand meters, spin with a coin contribution to those meters, and receive line wins plus any progressive awards from the server.

## Sub-features

- `vault-meters` lists four public progressive tiers.
- `vault-spin` debits coin-in, applies contribution BPS to meters, credits line + progressive wins.
- `vault-ledger` matches balance to bet and total win.

## How to get to it (user POV)

- From `/floor`, open **Canopy Spire** (`/vault`) — card shows **LIVE Progressive** and `aria-label="Live progressive meters"`.
- Choose coin size, **Spin**. Jackpot modal may appear on tier hits.

## Driving it with verify-pit

Preconditions:

- `doctor: OK`; deposit enough for at least one spin (harness uses `$250`).

- **Meters.** `GET /api/games/slot-progressive` → `meters` array with names including Mini, Minor, Major, Grand.
- **Spin.** `POST /api/games/slot-progressive` `{coinCents:100}` → `spin` + updated `meters` + `user`.
- **Ledger.** `balance = before - spin.betCents + spin.winCents`.
- **Proof.** `02-meters-before.json`, `03-spin.json`, `SUMMARY.json` with `meterNames`.

## Gotchas

- README “six games” is stale; this seventh floor entry is real — prefer `src/app/floor/page.tsx` and `/vault`.
- Progressive contribution is a share of the bet, not an extra debit.
- Hitting Grand is rare; proof does not require a jackpot — meters + ledger after one spin is enough.
