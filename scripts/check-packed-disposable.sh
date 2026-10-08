#!/usr/bin/env bash
set -euo pipefail
node scripts/RequireDockerTests.ts
repo=$PWD
work=$(mktemp -d "${TMPDIR:-/tmp}/packed-disposable.XXXXXX")
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/pack" "$work/consumer"
node scripts/package-payload/CheckPackagePayload.ts --pack-destination "$work/pack"
cp test/type-check/packed-disposable/* "$work/consumer/"
cd "$work/consumer"
npm install --ignore-scripts --no-audit --no-fund --fetch-retries=0 --fetch-timeout=15000 "$work"/pack/*.tgz >/dev/null
node "$repo/node_modules/typescript/bin/tsc" --version
failed=0
for config in root-close root-dispose advanced combined explicit-disposable testing diagnostics charts; do
  if node "$repo/node_modules/typescript/bin/tsc" -p "tsconfig.$config.json"; then
    echo "PACKED_DISPOSABLE_CASE $config PASS"
  else
    echo "PACKED_DISPOSABLE_CASE $config FAIL"
    failed=1
  fi
done
if ! grep -q '^/// <reference lib="esnext.disposable"' node_modules/@git-stunts/git-warp/dist/src/application/Runtime.d.ts; then
  echo "PACKED_DISPOSABLE_EMISSION FAIL"
  failed=1
fi
if ! node lifecycle.mjs; then
  failed=1
fi
exit "$failed"
