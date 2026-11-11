# Pit RTP audit — 10 Nov 2026

Jeff's ask: "all the machines need a payout percentage approximately like a real casino."

**Scope.** Every Pit game. Rebased onto origin/main after the Red Stag restyle (Gilded Track →
Sundown Trail, Canopy Spire → Antler Ridge, Buckshot Bars committed). `audit/exact.ts` now reads
the committed `src/lib/games/buckshot.ts` strips (14,976 combinations): 94.444% at 1–2 coins,
94.667% at 3 coins, confirming the earlier snapshot. Historical tables below still use the names
from the original audit day; the shipped games are Sundown Trail, Antler Ridge and Buckshot Bars.

**Branch.** `rtp-audit`, in the worktree `/workspace/pit-rtp-audit`.

## How the numbers were made

**Exact math.** It runs on the real server code: `src/lib/games/*`, `src/lib/progressive.ts`.

- **Slots:** every stop tuple is enumerated. That is 20^5 = 3.2M grids × 9 lines for the two video
  slots, and 24×24×26 for Buckshot.
- **Progressive:** solved in closed form, using renewal-reward plus a first-passage DP for the
  must-hit-by triggers (`src/lib/games/rtpMath.ts`).
- **Roulette:** all 38 pockets through `settleRoulette`.
- **Craps:** value iteration over all 36 dice outcomes through the real `resolveRoll`, until each
  bet's decision closes.

**Monte Carlo.** The real server game functions run with a seeded xoshiro128** RNG that replaces
`src/lib/rng.ts` at bundle time (`audit/`). Runs are 10M rounds per game or bet, made of 8 fixed
seeds × 1.25M, with extra seeds noted where used.

- The 95% CI uses the per-round ratio (delta method).
- Craps and the progressive use batch means across seeds, with a t interval, because rounds are
  not independent there.
- Craps rounds are rolls. A bet that wins and "stays up" is taken down, so each decision counts
  as one wager.

**Volatility.** SD = standard deviation of the net result of one round, per 1 unit bet. Buckets
for this audit:

| Bucket | SD per unit bet |
|---|---|
| Low | < 3 |
| Medium | 3 to 8 |
| High | > 8 |

**Hit frequency.** "Hit" means any return (stake back included). "Win" means a net profit.

## Results — current `origin/main` (before fixes)

