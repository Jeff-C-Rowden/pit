"use client";
import Link from "next/link";
import Shell from "@/components/Shell";
import GameArt from "@/components/GameArt";
import { MathStrip } from "@/components/VolatilityMeter";
import { ClemPortrait } from "@/components/MineSymbols";
import { AdaPortrait } from "@/components/PrairieSymbols";
import { OrlaPortrait } from "@/components/CloverSymbols";
import { MINE_FEATURE_LINE, PRAIRIE_FEATURE_LINE, CLOVER_FEATURE_LINE } from "@/lib/gameMath";

const STORIES = [
  {
    href: "/clover", art: "clover", name: "Kettle of Clover", who: "Orla Tully, leprechaun cobbler, and Bramble the hare", Portrait: OrlaPortrait,
    blurb: "10 lines. Three rainbow bridges spin the Rainbow Wheel (credits, free spins, or an upgrade to the Pot-of-Gold wheel); kettles bring free spins with expanding clover wilds.",
    feature: CLOVER_FEATURE_LINE, isNew: true,
  },
  {
    href: "/prairie", art: "prairie", name: "Thunderhoof Prairie", who: "Ada Thornbury, storm-chasing ranch hand", Portrait: AdaPortrait,
    blurb: "243 ways. Storm clouds bring free spins where every wild carries 2× or 3×; six gold herd coins start a Hold & Spin round-up.",
    feature: PRAIRIE_FEATURE_LINE, isNew: false,
  },
  {
    href: "/mine", art: "mine", name: "Canary Creek Mine", who: "Clem Hollis and Pip the canary", Portrait: ClemPortrait,
    blurb: "9 lines. Dynamite brings doubled free spins; mine carts on reels 1, 3 and 5 open a pick bonus.",
    feature: MINE_FEATURE_LINE, isNew: false,
  },
];

/** Story Slots hub: every video slot with an intro story, a character and real bonus features. */
export default function StoriesPage() {
  return (
    <Shell>
      {() => (
        <div className="stories-page">
          <div className="slot-page-hero">
            <p className="lede">Video slots with a story and real bonus rounds</p>
            <h1>Story Slots</h1>
            <p className="muted">Exact RTP published with every feature included · Sandbox / test chips only · 21+</p>
          </div>
          <div className="stories-grid">
            {STORIES.map((s) => (
              <Link key={s.href} href={s.href} className="story-tile panel">
                <GameArt kind={s.art} variant="tile" />
                <div className="story-tile-body">
                  <span className="story-tile-face" aria-hidden><s.Portrait size={64} /></span>
                  <div>
                    <h2>{s.name}{s.isNew && <span className="story-new">New</span>}</h2>
                    <p className="muted story-who">{s.who}</p>
                  </div>
                </div>
                <p>{s.blurb}</p>
                <MathStrip game={s.href} variant="lobby" />
                <p className="math-strip math-strip-lobby">{s.feature}</p>
                <span className="btn primary story-cta">Play {s.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </Shell>
  );
}
