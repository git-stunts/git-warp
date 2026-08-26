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
node scripts/package-payload/CheckPackagePayload.ts --pack-destination "$PACK_DIR"
set -- "$PACK_DIR"/*.tgz
TARBALL_PATH="${1:-}"

if [ "$#" -ne 1 ] || [ ! -f "$TARBALL_PATH" ]; then
  echo "package payload gate did not produce exactly one tarball in $PACK_DIR" >&2
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

const expectedSubpathExports = new Map([
  ['@git-stunts/git-warp/advanced', ['Coordinate', 'Optic', 'captureCoordinate', 'intent', 'reading']],
  ['@git-stunts/git-warp/diagnostics', ['inspectReceipt']],
  ['@git-stunts/git-warp/charts', ['GraphNeighborhoodChart', 'GraphNeighborhoodEdge', 'graph']],
  ['@git-stunts/git-warp/testing', ['createRuntimeHarness', 'createRuntimeHarnessWithHost']],
]);

for (const [specifier, expectedNames] of expectedSubpathExports) {
  const subpath = await import(specifier);
  for (const expectedName of expectedNames) {
    if (!(expectedName in subpath)) {
      throw new PackedArtifactSmokeError(`${specifier} is missing ${expectedName}`);
    }
  }
}

const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const metadata = require('@git-stunts/git-warp/package.json');
if (metadata.name !== '@git-stunts/git-warp' || typeof metadata.version !== 'string') {
  throw new PackedArtifactSmokeError('package metadata export is malformed');
}

NODE

test ! -e node_modules/.bin/warp-graph
test -x node_modules/.bin/git-warp
test -x node_modules/.bin/git-warp-v18-to-v19
npx --no-install git-warp --help >/dev/null
npx --no-install git-warp-v18-to-v19 --help >/dev/null

PACKAGE_DIR="$FIXTURE_DIR/node_modules/@git-stunts/git-warp"
node "$PACKAGE_DIR/dist/scripts/upgrade-v16-to-v17.js" --help >/dev/null
test -f "$PACKAGE_DIR/scripts/hooks/post-merge.sh"
test -f "$PACKAGE_DIR/docs/READINGS_AND_OPTICS.md"
bash "$PACKAGE_DIR/scripts/install-git-warp.sh" --help >/dev/null
bash "$PACKAGE_DIR/scripts/uninstall-git-warp.sh" --help >/dev/null

echo "packed artifact smoke passed"