| Game | True RTP (exact) | MC 10M (95% CI) | House edge | Displayed in UI / rules | Real-casino norm | Hit / win freq | SD per unit (vol.) | Verdict |
|---|---|---|---|---|---|---|---|---|
| **Gilded Track** (5×3, 9 lines) | **95.532%** | 95.465% ± 0.110 | 4.47% | "94–96% RTP" | Video slots 88–96% (see norms) | 51.45% / 30.5% | 1.77 (**Low**) | ✅ Honest and realistic. The display is accurate but vague; show 95.53%. |
| **Canopy Spire**, base game | **81.056%** | 80.927% ± 0.105 | — | "Line RTP targets ~93–95%" | — | 46.8% / 25.7% | 1.70 | ❌ **Mismatch: 12–14 points below the displayed figure.** |
| **Canopy Spire**, progressive share | +7.47% at $0.25 coin · +6.33% at $0.50 · +5.75% at $1 · +5.15% at $5 · +4.84% at $50 | see total | — | "3% of coin-in" | Progressive increment is typically 1–5% | — | — | ⚠️ Bet-dependent. The Grand hits 1 in 35,000 spins *at any bet*, so the $2,500 seed costs 3.2% of coin-in at the minimum bet but 0.02% at the maximum. The "3%" is also really 2.67% at $0.25 because contributions are floored to the cent. |
| **Canopy Spire, total** | **88.53% ($0.25 coin) → 85.89% ($50 coin)** | 88.23% ± 0.26 ($0.25) · 86.37% ± 0.59 ($5) | 11.5–14.1% | "93–95% before jackpots" | 88–96% | 46.9% / 25.9% | 8.0 at $0.25 · 2.8 at $5 (**Medium**) | ❌ **Outlier.** Total is below the displayed *base-game* figure and on the tight end of a Las Vegas penny floor. It also gets worse as the bet goes up. |
| Canopy Spire: "peer drip" | **+ unbounded house money** | not simulated (time-driven) | — | Not disclosed | None (real meters move only on coin-in) | — | — | ❌ `applyPeerDrip` adds about 1¢ per tier on every meter poll (/vault polls every 2.5 s, /floor every 4 s). That is up to **$57.60 per hour of free meter growth** with one tab open, capped just under each hidden trigger, so the next real spin hits. One player spinning $2.25 every 4 s gains about +2.8 points of RTP, and an idle tab fills the Mini in ~40 min. This is also simulated activity, which the earlier "no simulated peer drip" correction ruled out. |
| **Buckshot Bars** (WIP, 3-reel classic) | **94.444%** (1–2 coins) · **94.667%** (3 coins) | 95.04% ± 0.62 (1 coin) · 95.27% ± 0.63 (3 coins) | 5.56% / 5.33% | Computed from `exactBuckshotRtp` (matches) | Classic 3-reel 85–95% by denomination (NV $1 ≈ 93.6%, 25¢ ≈ 92.4%) | 19.08% / 8.8% | 9.81 / 9.99 (**High**) | ✅ Realistic and honest. The display is computed, so it can't drift. |
| **Blackjack** | — (MC only) | **99.595% ± 0.063** | **0.405%** | "roughly 0.5%" / API "~0.5%" | 0.40–0.46% for these rules (Wizard of Odds) | 52.4% any return / 43.4% win | 1.15 (**Low**) | ✅ Realistic. The display is slightly pessimistic; say "about 0.4%". |
| **Roulette** (American 0/00) | **94.737%** on all 15 bet types | 94.65–94.90%, each CI covers 94.74 | **5.263%** | "5.26% on every bet" | 5.26% standard; 7.89% five-number bet | 2.6% (straight) … 47.4% (even money) | 5.76 straight … 1.00 even money (Low–Medium) | ✅ Exact match. The 7.89% five-number bet is **not offered** (rejected server-side), which is better than the norm. |
| **Craps: pass / don't pass** | 98.586% / 98.597% | 98.46 ± 0.14 / 98.72 ± 0.14 | **1.414% / 1.403%** (1.364% counting bar-12 pushes) | "about 1.41%" | 1.41% / 1.36% | 49.3% / 49.3% win per decision | 1.00 (**Low**) | ✅ |
| Craps: odds (pass and lay) | 100.000% | pass + 2× odds 99.23 ± 0.22 (0.61% blended, as expected) | 0% | "true odds" | 0% | — | — | ✅ At $6+ chips. With small chips, payouts floor to the cent: 5/9 pass odds at $0.25 → 0.80% edge, lay odds at $0.25 → 1.3–1.8%. |
| Craps: place 6/8 · 5/9 · 4/10 | 98.485 · 96.000 · 93.333% | 98.48 ± 0.26 · 96.00 ± 0.25 · 93.24 ± 0.27 | 1.52 · 4.00 · 6.67% | "Place 6/8 pay 7:6" | 1.52 · 4.00 · 6.67% | 45.5% (6/8) | 1.08 (Low) | ✅ Place 6/8 at $0.25 chips → 1.82% (cent flooring). |
| Craps: field (2:1 on 2, 3:1 on 12) | 97.222% | 97.21 ± 0.07 | 2.78% | "Field 2/12 pay extra" | 2.78% (3:1 on 12) · 5.56% (2:1 on both) | 44.4% | 1.14 (Low) | ✅ The good version of the bet. |
| Craps: props | any 7 83.33 · any craps 88.89 · yo 88.89 · hard 4/10 88.89 · hard 6/8 90.91% | all within CI | 16.67 · 11.11 · 11.11 · 11.11 · 9.09% | "Props run much higher" | identical | 16.7% · 11.1% · 5.6% · — · 9.1% | 1.86 · 2.51 · 3.66 · 5.5 · 2.87 | ✅ Standard pays. |
| **Craps: COME** | **51.75%** | 51.77% ± 0.19 | **48.2%** | (implied: like pass) | 1.41% | — | — | ❌ **BUG.** A come bet on a number only won if that number was also the main point. Otherwise it waited until a seven-out. |
| **Craps: DON'T COME** | **146.77%** | 146.76% ± 0.19 | **−46.8% (player edge)** | (implied: like don't pass) | 1.40% | — | — | ❌ **BUG, exploitable.** A don't come bet on a number only lost if that number was the main point, so it nearly always waited for the 7. A player farming don't come gains about 47% of every bet. Numbered come and don't come bets also froze through come-out rolls. |
| **Hold'em heads-up vs bot** | no fixed edge (no rake; depends on player strategy) | calling station 49.8% ± 2.2 (−1.25 BB/hand) · bot-mirror 104% ± 7 (+0.17 BB/hand) · pot-raiser 34% | strategy-dependent | "No rake" | Casinos don't bank heads-up NLHE. Closest banked games: Ultimate Texas Hold'em ≈ 2.2% ante edge, Casino Hold'em ≈ 2.2%. Poker rooms take a 5–10% rake. | ~52% any return | 1.4 to 35+ BB (High, unbounded) | ⚠️ **Not a house-edge game.** Plus 2 bugs, prototyped below: (a) when the house folds its small blind at the deal (~0.9% of hands), the hand stays open with nobody to act, the blind is trapped and the table is soft-locked. (b) When the first actor calls a bet, action reopens for the house, which can re-raise without limit (pots of $10k+ seen in sims). |
| **Pai Gow Poker** (house way vs house way) | — (MC only) | **97.075% ± 0.049** | **2.93%** | Commission is stated, the edge is not | 2.72% (Wizard of Odds, Foxwoods house way, semi-wild joker) | 66.6% hit (incl. pushes) / 32.1% win | 0.79 (**Low**) | ⚠️ Realistic band, but 0.2 points worse than the norm. **Rules mismatch:** /rules says the joker is "ace or to complete a straight/flush", but `evalFive` makes it **fully wild** in 5-card hands. For example, joker + K + K counts as three kings. The simplified house way adds the rest of the gap. |

