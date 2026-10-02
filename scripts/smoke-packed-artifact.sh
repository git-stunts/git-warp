#!/usr/bin/env bash
# Smoke the actual npm tarball in a clean consumer fixture.
set -euo pipefail
source "$(dirname "$0")/SmokeTestDockerEntry.sh"

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

case "$(cd "$FIXTURE_DIR" && pwd -P)/" in
  "$(cd "$ROOT" && pwd -P)/"*)
    echo "smoke-packed-artifact: consumer fixture must live outside the checkout" >&2
    exit 1
    ;;
esac

cd "$ROOT"
# The consumer type-checks the packed declarations with the same compiler and
# Node typings the repository is locked to, installed from the registry.
TYPESCRIPT_VERSION=$(node -p "require('./node_modules/typescript/package.json').version")
TYPES_NODE_VERSION=$(node -p "require('./node_modules/@types/node/package.json').version")
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
npm install --no-audit --no-fund "$TARBALL_PATH" \
  "typescript@$TYPESCRIPT_VERSION" "@types/node@$TYPES_NODE_VERSION" >/dev/null

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

const expectedExportKeys = ['.', './advanced', './diagnostics', './charts', './testing', './package.json'];
const exportKeys = Object.keys(metadata.exports);
if (exportKeys.join(',') !== expectedExportKeys.join(',')) {
  throw new PackedArtifactSmokeError(`unexpected export map keys: ${exportKeys.join(', ')}`);
}
const { existsSync } = await import('node:fs');
const { dirname, join } = await import('node:path');
const packageDir = dirname(require.resolve('@git-stunts/git-warp/package.json'));
for (const key of expectedExportKeys.filter((name) => name !== './package.json')) {
  const conditions = metadata.exports[key];
  if (Object.keys(conditions)[0] !== 'types') {
    throw new PackedArtifactSmokeError(`${key} must list its types condition first`);
  }
  for (const target of Object.values(conditions)) {
    if (!existsSync(join(packageDir, target))) {
      throw new PackedArtifactSmokeError(`${key} target is missing from the artifact: ${target}`);
    }
  }
}
const expectedBins = {
  'git-warp': './bin/git-warp',
  'git-warp-v18-to-v19': './dist/scripts/v18-to-v19/migrate.js',
};
if (Object.keys(metadata.bin).length !== Object.keys(expectedBins).length ||
    Object.entries(expectedBins).some(([name, target]) => metadata.bin[name] !== target)) {
  throw new PackedArtifactSmokeError('unexpected bin map');
}
if (metadata.main !== './dist/index.js' || metadata.types !== './dist/index.d.ts') {
  throw new PackedArtifactSmokeError('package main/types fields are malformed');
}

const privateSubpaths = [
  '@git-stunts/git-warp/dist/index.js',
  '@git-stunts/git-warp/dist/src/application/Runtime.js',
  '@git-stunts/git-warp/dist/bin/git-warp.js',
  '@git-stunts/git-warp/dist/scripts/v18-to-v19/migrate.js',
  '@git-stunts/git-warp/scripts/hooks/post-merge.sh',
];
for (const specifier of privateSubpaths) {
  let failure;
  try {
    await import(specifier);
  } catch (error) {
    failure = error;
  }
  if (failure?.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
    throw new PackedArtifactSmokeError(`private subpath is not sealed: ${specifier}`);
  }
}

NODE

test ! -e node_modules/.bin/warp-graph
test -x node_modules/.bin/git-warp
test -x node_modules/.bin/git-warp-v18-to-v19
npx --no-install git-warp --help >/dev/null
npx --no-install git-warp-v18-to-v19 --help >/dev/null

PACKAGE_DIR="$FIXTURE_DIR/node_modules/@git-stunts/git-warp"
# The legacy upgrade command only runs when argv[1] equals its resolved module
# path, so call it through the physical path; a symlinked temporary directory
# (such as /var on macOS) would otherwise make it exit 0 without doing anything.
LEGACY_UPGRADE="$(cd "$PACKAGE_DIR" && pwd -P)/dist/scripts/upgrade-v16-to-v17.js"
node "$LEGACY_UPGRADE" --help | grep -q 'npm run upgrade'
test -f "$PACKAGE_DIR/scripts/hooks/post-merge.sh"
test -f "$PACKAGE_DIR/docs/READINGS_AND_OPTICS.md"
test -f "$PACKAGE_DIR/docs/migrations/v19/README.md"
bash "$PACKAGE_DIR/scripts/install-git-warp.sh" --help >/dev/null
bash "$PACKAGE_DIR/scripts/uninstall-git-warp.sh" --help >/dev/null

# Withheld repository documentation must stay out of the artifact.
test ! -e "$PACKAGE_DIR/CHANGELOG.md"
test ! -e "$PACKAGE_DIR/docs/topics"
test ! -e "$PACKAGE_DIR/docs/operations"

# Shipped documents may link package-relative only to shipped files, and every
# relative import in the shipped JavaScript must resolve inside the artifact so
# the executables and migration commands keep their dependencies.
CHECK_PACKED="$ROOT/scripts/package-payload/CheckPackedArtifact.ts"
node "$CHECK_PACKED" documents "$PACKAGE_DIR"
node "$CHECK_PACKED" imports "$PACKAGE_DIR"

