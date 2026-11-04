# Signup and Cage wallet

A new adult confirms 21+, creates an account at $0, adds sandbox test funds in the Cage, and sees the credited balance. A second account cannot see or share that balance.

## Sub-features

- `age-gate` sets the `pit_age=21` cookie via the gate or API.
- `signup` creates a user with password 8+ and starting balance 0.
- `cage-deposit` posts an allowed sandbox amount to the ledger.
- `wallet-status` shows payments adapter mode `sandbox`.
- `isolation` proves a second user's balance stays independent.

## How to get to it (user POV)

- Open `/`, choose **I am 21 or older — enter**, then continue to `/signup`.
- Or open `/signup` after the age cookie exists; fill email, password (8+), display name, confirm 21+, submit.
- From the floor or nav (`aria-label="Main"`), choose **Cage** (`/wallet`). Tap an **Add test funds** amount (`$10` … `$1,000`).

## Driving it with verify-pit

Preconditions:

- `bin/launch` completed; `bin/doctor` prints `doctor: OK`.
- Disposable DB is empty (fresh launch).

- **Age gate.** Confirm 21+. Run `node …/bin/drive.mjs --feature signup-cage` (or `POST /api/auth/me` with `{age:21}`). Response `200` and `{age:21}`; cookie jar holds `pit_age`.
- **Signup.** Create a unique `*@pit.test` user. Response `200` with `user.balanceCents === 0`.
- **Wallet status.** `GET /api/wallet/status` returns `mode: "sandbox"`.
- **Deposit.** `POST /api/wallet/deposit` with `{amountCents:10000}`. Response includes `sandbox: true` and `user.balanceCents === 10000`.
- **Confirm.** `GET /api/auth/me` shows the same balance.
- **Isolation.** Second jar: age + signup → balance 0; first user's `me` still 10000.
- **Proof.** Evidence dir contains `04-deposit.json`, `05-me-confirm.json`, `06-isolation.json`, and `SUMMARY.json` with `ok: true`.

## Gotchas

- Without the age cookie, signup returns 403 `21+ only`.
- Deposit amounts outside the fixed list (`1000…100000`) fail; do not invent `$15`.
- `PIT_PAYMENTS=partner` disables Cage test funds — doctor must fail closed unless intentionally testing partner refusal.
- README says “six games”; the floor also lists Canopy Spire at `/vault` — wallet proofs do not depend on game count.
- Cleanup deletes the disposable DB; keep evidence files.
