# Pit verification map

This directory is the maintained source for verifying user-facing behavior of Pit (Next.js sandbox casino at `http://127.0.0.1:3000`). Read this index before driving, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch via `/workspace/pit/.cursor/skills/verify-pit/bin/launch` (disposable `PIT_DB_PATH`, `PIT_PAYMENTS=sandbox`, port 3000).
- Run `/workspace/pit/.cursor/skills/verify-pit/bin/doctor` and require `doctor: OK` with `mode":"sandbox"`.
- Never drive an instance you did not start with `bin/launch`. If `:3000` is occupied by another process, refuse.
- Adults 21+ age cookie is required before signup and play. Password length ≥ 8.
- Do not claim licensed gambling or live payments.

## Driving conventions

- Start every recipe from a fresh launched instance (empty disposable DB) unless a feature says otherwise.
- Prefer the HTTP cookie-jar harness (`bin/drive.mjs`) for ledger proofs; use browser for UI-visible proofs.
- Prefer ARIA labels, route paths, and button text (`Deal`, `Cage`, `I am 21 or older — enter`) over CSS position.
- Treat commands as literal.
- Cleanup removes the verify instance and disposable DB; **never** remove `evidence/`.

## Proof and skip reporting

- Capture the user action and resulting state (balance, phase, pocket, meters), not only the final screen.
- API proof: request/response JSON files + `SUMMARY.json` + `transcript.txt` under `evidence/<feature>/<timestamp>/`.
- Mutation proof: second read via `GET /api/auth/me` (or meters GET) after the mutation.
- Record the feature id in `SUMMARY.json`.
- Report unreachable paths with the attempted command and unmet precondition. Do not mark a skipped entry point verified via a different path.

## Feature entry contract

Each feature file: H1 + one paragraph, then exactly four H2s — `Sub-features`, `How to get to it (user POV)`, `Driving it with verify-pit`, `Gotchas`.

## Features

- [Signup and Cage wallet](./signup-cage.md) — age gate, signup, sandbox deposit, balance isolation.
- [Blackjack](./blackjack.md) — deal / insurance / stand settle with ledger debit-credit.
- [Gilded Track](./gilded-track.md) — 5-reel slot spin and ledger math (`/slot`).
- [Canopy Spire progressive](./canopy-spire.md) — vault progressive meters and spin (`/vault`).
- [Roulette](./roulette.md) — American wheel outside bet spin.
