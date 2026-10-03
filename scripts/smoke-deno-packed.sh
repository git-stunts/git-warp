#!/usr/bin/env bash
# Build and exercise one installed public consumer inside the Deno COPY image.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
node "$ROOT/scripts/RequireDockerTests.ts"
cd "$ROOT"
GUARD_VERSION=$(node -p "require('./node_modules/@git-stunts/docker-guard/package.json').version")
npm run build --silent
SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"' EXIT
mkdir -p "$SCRATCH/pack" "$SCRATCH/consumer"
npm pack --ignore-scripts --pack-destination "$SCRATCH/pack" >/dev/null
set -- "$SCRATCH/pack"/*.tgz
if [[ "$#" != 1 || ! -f "$1" ]]; then
  echo 'Deno smoke requires exactly one packed artifact' >&2
  exit 1
fi
TARBALL=$1
cp "$ROOT/test/fixtures/deno-smoke/consumer.mjs" "$SCRATCH/consumer/consumer.mjs"
cp "$ROOT/scripts/RequireDockerTests.ts" "$SCRATCH/consumer/RequireDockerTests.ts"
cd "$SCRATCH/consumer"
npm init -y >/dev/null
npm install --no-audit --no-fund "$TARBALL" "@git-stunts/docker-guard@$GUARD_VERSION" >/dev/null
deno run --no-config --node-modules-dir=manual --allow-all consumer.mjs
