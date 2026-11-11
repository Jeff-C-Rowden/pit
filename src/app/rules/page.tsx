import Logo from "@/components/Logo";
import Link from "next/link";
import ShowTipsSwitch from "@/components/ShowTipsSwitch";
import { RecordAchievement } from "@/components/Achievements";

export default function Rules() {
  return (
    <div className="pit-shell">
      <RecordAchievement kind="rules" />
      <div className="hero">
        <Logo />
        <h1 style={{ fontSize: 48 }}>House rules</h1>
        <div className="rule" />
      </div>
      <div className="panel"><ShowTipsSwitch /></div>
      <div className="panel">
        <p>Pit is 21+ only. The server owns every card, reel, die, pocket, and chip. Your browser cannot credit money. Bets debit before resolution; wins credit after. Each ledger row is idempotent.</p>
        <h3 id="blackjack" className="rules-anchor">Blackjack</h3>
        <p className="muted">6-deck shoe. Dealer stands on soft 17. Blackjack pays 3:2. Insurance 2:1. Hit, stand, double, split once. House edge roughly 0.5% with basic strategy.</p>
        <h3 id="slot" className="rules-anchor">Sundown Trail (slot)</h3>
        <p className="muted">5 reels, 3 rows, 9 paylines. Left-to-right. WILD substitutes. Exact theoretical RTP 95.53%, enumerated over every stop combination of the published 20-stop strips (locked in tests).</p>
        <h3 id="buckshot" className="rules-anchor">Buckshot Bars (classic 3-reel slot)</h3>
        <p className="muted">3 reels, 1 centre payline, play 1–3 coins at 25¢–$5 a coin. Each reel is a physical strip (24 / 24 / 26 stops, symbols alternating with blanks); every stop is equally likely and the window shows the real neighbours. The horseshoe is wild and doubles the pay for each one used; three horseshoes pay 800 / 1,600 / 2,500 coins. Exact theoretical RTP, enumerated over all 14,976 stop combinations: 94.44% at 1–2 coins, 94.67% at 3 coins. Reels stop on a fixed schedule with no near-miss staging.</p>
        <h3 id="vault" className="rules-anchor">Antler Ridge (progressive slot)</h3>
        <p className="muted">Frontier-themed 5-reel video slot with four shared progressive meters (Mini / Minor / Major / Grand). Seeds $10 / $50 / $250 / $2,500. Must-hit-by ceilings on Mini / Minor / Major ($30 / $150 / $1,000); Grand is a mystery whose chance grows with your bet (about 1 in 35,000 spins at a $1 coin). Each spin contributes exactly 3.00% (300 bps: 100/70/50/80) of coin-in from the same bet debit. All sandbox bets qualify. Hits reseed; meters move only on real spins. Exact theoretical RTP 94.8–95.0% by coin size: base game 89.2% plus 5.6–5.8% from the jackpots. Demo chips only — not a licensed casino jackpot.</p>
        <h3 id="holdem" className="rules-anchor">Texas Hold&apos;em</h3>
        <p className="muted">Heads-up no-limit vs the house bot. Blinds $1/$2. Standard ranking. Button posts the small blind. No rake: the house bot takes no cut of the pot.</p>
        <h3 id="roulette" className="rules-anchor">Roulette</h3>
        <p className="muted">American wheel (0 and 00), 38 pockets. Straight 35:1, split 17:1, street 11:1, corner 8:1, dozen/column 2:1, even money 1:1. House edge 5.26% (RTP 94.74% on standard bets).</p>
        <h3 id="craps" className="rules-anchor">Craps</h3>
        <p className="muted">Come-out: 7/11 pass wins, 2/3/12 pass loses (12 is bar for don&apos;t pass). Point then seven-out. Odds at true odds. Place 6/8 pay 7:6. Field 2/12 pay extra. Props: any 7 4:1, any craps 7:1, yo 15:1, hardways. Come and don&apos;t come work like pass and don&apos;t pass on every roll. Pass/come edge 1.41%, don&apos;t pass/don&apos;t come 1.40%, place 6/8 1.52%, place 5/9 4.00%, place 4/10 6.67%, field 2.78%, hardways 9.09–11.1%, any craps and yo 11.1%, any 7 16.7%; odds bets carry no edge.</p>
        <h3 id="paigow" className="rules-anchor">Pai Gow Poker</h3>
        <p className="muted">House banks. 53-card deck with joker (ace or to complete a straight/flush). High (5) must beat low (2). Both hands to win; copies to the banker; otherwise push. 5% commission on player wins. House Way available.</p>
        <p style={{ marginTop: 24 }}><Link href="/">Back to the door</Link></p>
      </div>
      <footer className="footer">Live real-money operation needs a gambling license and licensed payments. This build is a local sandbox.</footer>
    </div>
  );
}
