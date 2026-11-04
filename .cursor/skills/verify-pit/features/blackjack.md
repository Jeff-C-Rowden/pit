# Blackjack

A funded player deals a hand at the blackjack table, optionally declines insurance, stands through play, and settles with a server-owned result and ledger update.

## Sub-features

- `bj-deal` debits the bet and returns a game in `play`, `insurance`, or already `settled` (natural).
- `bj-insurance` declines or takes insurance when the dealer shows Ace.
- `bj-stand` completes a play-phase hand to `settled`.
- `bj-ledger` keeps balance consistent with bet and payout.

## How to get to it (user POV)

- From `/floor`, open **Blackjack** (`/blackjack`).
- Pick a chip / bet, choose **Deal**. If insurance appears, choose **No insurance** or **Insurance**. In play, choose **Hit** or **Stand** (and **Double** / **Split** when offered).

## Driving it with verify-pit

Preconditions:

- Healthy verify instance (`doctor: OK`).
- Player has Cage funds (harness deposits $100).

- **Seed.** Age + signup + deposit via harness (automatic in `drive.mjs --feature blackjack`).
- **Deal.** `POST /api/games/blackjack` `{action:"deal", betCents:500}` → `200` and `game` with `phase` in `play|insurance|settled`.
- **Insurance path.** If `phase === "insurance"`, `POST` `{action:"insurance", take:false, gameId}`.
- **Stand.** If `phase === "play"`, `POST` `{action:"stand", gameId}` → eventually `phase === "settled"` with `result` / `payoutCents`.
- **Confirm.** `GET /api/auth/me` balance matches deal/stand responses.
- **Proof.** Evidence includes `03-deal.json`, final settle JSON, and `SUMMARY.json` with phase/result/balance.

## Gotchas

- Naturals settle on deal — do not require a Stand button in that case; assert `settled` + result instead.
- Open hand blocks a second deal until settled or abandoned.
- UI bots at empty chairs are cosmetic; only the player's hand hits the ledger.
- Insufficient balance yields a Cage hint in UI; deposit first.
