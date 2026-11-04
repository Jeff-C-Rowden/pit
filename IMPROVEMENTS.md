# Pit demo improvement backlog

Rules for every item: no fake wins, no misrepresented odds or near-miss rigging, keep "Sandbox / test chips" labels and 21+ gating, keep responsible-play tools visible, original art only. One tested item ships per cycle.

| # | Area | Idea | Status |
|---|------|------|--------|
| 1 | Onboarding | First-visit welcome sheet: claim $100 sandbox chips (idempotent, once per account) + 4-step lobby tour with responsible-play step. Mobile-first. | Shipped cycle 1 |
| 2 | Visuals | Game-card art: original SVG illustrations per table (felt, wheel, reels) replacing flat cards. | Next |
| 3 | Game feel | Haptics (navigator.vibrate) + optional sound toggle on spins, deals and wins, off by default, respects reduced motion. | |
| 4 | Session engagement | "Session panel": time played, net result, bets placed, with a gentle break reminder every 30 min. | |
| 5 | Onboarding | Per-game "How to play" first-seat coach marks with published RTP/house edge link. | |
| 6 | Visuals | Win celebrations scaled honestly to win size (no celebration for wins smaller than the bet). | |
| 7 | Game feel | Faster mobile controls: bet chips row, repeat-bet, thumb-reach Spin button. | |
| 8 | Engagement | Daily sandbox chip top-up when balance is low (clearly labeled test credits, capped). | |
| 9 | Engagement | Achievements for exploring games (e.g., "Tried every table"), never for losses or volume of betting. | |
| 10 | Visuals | PWA manifest + install icon + splash so the demo feels app-like on phones. | |
| 11 | Onboarding | Guest "try one spin" demo mode before signup with no ledger writes. | |

## NEXT (top): roulette betting table must fit phone width without sideways scroll; remove redundant old Session/Hottest panel on roulette.

## Player research priorities (from /workspace/pit-player-research.md, 2026-11-04) — rank these first
1. Live Canopy Spire jackpot meter in lobby + real last-won history
2. Daily free sandbox-chip claim (once/day, no playthrough, no popups)
3. Win animations scaled to real win size; sound + mute; turbo/skip
4. Popup-free lobby with search + recently played
5. Hold & win / stacking multipliers / cascade bonus with visible odds; bonus resumes after refresh
Avoid: popup spam, fake or near-miss wins, hourly pressure timers, bot tournaments.
