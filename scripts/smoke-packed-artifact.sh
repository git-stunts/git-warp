#!/usr/bin/env bash
# Smoke the actual npm tarball in a clean consumer fixture.
set -euo pipefail

ARTIFACTS_PREPARED=0
case "${1:-}" in
  "") ;;
  --prepared-artifacts)
    ARTIFACTS_PREPARED=1
    shift
    ;;
  *)
    echo "smoke-packed-artifact: unknown argument: $1" >&2
    exit 2
    ;;
esac
if [ "$#" -ne 0 ]; then
  echo "smoke-packed-artifact: unexpected arguments" >&2
  exit 2
fi

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
if [ "$ARTIFACTS_PREPARED" -eq 0 ]; then
  npm run build --silent
fi
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

const rootValues = Object.keys(mod).sort();
if (rootValues.length !== 1 || rootValues[0] !== 'Runtime') {
  throw new PackedArtifactSmokeError(
    `package root values must contain exactly Runtime; received ${rootValues.join(', ')}`,
  );
}

let storageSubpathImported = false;
try {
  await import('@git-stunts/git-warp/storage');
  storageSubpathImported = true;
} catch {
  // The v19 export map intentionally hides production storage composition.
}
if (storageSubpathImported) {
  throw new PackedArtifactSmokeError('storage subpath remained publicly importable');
}

NODE

test ! -e node_modules/.bin/warp-graph
test -x node_modules/.bin/git-warp
npx --no-install git-warp --help >/dev/null

echo "packed artifact smoke passed"
