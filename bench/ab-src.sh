#!/bin/zsh
# Interleaved A/B of the working src tree vs a baseline checkout, using
# bench/profile-game.js as the workload. Interleaving B,A,B,A cancels thermal
# drift (a sequential A/B on a loaded machine has shown +5% pure drift).
# Usage: bench/ab-src.sh <baselineSrcMain> [scene] [rounds] [workSrcMain]
set -e
cd "$(dirname "$0")/.."
BASE=${1:?baseline src/module/main.js path required}
SCENE=${2:-calm}
ROUNDS=${3:-4}
WORK=${4:-../src/module/main.js}

extract() { grep 'us/update' | sed -E 's/.*\(([0-9.]+) us\/update\).*/\1/'; }

typeset -a baseVals workVals
for round in $(seq 1 $ROUNDS); do
  b=$(SCENE=$SCENE node bench/profile-game.js "$BASE" | extract)
  w=$(SCENE=$SCENE node bench/profile-game.js "$WORK" | extract)
  baseVals+=$b
  workVals+=$w
  echo "round $round: base=${b}us work=${w}us"
done

node -e "
const base = [$(IFS=,; echo "${baseVals[*]}")];
const work = [$(IFS=,; echo "${workVals[*]}")];
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const mb = med(base), mw = med(work);
console.log('scene=$SCENE  base median: ' + mb.toFixed(1) + 'us  work median: ' + mw.toFixed(1) + 'us  delta: ' + (100 * (mw - mb) / mb).toFixed(2) + '%');
"
