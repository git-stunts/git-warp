#!/usr/bin/env bash
# Compile and execute the generated SDK against the packed package and real Git.
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/git-warp-sdk-smoke.XXXXXX")
PACK_DIR="$TMP_ROOT/pack"
CONSUMER_DIR="$TMP_ROOT/consumer"
FIXTURE_DIR="$ROOT/test/fixtures/generated-sdk"

cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

mkdir -p "$PACK_DIR" "$CONSUMER_DIR"

cd "$ROOT"
npm run build --silent
TARBALL_NAME=$(npm pack \
  --pack-destination "$PACK_DIR" \
  --ignore-scripts \
  2>/dev/null \
  | tail -n 1)
TARBALL_PATH="$PACK_DIR/$TARBALL_NAME"

if [ ! -f "$TARBALL_PATH" ]; then
  echo "npm pack did not produce a tarball at $TARBALL_PATH" >&2
  exit 1
fi

cp "$FIXTURE_DIR/consumer-read.ts" "$CONSUMER_DIR/consumer-read.ts"
cp "$FIXTURE_DIR/consumer-write.ts" "$CONSUMER_DIR/consumer-write.ts"
cp "$FIXTURE_DIR/tsconfig.json" "$CONSUMER_DIR/tsconfig.json"
cp "$FIXTURE_DIR/users.generated.ts" "$CONSUMER_DIR/users.generated.ts"
cp \
  "$FIXTURE_DIR/users.wesley.generated.ts" \
  "$CONSUMER_DIR/users.wesley.generated.ts"

cd "$CONSUMER_DIR"
npm init -y >/dev/null
npm pkg set type=module >/dev/null
npm install --no-audit --no-fund "$TARBALL_PATH" >/dev/null
git init --quiet runtime-repo

"$ROOT/node_modules/.bin/tsc" \
  --project tsconfig.json \
  --typeRoots "$ROOT/node_modules/@types"
node dist/consumer-write.js
npx --no-install warp-graph \
  --repo "$CONSUMER_DIR/runtime-repo" \
  --graph users \
  checkpoint create \
  >/dev/null
node dist/consumer-read.js

echo "generated SDK packed-consumer smoke passed"
