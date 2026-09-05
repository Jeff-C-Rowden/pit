# Pit

Local 21+ sandbox casino. Six tables. The server owns the ledger, cards, reels, dice, and wheel. The browser cannot credit money.

Not a licensed gambling operator. No live payments. Sandbox deposits write a ledger row. A payments adapter exists so a licensed processor can be added later.

Operating this as real-money gambling requires a gambling license and licensed payments.

**Go live / partner path:** see [GO_LIVE.md](./GO_LIVE.md) — white-label outreach list, email template, and honest constraints. Do not claim Pit is licensed.

## Games

1. Blackjack — 6-deck shoe, dealer stands on soft 17, BJ 3:2, hit/stand/double, split once, insurance.
2. Gilded Track — 5-reel, 9-line video slot. Paytable on the machine. Theoretical RTP 94-96 percent (enumerated in tests).
3. Texas Hold'em — heads-up no-limit vs the house bot. Blinds $1 / $2.
4. Roulette — American wheel (0 and 00). Inside and outside bets.
5. Craps — pass / don't pass, come / don't come, odds, place, field, props. Come-out, point, seven-out.
6. Pai Gow Poker — house banks. House Way or manual set. 5 percent commission on player wins.

## Run

Node 20+. From /workspace/pit run the install, test, and dev scripts in package.json.

Dev binds 0.0.0.0:3000. Open http://127.0.0.1:3000

Confirm 21+, sign up (password 8+), Cage to add test funds, then play.

Pit boss desk: register as pitboss@pit.local

## Env

PIT_DB_PATH defaults to ./data/pit.sqlite  
SESSION_SECRET — set in production  
OPERATOR_EMAIL defaults to pitboss@pit.local  

PIT_PAYMENTS — payments adapter selector (default `sandbox`):

- `sandbox` (or unset) — Cage “Add test funds” credits the ledger (no cards)
- `partner` / `partner_stub` — partner stub; refuses deposits until PartnerWalletClient is wired
- `live` — still refuses; live partner client is not implemented (env alone never enables charges)

Cage UI shows adapter mode via `GET /api/wallet/status`.


## Deploy

Production image uses Next.js `output: 'standalone'` (see `Dockerfile`). SQLite lives on a volume at `PIT_DB_PATH` (default `/data/pit.sqlite`).

### Fly.io

1. Create the app volume once: `fly volumes create pit_data --region ord --size 1`
2. Set secrets as needed: `fly secrets set SESSION_SECRET=...`
3. Deploy: `fly deploy` (uses `fly.toml`; app name `pit-demo-jeff` — rename if taken)

### Railway

`railway.toml` builds with the Dockerfile. The image `ENTRYPOINT` (`docker-entrypoint.sh`) creates/chowns the `PIT_DB_PATH` directory (default `/data/pit.sqlite`) then drops to the `node` user via gosu — needed because Railway volumes are often root-owned while the app should not stay root.

Mount a persistent volume at `/data`. Set `SESSION_SECRET` and `PIT_PAYMENTS=sandbox` in the service env. Cookies use `Secure` when `NODE_ENV=production` (or set `PIT_COOKIE_SECURE=1`).

If signup still returns `unable to open database file` after a volume mount, set emergency env `PIT_DB_PATH=/tmp/pit.sqlite` (ephemeral; prefer fixing volume ownership via the entrypoint).

## Tests

The test script runs vitest: ledger idempotency and isolation, blackjack rules, hold'em ranking, roulette payouts, craps come-out/point, pai gow, slot RTP band, payments adapter selection.