# Type-check all five public type surfaces from the installed tarball with
# skipLibCheck disabled. The fixture is the repository's own subpath consumer,
# rewritten to import package specifiers only.
npm pkg set type=module >/dev/null
mkdir -p types
sed \
  -e "s#'../../index.ts'#'@git-stunts/git-warp'#" \
  -e "s#'../../advanced.ts'#'@git-stunts/git-warp/advanced'#" \
  -e "s#'../../charts.ts'#'@git-stunts/git-warp/charts'#" \
  -e "s#'../../diagnostics.ts'#'@git-stunts/git-warp/diagnostics'#" \
  -e "s#'../../testing.ts'#'@git-stunts/git-warp/testing'#" \
  "$ROOT/test/type-check/v19-subpaths.ts" > types/v19-subpaths.ts
if grep -nE "from '\.|import\('\." types/v19-subpaths.ts; then
  echo "consumer type fixture still imports from the checkout" >&2
  exit 1
fi
for subpath in "" /advanced /charts /diagnostics /testing; do
  grep -qF "from '@git-stunts/git-warp$subpath'" types/v19-subpaths.ts
done
cat > types/private-subpaths.ts <<'TS'
// @ts-expect-error The storage subpath is not exported.
import type {} from '@git-stunts/git-warp/storage';
// @ts-expect-error Compiled implementation is not an exported subpath.
import type {} from '@git-stunts/git-warp/dist/src/application/Runtime.js';
// @ts-expect-error Executable implementation is not an exported subpath.
import type {} from '@git-stunts/git-warp/dist/bin/git-warp.js';
TS
cat > tsconfig.json <<'JSON'
{
  "compilerOptions": {
    "noEmit": true,
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": false,
    "target": "ESNext",
    "lib": ["ESNext"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"]
  },
  "files": ["types/v19-subpaths.ts", "types/private-subpaths.ts"]
}
JSON
node_modules/.bin/tsc -p tsconfig.json
node_modules/.bin/tsc -p tsconfig.json --module ESNext --moduleResolution Bundler

# Supported CLI, hook, and migration behavior against a disposable repository.
REPO="$TMP_ROOT/repo"
git init -q "$REPO"
git -C "$REPO" config user.name "git-warp packed smoke"
git -C "$REPO" config user.email "packed-smoke@example.invalid"
git -C "$REPO" commit -q --allow-empty -m "packed smoke base"

warp() {
  npx --no-install git-warp --repo "$REPO" --lane events --writer smoke --json "$@"
}
warp write --intent '{"kind":"node.add","subject":"user:alice"}' > /dev/null
warp write --intent '{"kind":"property.set","subject":"user:alice","key":"role","value":"admin"}' \
  > write.json
warp repair --action materialization > /dev/null
warp observe --observer role \
  --reading '{"kind":"property.get","subject":"user:alice","key":"role"}' > observe.json

# Doctor exits 0 when healthy and 3 when it reports warnings, such as the
# missing post-merge hook. Any other status is fatal.
run_doctor() {
  local status=0
  npx --no-install git-warp --repo "$REPO" --lane events --json doctor > "$1" || status=$?
  if [ "$status" -ne 0 ] && [ "$status" -ne 3 ]; then
    cat "$1" >&2
    echo "git-warp doctor exited $status" >&2
    exit 1
  fi
}
run_doctor doctor-before.json
# Hook installation through the packaged CLI wiring must find the shipped
# scripts/hooks/post-merge.sh template.
node "$CHECK_PACKED" hook "$PACKAGE_DIR" "$REPO"
run_doctor doctor-after.json

# Migration discovery must load its full module graph from the artifact and
# classify the fresh Lane as current. Without a terminal it refuses to confirm
# and exits 1 before rehearsal, so the repository is never mutated.
REFS_BEFORE=$(git -C "$REPO" for-each-ref)
MIGRATE_STATUS=0
npx --no-install git-warp-v18-to-v19 --repo "$REPO" --graph events --dry-run \
  < /dev/null > migrate.txt 2>&1 || MIGRATE_STATUS=$?
if [ "$MIGRATE_STATUS" -ne 1 ]; then
  cat migrate.txt >&2
  echo "git-warp-v18-to-v19 exited $MIGRATE_STATUS; expected the non-interactive refusal" >&2
  exit 1
fi
grep -qF 'events — v19 current' migrate.txt
grep -qF 'confirmation requires an interactive terminal' migrate.txt
node "$LEGACY_UPGRADE" --repo "$REPO" --dry-run --json > upgrade.json
test "$(git -C "$REPO" for-each-ref)" = "$REFS_BEFORE"
node "$CHECK_PACKED" results "$FIXTURE_DIR"

bash "$ROOT/scripts/smoke-packed-node-removal.sh" "$ROOT" "$PACKAGE_DIR" "$TMP_ROOT/lifecycle"

cp "$ROOT/test/fixtures/packed-content.mjs" ./packed-content.mjs
node packed-content.mjs
echo "packed artifact smoke passed"