## Results — after the prototyped fixes (branch `rtp-audit`)

| Game | True RTP (exact) | MC check | House edge | New display text | Norm | Hit / win | SD (vol.) | Verdict |
|---|---|---|---|---|---|---|---|---|
| Canopy Spire, base game | **89.216%** | 89.33% ± 0.25 (2M) | — | "base game 89.2%" | — | 46.8% / 25.7% | 1.78 | ✅ |
| Canopy Spire, progressive | +5.61% ($50 coin) … +5.83% ($0.25 coin). Exactly 3.00% contribution at every bet; seeds funded 2.6–2.8%. | — | — | "plus 5.6–5.8% from the jackpots" | 1–5% typical | — | — | ✅ Near-flat across bet sizes. |
| **Canopy Spire, total** | **95.04% ($0.25) · 95.04% ($1) · 95.02% ($5) · 95.00% ($10) · 94.93% ($25) · 94.83% ($50)** | 95.25% ± 3.3 ($0.25) · 95.26% ± 0.70 ($1) · 95.18% ± 4.3 ($5) (2 seeds each, wide t-CI) | 4.96–5.17% | "Exact theoretical RTP 94.8–95.0% by coin size" | 88–96% | 46.9–49.5% / 26–27% | 6.7 at $0.25 · 3.9 at $1 · 2.4 at $5 (**Medium**) | ✅ Locked 95.0 ± 0.3 at every cabinet coin step. |
| Craps come / don't come | 98.586% / 98.597% at every point | 98.63 ± 0.14 / 98.54 ± 0.14 (10M) | 1.414% / 1.403% | "Come and don't come work like pass and don't pass" | 1.41 / 1.40% | 49.3% | 1.00 (Low) | ✅ |
| Hold'em | no rake | station 89.4% ± 0.16 (−0.13 BB/hand) · bot-mirror 100.8% ± 2.4 (+0.02 BB/hand) | strategy-dependent | unchanged | see above | 52% | 1.4 BB (station) | ⚠️ Bugs fixed. Still no house edge by design (see proposal 10). |
| Gilded Track, Buckshot, blackjack, roulette, other craps bets, Pai Gow | unchanged | — | — | Gilded display is now the exact "95.53%" | — | — | — | unchanged |

