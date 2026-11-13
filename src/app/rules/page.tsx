import Logo from "@/components/Logo";
import { MINE_MATH, MINE_FEATURE_LINE, PRAIRIE_MATH, PRAIRIE_FEATURE_LINE, CLOVER_MATH, CLOVER_FEATURE_LINE } from "@/lib/gameMath";
import Link from "next/link";
import ShowTipsSwitch from "@/components/ShowTipsSwitch";
import { RecordAchievement } from "@/components/Achievements";
import { CRAPS_BET_MATH, ROULETTE_BET_MATH } from "@/lib/gameMath";
import { MathStrip } from "@/components/VolatilityMeter";

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
        <p className="muted">6-deck shoe. Dealer stands on soft 17. Blackjack pays 3:2. Insurance 2:1. Hit, stand, double, split once. House edge about 0.4% with basic strategy.</p>
        <MathStrip game="blackjack" variant="panel" />
        <h3 id="slot" className="rules-anchor">Sundown Trail (slot)</h3>
        <p className="muted">5 reels, 3 rows, 9 paylines. Left-to-right. WILD substitutes. Exact theoretical RTP 95.53%, enumerated over every stop combination of the published 20-stop strips (locked in tests).</p>
        <MathStrip game="slot" variant="panel" />
        <h3 id="buckshot" className="rules-anchor">Buckshot Bars (classic 3-reel slot)</h3>
        <p className="muted">3 reels, 1 centre payline, play 1–3 coins at 25¢–$5 a coin. Each reel is a physical strip (24 / 24 / 26 stops, symbols alternating with blanks); every stop is equally likely and the window shows the real neighbours. The horseshoe is wild and doubles the pay for each one used; three horseshoes pay 800 / 1,600 / 2,500 coins. Exact theoretical RTP, enumerated over all 14,976 stop combinations: 94.44% at 1–2 coins, 94.67% at 3 coins. Reels stop on a fixed schedule with no near-miss staging.</p>
        <MathStrip game="buckshot" variant="panel" />
        <h3 id="bounty" className="rules-anchor">Bounty Bars (Bonus to Cash machine)</h3>
        <p className="muted">The Buckshot Bars reels and strips on a leaner pay table: 3 × 7 pays 75, triple bar 35, double bar 20, single bar 9 per coin; three horseshoes 800 / 1,600 / 2,500. Exact theoretical RTP 90.31% at 1–2 coins and 90.53% at 3 coins (all 14,976 stop combinations), a few points below the regular slots because bonus-funded winnings here pay out as cash. Bets draw from your Bonus balance first. Same uniform stops, no near-miss staging.</p>
        <MathStrip game="bounty" variant="panel" />
        <h3 id="mine" className="rules-anchor">Canary Creek Mine (story slot with features)</h3>
        <p className="muted">5 reels, 3 rows, 9 left-to-right paylines, 30-stop strips with uniform stops. Clem&apos;s lamp-hat WILD (reels 2–4) substitutes for every pay symbol. DYNAMITE scatters pay anywhere: 3 / 4 / 5 pay 2× / 10× / 50× the total bet and award 7 / 10 / 15 free spins on the same reels with the Lantern Multiplier: it starts at ×1 and climbs +1 after every free spin that pays anything, up to ×4, never drops and carries through retriggers (at least one spin plays at ×4 in {(MINE_MATH.lanternMaxChance * 100).toFixed(1)}% of features); 3+ dynamite in free spins retrigger the same awards, capped at 100 free spins per feature. A MINE CART on reels 1, 3 and 5 (any row) opens the Mine Cart pick: 12 carts hold 2, 2, 3, 3, 4, 5, 6, 8 and 12× bet plus 3 COLLECT lamps; the first cart always holds a prize and picks continue until a COLLECT (average 15× bet). Carts do nothing during free spins. The server decides the spin, every free spin and the pick reveal order at trigger time and pays it all at once; whichever cart you tap shows the next pre-drawn result, so there is no better or worse pick. Exact theoretical RTP {(MINE_MATH.rtp * 100).toFixed(2)}%: base game {(MINE_MATH.baseRtp * 100).toFixed(2)}%, free spins {(MINE_MATH.freeSpinsRtp * 100).toFixed(2)}%, Mine Cart {(MINE_MATH.pickRtp * 100).toFixed(2)}%. Hit rate {(MINE_MATH.hitRate * 100).toFixed(1)}%. {MINE_FEATURE_LINE}. Confirmed by a seeded 10-million-spin simulation of the server code.</p>
        <MathStrip game="mine" variant="panel" />
        <h3 id="prairie" className="rules-anchor">Thunderhoof Prairie (story slot, 243 ways)</h3>
        <p className="muted">5 reels, 3 rows, 243 ways, 30-stop strips with uniform stops; a spin costs 10 coins. A symbol pays when it shows anywhere on reels 1–3 (and 4, 5) in a row from the left; the pay per way is multiplied by the number of matching cells on each reel, and only the longest run of each symbol pays. The sunset WILD (reels 2–4) substitutes for every pay symbol. STORM scatters pay anywhere: 3 / 4 / 5 pay 2× / 5× / 20× the total bet and award 8 / 12 / 20 free spins. Free spins use the same strips with each wild printed as a 2× or 3× wild; wilds on one way multiply each other (up to 27×). 3+ storms in free spins retrigger the same awards, capped at 100 free spins per feature; coins do nothing during free spins. HOLD &amp; SPIN: 6 or more COIN symbols anywhere in the base game lock in place with 3 respins; each empty spot lands a coin 5% of the time per respin, and any new coin resets the respins to 3. It ends at 0 respins or a full screen and pays the sum of all coins. Coin values are fixed multiples of the total bet drawn by the server from one table: 0.5× (35%), 1× (30%), 2× (16%), 3× (9%), 5× (6%), MINI 10× (3%), MINOR 25× (0.8%), MAJOR 100× (0.2%). No progressive. The server decides the spin, every free spin and every respin first and pays it all at once. Exact theoretical RTP {(PRAIRIE_MATH.rtp * 100).toFixed(2)}%: base game {(PRAIRIE_MATH.baseRtp * 100).toFixed(2)}%, free spins {(PRAIRIE_MATH.freeSpinsRtp * 100).toFixed(2)}%, Hold &amp; Spin {(PRAIRIE_MATH.holdRtp * 100).toFixed(2)}%. Hit rate {(PRAIRIE_MATH.hitRate * 100).toFixed(1)}%. {PRAIRIE_FEATURE_LINE}. Confirmed by a seeded 10-million-spin simulation of the server code.</p>
        <MathStrip game="prairie" variant="panel" />
        <h3 id="clover" className="rules-anchor">Kettle of Clover (story slot with a bonus wheel)</h3>
        <p className="muted">5 reels, 3 rows, 10 left-to-right paylines, 30-stop strips with uniform stops; a spin costs 10 coins. The four-leaf clover WILD (reels 2–4) substitutes for every pay symbol. KETTLE scatters pay anywhere: 3 / 4 / 5 pay 2× / 5× / 25× the total bet and award 8 / 10 / 15 free spins. In free spins any clover wild that lands on reels 2–4 expands to fill its reel before lines are paid; kettles are counted as they land, 3+ retrigger the same awards, capped at 100 free spins per feature; rainbows do nothing in free spins. A RAINBOW bridge on each of reels 1, 3 and 5 (any row) spins the Rainbow Wheel: 12 equal wedges paying 5, 5, 6, 8, 8, 10, 10, 12, 15 or 20× bet, 10 free spins, or UPGRADE to the 12-wedge Pot-of-Gold wheel (25, 25, 30, 30, 40, 40, 50, 60, 75, 100 or 250× bet, or 20 free spins). The server picks each wedge uniformly when the rainbows land, pays it in the same transaction, and the wheel animation stops on that wedge. Exact theoretical RTP {(CLOVER_MATH.rtp * 100).toFixed(2)}%: base game {(CLOVER_MATH.baseRtp * 100).toFixed(2)}%, kettle free spins {(CLOVER_MATH.freeSpinsRtp * 100).toFixed(2)}%, Rainbow Wheel {(CLOVER_MATH.wheelRtp * 100).toFixed(2)}%. Hit rate {(CLOVER_MATH.hitRate * 100).toFixed(1)}%. {CLOVER_FEATURE_LINE}. Confirmed by a seeded 10-million-spin simulation of the server code.</p>
        <MathStrip game="clover" variant="panel" />
        <h3 id="vault" className="rules-anchor">Antler Ridge (progressive slot)</h3>
        <p className="muted">Frontier-themed 5-reel video slot with four shared progressive meters (Mini / Minor / Major / Grand). Seeds $10 / $50 / $250 / $2,500. Must-hit-by ceilings on Mini / Minor / Major ($30 / $150 / $1,000); Grand is a mystery whose chance grows with your bet (about 1 in 35,000 spins at a $1 coin). Each spin contributes exactly 3.00% (300 bps: 100/70/50/80) of coin-in from the same bet debit. All sandbox bets qualify. Hits reseed; meters move only on real spins. Exact theoretical RTP 94.8–95.0% by coin size: base game 89.2% plus 5.6–5.8% from the jackpots. Demo chips only — not a licensed casino jackpot.</p>
        <MathStrip game="vault" variant="panel" />
        <h3 id="holdem" className="rules-anchor">Texas Hold&apos;em</h3>
        <p className="muted">Heads-up no-limit vs the house bot. Blinds $1/$2. Standard ranking. Button posts the small blind. No rake: the house bot takes no cut of the pot.</p>
        <MathStrip game="holdem" variant="panel" />
        <h3 id="roulette" className="rules-anchor">Roulette</h3>
        <p className="muted">American wheel (0 and 00), 38 pockets. Straight 35:1, split 17:1, street 11:1, corner 8:1, dozen/column 2:1, even money 1:1. House edge 5.26% (RTP 94.74% on standard bets).</p>
        <MathStrip game="roulette" variant="panel" />
        <table className="bet-vol-table">
          <thead><tr><th>Bet</th><th>Pays</th><th className="num">House edge</th><th>Volatility</th></tr></thead>
          <tbody>{ROULETTE_BET_MATH.map((r) => (
            <tr key={r.label}><td>{r.label}</td><td>{r.payout}</td><td className="num">{r.edgePct.toFixed(2)}%</td><td>{r.volatility}</td></tr>
          ))}</tbody>
        </table>
        <p className="muted">Volatility is the long-run spread for that bet. It does not mean a hit is due.</p>
        <h3 id="craps" className="rules-anchor">Craps</h3>
        <p className="muted">Come-out: 7/11 pass wins, 2/3/12 pass loses (12 is bar for don&apos;t pass). Point then seven-out. Odds at true odds. Place 6/8 pay 7:6. Field 2/12 pay extra. Props: any 7 4:1, any craps 7:1, yo 15:1, hardways. Come and don&apos;t come work like pass and don&apos;t pass on every roll. Pass/come edge 1.41%, don&apos;t pass/don&apos;t come 1.40%, place 6/8 1.52%, place 5/9 4.00%, place 4/10 6.67%, field 2.78%, hardways 9.09–11.1%, any craps and yo 11.1%, any 7 16.7%; odds bets carry no edge. Odds and place bets are taken only in amounts that pay in whole cents, so rounding never adds an edge (place 6/8 in multiples of 6¢, for example $1.50).</p>
        <MathStrip game="craps" variant="panel" />
        <table className="bet-vol-table">
          <thead><tr><th>Bet</th><th>Pays</th><th className="num">House edge</th><th>Volatility</th></tr></thead>
          <tbody>{CRAPS_BET_MATH.map((r) => (
            <tr key={r.label}><td>{r.label}</td><td>{r.payout}</td><td className="num">{r.edgePct.toFixed(2)}%</td><td>{r.volatility}</td></tr>
          ))}</tbody>
        </table>
        <p className="muted">Volatility is the long-run spread for that bet. It does not mean a hit is due.</p>
        <h3 id="paigow" className="rules-anchor">Pai Gow Poker</h3>
        <p className="muted">House banks. 53-card deck with joker (ace or to complete a straight/flush). High (5) must beat low (2). Both hands to win; copies to the banker; otherwise push. 5% commission on player wins. House Way available. House edge about 2.9% when both sides use the house way.</p>
        <MathStrip game="paigow" variant="panel" />
        <h3 id="bonus" className="rules-anchor">Bonus money</h3>
        <ul className="muted rules-list">
          <li><b>Two balances.</b> Cash and Bonus are kept separately in the ledger and shown side by side in the top bar and the Cage. Both are sandbox test chips with no cash value.</li>
          <li><b>Bonus · play only, not withdrawable.</b> Bonus can never be withdrawn, set aside or transferred. It comes from tournament prizes marked “Bonus prize” and, in this sandbox, a $5 test bonus once a day in the Cage.</li>
          <li><b>Where it plays.</b> Bonus can be bet on the slots: Buckshot Bars, Sundown Trail and Bounty Bars. Table games, Antler Ridge (progressive) and tournaments take Cash only. Bonus can&apos;t buy into any tournament.</li>
          <li><b>Which money goes first.</b> On regular slots a bet uses Cash first, then Bonus. On Bonus to Cash machines it uses Bonus first.</li>
          <li><b>Where winnings go.</b> A win is split in the same proportion as the bet that made it. The cash-funded part pays to Cash. The bonus-funded part stays Bonus, except on <b>Bonus to Cash</b> machines, where it pays to Cash. The bonus stake itself is always used up.</li>
          <li><b>Bonus to Cash machines</b> carry a green “Bonus to Cash” badge and have their own lobby filter. They pay back a little less (about 90% RTP, shown exactly on each machine) than the regular slots (94–96%).</li>
          <li><b>Limits.</b> Breaks, self-exclusion and session time limits stop bonus bets too. Loss and deposit limits count Cash only, since Bonus was never deposited.</li>
        </ul>
        <h3 id="tournaments" className="rules-anchor">Tournaments</h3>
        <ul className="muted rules-list">
          <li><b>Separate stacks.</b> Each entrant gets the same tournament stack of tournament chips. Bets in a tournament never touch your Cash or Bonus, and leftover chips are worth nothing when it ends.</li>
          <li><b>Buy-ins.</b> Free, $1, $2, $5 or $10, paid from Cash only. Bonus can&apos;t buy in. You can withdraw for a full refund until your first bet. Rebuys (paid events only) cost the buy-in, give a fresh starting stack, and are allowed when your stack has fallen to 10% of the start or less.</li>
          <li><b>House fee and pool.</b> A flat 25% of every buy-in and rebuy is the house fee. Prize pool = (entries + rebuys) × buy-in × 75%. Free rolls have a pool funded by the house, capped at $50 of free-roll prizes a day across all free rolls. One account can win at most $25 of free-roll prizes a Chicago day; anything over that goes to the next qualified place.</li>
          <li><b>Ranking modes.</b> <b>Balance</b>: the highest stack at the end wins. <b>Accumulated</b>: only winning rounds score, as net win × 100 ÷ bet (capped at 50,000 points a round), so a big bet doesn&apos;t outscore a lucky small one. Ties go to whoever reached the score first.</li>
          <li><b>Blackjack Chip Race.</b> 30 hands, same 6-deck shoe and rules as the floor (S17, 3:2, insurance, double, split once). $1–$20 a hand; doubles and splits may go past $20 but never past your stack. Balance mode: the highest stack after 30 hands wins. A hand still open at the end is played out by standing; it is never forfeited.</li>
          <li><b>Craps Hot Roll.</b> 40 rolls, same dice and payouts as the floor. 50¢–$10 of new bets per roll. Accumulated mode: a roll scores when the bets it settles return more than they cost (net win × 100 ÷ stake settled). Bets that win and stay up count as settled for that roll. After your 40th roll, or when the event ends, chips still on the felt go back to your stack without scoring.</li>
          <li><b>Qualifying.</b> Each event shows a minimum number of bets (at least the table minimum each). Only qualified players rank for prizes. The in-game strip shows “Remaining bets to qualify” and “Bets made”.</li>
          <li><b>Prizes.</b> Paid places grow with the number of qualified players, up to the top 10; leftover cents go to 1st. Events marked “Cash prize” pay to Cash; “Bonus prize” events (most free rolls) pay to your Bonus balance.</li>
          <li><b>Never cancelled.</b> There is no minimum field. A single qualified player takes the whole pool. If nobody qualifies, the top-ranked entrant takes it.</li>
          <li><b>Honest field.</b> Entrant counts and leaderboards show only real players. There are no house players or bots, and tournament tables seat only you. Our own automated test accounts never appear on boards, counts or hit lists and can never win a prize. Breaks, self-exclusion and session time limits apply inside tournaments too, and tournament play counts toward your session time. Free rolls: up to 3 entries a day.</li>
        </ul>
        <p style={{ marginTop: 24 }}><Link href="/">Back to the door</Link></p>
      </div>
      <footer className="footer">Live real-money operation needs a gambling license and licensed payments. This build is a local sandbox.</footer>
    </div>
  );
}
