# Pit demo improvement backlog

Rules for every item: no fake wins, no misrepresented odds or near-miss rigging, keep "Sandbox / test chips" labels and 21+ gating, keep responsible-play tools visible, original art only. One tested item ships per cycle.

| # | Area | Idea | Status |
|---|------|------|--------|
| 1 | Onboarding | First-visit welcome sheet: claim $100 sandbox chips (idempotent, once per account) + 4-step lobby tour with responsible-play step. Mobile-first. | Shipped cycle 1 |
| 2 | Visuals | Game-card art: original SVG illustrations per table (felt, wheel, reels) replacing flat cards. | Next after #3 remainder |
| 3 | Game feel | Haptics (navigator.vibrate) + optional sound toggle on spins, deals and wins, off by default, respects reduced motion. | |
| 4 | Session engagement | "Session panel": time played, net result, bets placed, with a gentle break reminder every 30 min. | |
| 5 | Onboarding | Per-game "How to play" first-seat coach marks with published RTP/house edge link. | |
| 6 | Visuals | Win celebrations scaled honestly to win size (no celebration for wins smaller than the bet). | Partial — Gilded Track + Canopy Spire glow SHIPPED 2026-11-05 |
| 7 | Game feel | Faster mobile controls: bet chips row, repeat-bet, thumb-reach Spin button. | |
| 8 | Engagement | Daily sandbox chip top-up when balance is low (clearly labeled test credits, capped). | SHIPPED 2026-11-05 as once/day $25 claim (research #2) — not gated on low balance; Cage card, ledger idempotency |
| 9 | Engagement | Achievements for exploring games (e.g., "Tried every table"), never for losses or volume of betting. | |
| 10 | Visuals | PWA manifest + install icon + splash so the demo feels app-like on phones. | |
| 11 | Onboarding | Guest "try one spin" demo mode before signup with no ledger writes. | |

## NEXT (top): Backlog item 2 — game-card art (original SVG illustrations per table). Then research #5 hold-and-win / stacking multipliers / cascade bonus.

## Shipped 2026-11-05: Slot Turbo spin on Gilded Track + Canopy Spire (research priority #3 remainder). Shared `slotFeel` stop timings (~40% of normal, still staggered); `pit-slot-turbo` localStorage (off by default); prefers-reduced-motion forces turbo settles; Spin→Stop / per-reel tap-to-stop unchanged. Outcomes still server-side after the spin request. Tests: tests/slotFeel.test.ts.

## Shipped 2026-11-05: Canopy Spire honest win-size cabinet glow (research priority #3 slice). VaultSpireMachine takes glow / glowLive like Gilded Track; lights only after reels settle via slotGlowTier(coinIn, server winCents); never on spin, never when return ≤ bet (tier 0); glow-t1…glow-t4 reuse shared .slot-cabinet CSS + slot-win-halo. Tests: tests/r30.test.ts Canopy suite.

## Shipped 2026-11-05: Daily free sandbox chips (research priority #2 / backlog item 8). Cage card claims $25 sandbox chips once per Chicago calendar day; ledger-enforced idempotency; clearly labeled test credits; not gated on low balance (shipped once/day regardless). Tests: tests/dailyClaim.test.ts.

## Shipped 2026-11-05: Live Canopy Spire jackpot meter in the lobby + real last-won history (research priority #1). Floor Canopy Spire card polls true sandbox pots from GET /api/games/slot-progressive, labels the strip "Sandbox / test chips", and lists genuine progressive_hits (tier · amount · privacy-safe name · relative time) with a quiet "No jackpots hit yet" empty state — never invented winners. Hits are recorded only inside applyProgressiveSpin when a real MHB/mystery award fires. Tests: tests/progressive.test.ts history suite.

## Shipped 2026-11-04: roulette betting table fits every width with no sideways scroll (verified 320-1440 px incl. 360/390/430; all 152 bet spots tappable and correctly mapped), phone stand-on-end layout now up to 700 px, desktop columns shrink instead of clipping 2:1, chip dock fits 320 px; old Session/Hottest panel removed (collapsible "Recent numbers" kept). Tests: tests/rouletteLayout.test.ts + manual tests/e2e/roulette-layout.mjs.

## Player research priorities (from /workspace/pit-player-research.md, 2026-11-04) — rank these first
1. Live Canopy Spire jackpot meter in lobby + real last-won history — SHIPPED 2026-11-05
2. Daily free sandbox-chip claim (once/day, no playthrough, no popups) — SHIPPED 2026-11-05
3. Win animations scaled to real win size; sound + mute; turbo/skip — SHIPPED 2026-11-05 (glow on both cabinets; sound/mute in Shell; Turbo spin on Gilded Track + Canopy Spire)
4. Popup-free lobby with search + recently played — SHIPPED 2026-11-04 (floor search box + last-3 recently played chips, localStorage only)
5. Hold & win / stacking multipliers / cascade bonus with visible odds; bonus resumes after refresh
Avoid: popup spam, fake or near-miss wins, hourly pressure timers, bot tournaments.
