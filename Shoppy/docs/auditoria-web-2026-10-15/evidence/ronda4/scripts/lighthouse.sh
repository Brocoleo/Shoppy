#!/bin/sh
export PATH=/home/leandro/.nvm/versions/node/v24.21.0/bin:/usr/bin:/bin
export CHROME_PATH=/opt/google/chrome/chrome
phase=$1
for run in 1 2 3; do
 node /home/leandro/.npm/_npx/0f94ee7615faf582/node_modules/lighthouse/cli/index.js http://127.0.0.1:3113 --only-categories=performance --chrome-flags='--headless --no-sandbox --disable-dev-shm-usage' --output=json --output-path="/tmp/shopy-r4/evidence/lighthouse-$phase-$run.json" --save-assets --quiet > "/tmp/shopy-r4/evidence/lighthouse-$phase-$run.log" 2>&1 || exit 1
 echo "Lighthouse $phase $run finished"
done
