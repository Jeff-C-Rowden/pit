# Roulette

A funded player places an outside (or inside) bet on the American wheel and spins. The server returns the pocket and payout; the ledger reflects the stake and win.

## Sub-features

- `rl-outside` places a kind such as `red` with `amountCents`.
- `rl-spin` returns `spin.pocket` and `spin.payoutCents`.
- `rl-ledger` updates user balance from the response.

## How to get to it (user POV)

- From `/floor`, open **Roulette** (`/roulette`).
- Pick a chip, drop on a number/outside, choose **Spin**.

## Driving it with verify-pit

Preconditions:

- `doctor: OK`; funded player.

- **Seed.** Age + signup + deposit.
- **Spin.** `POST /api/games/roulette` `{bets:[{kind:"red", numbers:[], amountCents:100}]}` → `200` and `spin.pocket` defined.
- **Proof.** `02-spin.json` + `SUMMARY.json` with pocket and payout.

## Gotchas

- American wheel includes `0` and `00`; pocket may be string or number depending on serialization — assert presence, then compare carefully.
- Empty `bets` is rejected; UI disables Spin until chips are down.
- Inside bets need `numbers` populated; outside kinds use empty `numbers` as in `e2e.mjs`.