## Real-casino norms (sources)

**Slots**

- **Nevada, calendar 2025 statewide slot win:** 7.13% overall (RTP ≈ 92.9%), penny 9.09% (≈ 90.9%),
  25¢ 7.58%, $1 6.37% (≈ 93.6%), multi-denom 6.90%. Sources: Nevada Gaming Control Board, *Monthly
  Revenue Report, Dec 2025* (gaming.nv.gov), and UNLV Center for Gaming Research, *Nevada Gaming Win
  2025*.
- **Atlantic City:** 2025 slot payout ≈ 90.7%; casinos ranged 89.9–91.4% in Sep 2025–Aug 2026.
  Source: NJ Division of Gaming Enforcement annual and monthly slot data (njoag.gov), as compiled by
  Lodavo and toolsgambling.
- **Legal floors:** Nevada 75% theoretical; NJ 83% (N.J.A.C. 13:69E-1.28A).
- **Online and regulated video slots:** published RTPs commonly sit at 94–96%. Classic 3-reel
  floor games typically run 85–95% depending on denomination.

**Tables**

- **Blackjack:** Wizard of Odds rule calculator and variance tables. 6D S17 with no DAS, no
  surrender and no RSA is 0.57%. DAS is worth −0.16. Not allowing resplits adds a few hundredths.
  That gives ≈ 0.40–0.46%, and SD ≈ 1.14 per hand.
- **Pai Gow Poker:** Wizard of Odds (Foxwoods house way, 5% commission, dealer banks): house way
  2.72%, optimal 2.51%.
- **Roulette and craps:** standard combinatorics (American 2/38 = 5.26%, five-number 7.89%; craps
  pass 7/495 = 1.41%, don't pass 1.36% / 1.40%, place 6/8 1/66 = 1.52%, field with 3:1 on 12 =
  2.78%, props as listed).
- **Nevada table win (2025)** is win per drop, not house edge: 21 at 12.86%, craps 15.89%, roulette
  19.00%, Pai Gow Poker 20.70%. Don't compare those figures to edges directly.

## Fixes

### Prototyped on branch `rtp-audit` (tests lock them)

1. **Canopy Spire paytable retune.** Only the two lowest-paying symbols change; the reel strips are
   untouched.
   - `VINE` goes from 5/12/28 to **6/14/32**.
   - `BANANA` goes from 10/28/80 to **13/32/80**.
   - Base game moves from 81.06% to 89.22%. No near-miss changes; the window is still the true strip.
2. **The Grand mystery chance scales with the bet** (`mysteryCoinInPerHitCents` = $315,000).
   - Each spin hits with probability `bet / $315,000`: about 1 in 35,000 spins at a $1 coin,
     1 in 140,000 at $0.25, and 1 in 700 at $50.
   - Every dollar now has the same chance, and the $2,500 seed costs 0.79% of coin-in at every bet.
   - The old flat odds remain only for callers that pass no bet.
3. **Unbiased contribution rounding** (`splitContributionUnbiased`). Each tier gets floor(bet ×
   bps) cents, plus 1¢ with probability equal to the dropped fraction. The published 3.00% is now
   exact on average at every bet; flooring used to short a $0.25 coin to 2.67%.
4. **Removed `applyPeerDrip`.** Meters move only on real spins. The /vault poll still works; it
   just shows real values.
5. **Craps come and don't come.** Numbered come and don't come bets now resolve on their own number
   or a 7 on every roll, including come-out rolls.
   - Come odds are off on the come-out (returned).
   - Don't come lay odds stay working.
   - The old code paths in seven-out and point-hit were removed.
6. **Hold'em, house fold at the deal.** `startHoldem` now settles the hand if the house folds its
   small blind (player takes the pot).
