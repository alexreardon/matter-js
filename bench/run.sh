#!/bin/zsh
# Rebuild dev (non-min) and time it best-of-N against the release baseline.
set -e
cd "$(dirname "$0")/.."
npx webpack --mode=production --no-hot --no-watch --env.KIND=dev >/dev/null 2>&1
echo "== baseline (release matter.js) =="
for i in 1 2 3; do node bench/ab.js ../build/matter.js | grep median; done
echo "== dev (current src) =="
for i in 1 2 3; do node bench/ab.js ../build/matter.dev.js | grep median; done
