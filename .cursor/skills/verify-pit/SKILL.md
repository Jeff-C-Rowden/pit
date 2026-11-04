---
name: verify-pit
description: "Drive and prove Pit (local 21+ sandbox casino) via its Next.js web UI and JSON APIs at http://127.0.0.1:3000. Use when verifying signup/Cage wallet, blackjack, Gilded Track, Canopy Spire (/vault), roulette, or other floor behavior; when an agent needs a scripted launch→doctor→drive→evidence→cleanup loop for this repo."
---

# Verify Pit

Pit is a Next.js 14 sandbox casino (adults 21+). The server owns the ledger; the browser cannot credit money. Primary surface: web UI at `http://127.0.0.1:3000`. Secondary: JSON APIs under `/api/*`, vitest unit tests, and root `e2e.mjs` (cookie-jar HTTP).

**Not a licensed gambling operator.** Always run with `PIT_PAYMENTS=sandbox`. Do not claim live payments or licensed play.

This skill is for agents. Read `features/README.md`, then drive one mapped feature end to end.

## Isolate (read before launch)

- Next is hard-bound to **port 3000** (`npm run dev` → `next dev -H 0.0.0.0 -p 3000`). **Two instances cannot run.** If `:3000` is already listening, **refuse double-drive** — do not attach to a foreign process.
- Disposable DB via `PIT_DB_PATH` (launch helper sets `run/db-<runId>/pit.sqlite`). Never point verification at the developer's `./data/pit.sqlite` unless they explicitly ask.
- Kill **only** the process group recorded in `run/state.env` (`VERIFY_PIT_PGID` / `VERIFY_PIT_PID` from `setsid`). Never `pkill -f next` / kill by process name.

## Launch

From the Pit repo root (`/workspace/pit`):

```bash
/workspace/pit/.cursor/skills/verify-pit/bin/launch
```

What it does:

1. Refuses if `run/state.env` still points at a live PID, or if `:3000` is already bound.
2. Sets `PIT_DB_PATH` to a disposable SQLite under `run/db-<runId>/`, `PIT_PAYMENTS=sandbox`, `SESSION_SECRET=verify-pit-local-only`.
3. Runs `npm run dev` in the background; waits until `http://127.0.0.1:3000/` answers.
4. Writes `run/state.env` with `VERIFY_PIT_PID`, `VERIFY_PIT_BASE`, `VERIFY_PIT_DB_PATH`, etc.

Ready signal: HTTP 200 from `/` (or `/api/wallet/status`). Log: `run/next.log`.

Manual equivalent (only if you understand isolation):

```bash
cd /workspace/pit
export PIT_DB_PATH=/tmp/pit-verify-$$/pit.sqlite PIT_PAYMENTS=sandbox SESSION_SECRET=verify-pit-local-only
mkdir -p "$(dirname "$PIT_DB_PATH")"
npm run dev
# ready when curl -sf http://127.0.0.1:3000/ succeeds
```

## Doctor

```bash
/workspace/pit/.cursor/skills/verify-pit/bin/doctor
```

Requires prior `bin/launch`. Checks:

- `VERIFY_PIT_PID` still alive
- `:3000` listening
- `GET /api/wallet/status` → `"mode":"sandbox"`
- `GET /api/auth/me` reachable
- `GET /` → 200

Exit `0` and print `doctor: OK` before driving. If anything looks off mid-run, re-run doctor first.

## Drive

Prefer the cookie-jar API harness (same pattern as root `e2e.mjs`) for ledger-accurate proofs. Use a browser when the proof must show UI-visible state (ARIA, screenshots).

### API harness (primary)

```bash
node /workspace/pit/.cursor/skills/verify-pit/bin/drive.mjs --feature <id>
```

Features: `signup-cage` | `blackjack` | `gilded-track` | `canopy-spire` | `roulette`

Optional: `--evidence /path/to/dir` (default: `evidence/<feature>/<timestamp>/`).

Harness flow always: age gate (`POST /api/auth/me` `{age:21}`) → signup → deposit (unless proving age-only) → game action → assert ledger / response body → write JSON + `transcript.txt` + `SUMMARY.json`.

Stable API routes (from code, not stale README):