7. **Hold'em, a matching call closes the street.** The house can no longer re-raise forever after
   the first actor calls.
8. **Display text now uses exact figures.**
   - Files: `/rules`, `feel.ts` coach cards, `SLOT_INFO.rtpNote`, `VAULT_SPIRE_INFO.rtpNote`,
     `/api/games/slot`.
   - Gilded is now "Exact theoretical RTP 95.53%".
   - Canopy is now "Exact theoretical RTP 94.8–95.0% … base game 89.2% plus 5.6–5.8% from the
     jackpots". It says the Grand's chance grows with the bet and the meters move only on real
     spins.
   - The craps edge list is spelled out.

### Shipped on merge (after the restyle)

9. **Pai Gow.** The joker is now an ace, or a straight/flush filler, matching /rules (`evalFive`).
   Joker + a pair of kings is ace-high two kings, not trips. House-way vs house-way Monte Carlo
   (2M hands) gives an edge of **2.85% ± 0.11** (95% CI); the UI says "about 2.9%". Our simplified
   house way is a little worse than the Foxwoods 2.72% norm. Hold'em rake/format was left for Jeff.
10. **Hold'em.** The two settlement bugs stay fixed. Rake and format are unchanged (Jeff decides).
11. **Blackjack display.** "About 0.4%" everywhere it used to say "roughly 0.5%" / "~0.5%".
12. **Antler Ridge WILD row.** Hidden from the belly glass and paytable (`VS_DISPLAY_PAYTABLE`).
    WILD still substitutes; it simply has no 3/4/5-WILD pay of its own because it cannot land three
    in a row. Math and RTP are unchanged (~95% including jackpots).
13. **Craps small chips.** Odds and place bets are only accepted in amounts that pay in whole cents.
    The felt snaps a $1 chip on place 6/8 (and awkward lay odds) up to $1.50.
14. **Roulette validation.** `split` / `street` / `corner` / `six` must be real adjacent numbers on
    the American felt (including 0-1, 0-2, 00-2, 00-3). Duplicates and 0-00 splits are rejected.
15. **Volatility labels.** Every lobby tile and in-game info panel shows a computed line
    (SD per $1: Low < 3, Medium 3–8, High > 8) plus a small original 3-bar gold-on-maroon meter.
    Antler Ridge is "Medium · jackpots included". Roulette and craps list volatility per bet on
    /rules and the in-game odds table. The lobby can be filtered by volatility. Nothing says a
    win is due.

## Hit frequency, volatility and lobby display

| Game | Hit freq (any return) | Win freq (net profit) | SD per unit bet | Proposed bucket |
|---|---|---|---|---|
| Gilded Track | 51.5% (≈ 1 in 1.9 spins) | 30.5% | 1.77 | **Low** |
| Canopy Spire (after fix) | 46.9–49.5% | 26–27% | 6.7 at $0.25 · 3.9 at $1 · 2.4 at $5 coin. Driven by the jackpots, so it rises as the bet *falls*. | **Medium** |
| Buckshot Bars | 19.1% (≈ 1 in 5.2 spins) | 8.8% | 9.8–10.0 | **High** |
| Blackjack | 52.4% | 43.4% | 1.15 | **Low** |
| Roulette even money / dozen / straight | 47.4% / 31.6% / 2.6% | same | 1.00 / 1.39 / 5.76 | **Low / Low / Medium** (by bet) |
| Craps pass, come, field / place 6 / props | 44–49% / 45% / 5.6–16.7% | same | 1.0–1.14 / 1.08 / 1.9–5.5 | **Low**, props **Medium** |
| Pai Gow Poker | 66.6% (40% pushes) | 32.1% | 0.79 | **Low** |
| Hold'em vs bot | ~52% | ~48% | 1.4 BB to unbounded (strategy) | **High** |

**Display note (proposal for the restyle):**

- Every lobby tile and in-game info panel gets one honest strip: **"RTP 95.53% · Volatility Low ·
  wins about 1 in 3 spins"**. For tables: **"House edge 0.4% · Low volatility"**.
