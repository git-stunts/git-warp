#!/usr/bin/env bash
# Smoke the actual npm tarball in a clean consumer fixture.
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/git-warp-packed-smoke.XXXXXX")
PACK_DIR="$TMP_ROOT/pack"
FIXTURE_DIR="$TMP_ROOT/consumer"

cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

mkdir -p "$PACK_DIR" "$FIXTURE_DIR"

cd "$ROOT"
npm run build --silent
TARBALL_NAME=$(npm pack --pack-destination "$PACK_DIR" --ignore-scripts 2>/dev/null | tail -n 1)
TARBALL_PATH="$PACK_DIR/$TARBALL_NAME"

if [ ! -f "$TARBALL_PATH" ]; then
  echo "npm pack did not produce a tarball at $TARBALL_PATH" >&2
  exit 1
fi

cd "$FIXTURE_DIR"
npm init -y >/dev/null
npm install --no-audit --no-fund "$TARBALL_PATH" >/dev/null

node --input-type=module <<'NODE'
class PackedArtifactSmokeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PackedArtifactSmokeError';
  }
}

const mod = await import('@git-stunts/git-warp');
const storage = await import('@git-stunts/git-warp/storage');

const rootValues = Object.keys(mod).sort();
if (rootValues.length !== 1 || rootValues[0] !== 'Runtime') {
  throw new PackedArtifactSmokeError(
    `package root values must contain exactly Runtime; received ${rootValues.join(', ')}`,
  );
}

for (const name of ['GitStorage']) {
  if (!(name in storage)) {
    throw new PackedArtifactSmokeError(`storage subpath did not export ${name}`);
  }
}

if ('MemoryStorage' in storage) {
  throw new PackedArtifactSmokeError('storage subpath still exported MemoryStorage');
}

NODE

test ! -e node_modules/.bin/warp-graph
test -x node_modules/.bin/git-warp
npx --no-install git-warp --help >/dev/null

echo "packed artifact smoke passed"