| User path | Route |
|-----------|--------|
| Age gate | `POST /api/auth/me` body `{age:21}` → cookie `pit_age=21` |
| Signup | `POST /api/auth/signup` `{email,password,displayName}` (password 8+) |
| Login | `POST /api/auth/login` |
| Me | `GET /api/auth/me` |
| Cage status | `GET /api/wallet/status` |
| Deposit | `POST /api/wallet/deposit` `{amountCents}` — amounts: 1000,2500,5000,10000,25000,50000,100000 |
| Blackjack | `POST /api/games/blackjack` `{action, betCents?, gameId?}` |
| Gilded Track | `POST /api/games/slot` `{coinCents}` |
| Canopy Spire | `GET|POST /api/games/slot-progressive` (`/vault` UI) |
| Roulette | `POST /api/games/roulette` `{bets:[{kind,numbers,amountCents}]}` |

### Browser (UI-visible proofs)

Base: `http://127.0.0.1:3000`. Age gate button label: **I am 21 or older — enter**. Nav (`aria-label="Main"`): Floor, Cage, Rules. Floor cards link to `/blackjack`, `/slot`, `/vault`, `/holdem`, `/roulette`, `/craps`, `/paigow`. Cage deposit buttons show dollar amounts (`$10` … `$1,000`). Blackjack dock: **Deal**, **Hit**, **Stand**. Prefer those labels / routes over CSS coordinates.

Operator desk: register as `pitboss@pit.local` → `/pit`.

### Existing root harness

`node /workspace/pit/e2e.mjs` covers age→signup→deposit→slot→bj→roulette→craps→holdem→paigow→withdraw→tamper→isolation. Prefer `bin/drive.mjs` for single-feature evidence under this skill; use `e2e.mjs` for a broad smoke only after doctor.

## Evidence

Directory: `/workspace/pit/.cursor/skills/verify-pit/evidence/<feature>/<timestamp>/`

Each successful drive writes:

- Step JSON (`01-….json`, …)
- `SUMMARY.json` (`ok: true`, feature id, key balances / results)
- `transcript.txt`

Proof standards:

- Exercise the real user path (age cookie → signup → Cage deposit → game API). Do not invent credits via test-only endpoints (there are none for wallet credit outside deposit).
- Capture action **and** resulting balance / game phase, not only the final number.
- Confirm ledger math: `balance_after = balance_before - bet + win` (or deposit add).
- Mocks only at the payments boundary: sandbox mode is the product's real dry-run; verify `wallet/status.mode === "sandbox"` and that deposits set `sandbox: true`.
- Screenshots (if browser): include Pit chrome (brand / Sandbox chip) and the feature under test.

**Cleanup must not delete `evidence/`.**

## Cleanup

```bash
/workspace/pit/.cursor/skills/verify-pit/bin/cleanup
```

Signals only process group `-$VERIFY_PIT_PGID` (fallback: recorded PID + its children), removes the disposable `run/db-<runId>/` tree and `state.env` / `next.log`. Leaves `evidence/` alone.

After failed iterations, always run cleanup before the next launch so ports and state are not stranded.

## Helpers

All under `/workspace/pit/.cursor/skills/verify-pit/bin/` (executable):

| Script | Invocation |
|--------|------------|
| `launch` | `/workspace/pit/.cursor/skills/verify-pit/bin/launch` |
| `doctor` | `/workspace/pit/.cursor/skills/verify-pit/bin/doctor` |
| `drive.mjs` | `node /workspace/pit/.cursor/skills/verify-pit/bin/drive.mjs --feature signup-cage` |
| `cleanup` | `/workspace/pit/.cursor/skills/verify-pit/bin/cleanup` |

Typical loop:

```bash
/workspace/pit/.cursor/skills/verify-pit/bin/launch
/workspace/pit/.cursor/skills/verify-pit/bin/doctor
node /workspace/pit/.cursor/skills/verify-pit/bin/drive.mjs --feature signup-cage
/workspace/pit/.cursor/skills/verify-pit/bin/cleanup
# confirm evidence dir still present
ls /workspace/pit/.cursor/skills/verify-pit/evidence/signup-cage/
```

## Feature map

See [`features/README.md`](features/README.md). Drive one mapped feature per proof run unless asked for more.