- These should be generated from server constants: `rtpMath.ts` exact figures, `exactBuckshotRtp`,
  and the table edges, so they never drift from the math.
- The volatility chip should use the three buckets above, with a one-line tooltip: "Low = frequent
  small wins; High = rare bigger wins."
- Canopy Spire should carry "Medium · jackpots included in RTP".
- Roulette and craps should show the bucket per bet in the odds table, not one per game.
- Nothing that implies a win is "due"; the RTP is the long-run figure.

## Test status

`npx vitest run` gives **51 files, 329 tests, all passing** (Node 22). `tsc --noEmit` is clean.

New `tests/rtpAudit.test.ts` (exact, no sampling, ±0.3 points):

- Gilded at 95.53%.
- Canopy base game at 89.22%.
- Canopy total at 95.0% for every cabinet coin step ($0.25–$50), with exactly 3.00% contribution.
- Grand return is independent of bet size.
- The unbiased split averages exactly the published bps.
- Every roulette bet at 36/38, and the five-number bet rejected.
- Craps pass 7/495, don't pass 27/1925 per resolved bet, come and don't come equal to those for
  every point, and place 6 at 1/66 and field at 1/36.
- Come on 5 wins with the point on 6.
- Hold'em: a house fold at the deal settles, and a call closes the street.

Both hold'em tests and the craps tests fail on the old code.

Updated existing tests:

- `coachMarks` now checks the new exact display strings.
- `progressive` now checks the unbiased contribution range instead of the floor.
- `westernSymbols` now checks the retuned Antler Ridge paytable. The restyle deleted
  `dragonSymbols.test.ts`; that deletion was kept.

## Merge notes

- `src/lib/games/craps.ts`, `holdem.ts`, `slotProgressive.ts`, `progressive.ts`, `rtpMath.ts` (new),
  `slot.ts`, the `slot` and `slot-progressive` routes, `feel.ts` and `rules/page.tsx` are the only
  app files touched. No UI components were changed.
- `src/app/vault/page.tsx` still has a "Peer drip poll" comment. The poll is harmless without the
  drip, but it can be slowed down or removed in the restyle.
- Buckshot Bars needed no math change. Re-ran `audit/exact.ts` against the committed strips:
  94.444% (1–2 coins) / 94.667% (3 coins) over 14,976 combinations.

## Canary Creek Mine (story slot #1) — 11 Nov 2026

5×3, 9 lines, 30-stop strips. Features: DYNAMITE scatter (3/4/5 pay 2×/10×/50× bet and award
8/12/20 free spins, all free-spin wins ×2, retriggers, cap 100 free spins per feature) and the Mine
Cart pick (cart on reels 1, 3 and 5; 12 carts = 2,2,3,3,4,5,6,8,12× bet + 3 COLLECT; first pick is
always a prize; reveal order drawn at trigger). Code: `src/lib/games/mine.ts`; harness `audit/mine.ts`.

| Part | Exact | MC 10M (8 seeds × 1.25M, $0.25 coin) |
|---|---|---|
| Lines | 70.331% | |
| Dynamite scatter pays | 2.120% | |
| **Base game** | **72.451%** (closed form = 30^5 enumeration) | 72.58% |
| **Free spins** | **10.974%** (P = 0.856%, 8.847 spins avg incl. retriggers, 12.82× bet avg; exact DP + Wald) | 10.98% |
| **Mine Cart pick** | **12.000%** (P = 0.800%, 15× bet avg) | 11.98% |
| **Total RTP** | **95.425%** | **95.538% ± 0.193** |
| SD per $1 | 3.112 (exact, moment DP) → **Medium** | 3.114 |
| Hit rate (any return or feature) | 44.70% | 44.74% |
| Net-win rate | | 18.86% (1 in 5) |
| Free spins / Mine Cart frequency | 1 in 116.8 / 1 in 125 | 1 in 116.5 / 1 in 125.1 |

Free spins and the Mine Cart can never trigger on the same spin (DYNAMITE and CART never share a
window on reels 1/3/5). Max observed return in 10M spins: 194.9× bet. Feature cap never reached.
