#!/usr/bin/env bash
# Emits one MC job per line: "<seed> <game> <rounds> [arg]". Totals: 10M+ rounds per game line.
for s in 1 2 3 4 5 6 7 8; do
  echo "$s gilded 1250000 25"
  echo "$s canopyLine 1250000 25"
  echo "$s canopyFull 1250000 25"
  echo "$s buckshot 1250000 1"
  echo "$s buckshot 1250000 3"
  echo "$s blackjack 1250000"
  echo "$s paigow 1250000"
  echo "$s holdem 1250000 station"
  echo "$s holdem 1250000 mirror"
  echo "$s holdem 250000 aggro"
  for k in straight split street corner six dozen column red odd high; do echo "$s roulette 1250000 $k"; done
  for c in pass dontPass pass2xOdds place6 place5 place4 field anySeven anyCraps yo hard6 hard4 come dontCome; do echo "$s craps 1250000 $c"; done
done
for s in 11 12 13 14; do echo "$s canopyFull 500000 500"; done
