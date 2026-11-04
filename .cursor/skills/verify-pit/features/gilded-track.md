# Gilded Track

A funded player spins the Gilded Track video slot (`/slot`). The server returns a spin with bet/win cents and updates the ledger; the client cannot invent `winCents`.

## Sub-features

- `slot-spin` posts a coin size and receives grid / line wins from the server.
- `slot-ledger` asserts `balance = prior - betCents + winCents`.
- `slot-tamper` (covered by root `e2e.mjs`) ignores client-supplied fake win fields.

## How to get to it (user POV)

- From `/floor`, open **Gilded Track** (`/slot`).
- Pick a coin size, choose **Spin · $…**.

## Driving it with verify-pit

Preconditions:

- `doctor: OK`; sandbox deposits available.

- **Seed.** Age + signup + deposit `$100`.
- **Spin.** `POST /api/games/slot` `{coinCents:100}` → `200` and `spin` with `betCents` / `winCents`.
- **Ledger.** `user.balanceCents === 10000 - spin.betCents + spin.winCents`.
- **Proof.** `evidence/gilded-track/<ts>/02-spin.json` and `SUMMARY.json`.

## Gotchas

- Sending `winCents` / `balanceCents` in the body must not credit arbitrary funds (see `e2e.mjs` tamper check).
- Coin size is per-line context; total bet is `spin.betCents` from the server — assert that, not a guessed total.
- UI “Spinning…” is animation; ledger truth is the API response.
