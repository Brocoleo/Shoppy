#!/bin/sh
set -eu
# Point to an existing Lighthouse CLI; no application dependency is installed.
: "${LIGHTHOUSE_CLI:?Set LIGHTHOUSE_CLI to lighthouse/cli/index.js}"
phase=${1:?Provide before or after}
audit_url=${AUDIT_URL:-http://127.0.0.1:3113}
audit_output=${AUDIT_OUTPUT:-/tmp/shopy-lighthouse}
node_binary=${NODE_BINARY:-node}
mkdir -p "$audit_output"
for run in 1 2 3; do
  "$node_binary" "$LIGHTHOUSE_CLI" "$audit_url" \
    --only-categories=performance \
    --chrome-flags='--headless --no-sandbox --disable-dev-shm-usage' \
    --output=json --output-path="$audit_output/lighthouse-$phase-$run.json" \
    --save-assets --quiet
done
