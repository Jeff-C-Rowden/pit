import Logo from "@/components/Logo";
import Link from "next/link";

export default function Rules() {
  return (
    <div className="pit-shell">
      <div className="hero">
        <Logo />
        <h1 style={{ fontSize: 48 }}>House rules</h1>
        <div className="rule" />
      </div>
      <div className="panel">
        <p>Pit is 21+ only. The server owns every card, reel, die, pocket, and chip. Your browser cannot credit money. Bets debit before resolution; wins credit after. Each ledger row is idempotent.</p>
        <h3>Blackjack</h3>
        <p className="muted">6-deck shoe. Dealer stands on soft 17. Blackjack pays 3:2. Insurance 2:1. Hit, stand, double, split once. House edge roughly 0.5% with basic strategy.</p>
        <h3>Gilded Track (slot)</h3>
        <p className="muted">5 reels, 3 rows, 9 paylines. Left-to-right. WILD substitutes. Theoretical RTP is enumerated from the published 20-stop strips and kept in the 94–96% band (see tests).</p>
        <h3>Texas Hold&apos;em</h3>
        <p className="muted">Heads-up no-limit vs the house bot. Blinds $1/$2. Standard ranking. Button posts the small blind.</p>
        <h3>Roulette</h3>
        <p className="muted">American wheel (0 and 00), 38 pockets. Straight 35:1, split 17:1, street 11:1, corner 8:1, dozen/column 2:1, even money 1:1. House edge 5.26% (RTP 94.74% on standard bets).</p>
        <h3>Craps</h3>
        <p className="muted">Come-out: 7/11 pass wins, 2/3/12 pass loses (12 is bar for don&apos;t pass). Point then seven-out. Odds at true odds. Place 6/8 pay 7:6. Field 2/12 pay extra. Props: any 7 4:1, any craps 7:1, yo 15:1, hardways.</p>
        <h3>Pai Gow Poker</h3>
        <p className="muted">House banks. 53-card deck with joker (ace or to complete a straight/flush). High (5) must beat low (2). Both hands to win; copies to the banker; otherwise push. 5% commission on player wins. House Way available.</p>
        <p style={{ marginTop: 24 }}><Link href="/">Back to the door</Link></p>
      </div>
      <footer className="footer">Live real-money operation needs a gambling license and licensed payments. This build is a local sandbox.</footer>
    </div>
  );
}
