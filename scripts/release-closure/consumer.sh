#!/usr/bin/env bash
# Install only public registry packages in a disposable, independent consumer.
set -euo pipefail

WORK="$1"
PACKAGE="$2"
VERSION="$3"
# shellcheck source=scripts/release-closure/budget.sh
source "$(cd "$(dirname "$0")" && pwd)/budget.sh"
start_budget "$4" 180
CONSUMER_STATUS="failed"
CONSUMER_STAGE="install"
consumer_failure() {
  local code=$?
  if [ "$CONSUMER_STATUS" != "verified" ]; then
    jq -n --arg stage "$CONSUMER_STAGE" '{status:"failed",stage:$stage}' > "$WORK/consumer.json"
    echo "release consumer failed: $CONSUMER_STAGE" >&2
  fi
  exit "$code"
}
trap consumer_failure EXIT
mkdir "$WORK/consumer"
cd "$WORK/consumer"
printf '{"name":"git-warp-release-consumer","version":"1.0.0","private":true}\n' > package.json
bounded npm install --save-exact --ignore-scripts --no-audit --no-fund \
  --registry=https://registry.npmjs.org --fetch-retries=0 --fetch-timeout=15000 \
  "$PACKAGE@$VERSION" > "$WORK/install.log" 2>&1

CONSUMER_STAGE="integrity"
jq -e --arg version "$VERSION" --arg integrity "$(jq -r .dist.integrity "$WORK/npm.json")" \
  '.packages["node_modules/@git-stunts/git-warp"]|
    .version==$version and .integrity==$integrity and
    (.resolved|startswith("https://registry.npmjs.org/")) and (.link!=true)' \
  package-lock.json >/dev/null

CONSUMER_STAGE="signatures"
bounded npm audit signatures --registry=https://registry.npmjs.org \
  --fetch-retries=0 --fetch-timeout=15000 > "$WORK/signatures.log" 2>&1

CONSUMER_STAGE="imports"
bounded node --input-type=module <<'NODE'
class ReleaseConsumerError extends Error {}
const values = await import('@git-stunts/git-warp');
const names = Object.keys(values);
if (names.length !== 1 || names[0] !== 'Runtime' || typeof values.Runtime !== 'function') {
  throw new ReleaseConsumerError('public root must export exactly Runtime');
}
let denied = false;
try {
  await import('@git-stunts/git-warp/storage');
} catch (error) {
  if (error instanceof Error && 'code' in error && error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
    denied = true;
  } else {
    throw error;
  }
}
if (!denied) throw new ReleaseConsumerError('private storage import was admitted');
NODE

CONSUMER_STAGE="cli"
test -x node_modules/.bin/git-warp
bounded node_modules/.bin/git-warp --help > "$WORK/cli.log" 2>&1

CONSUMER_STAGE="dependencies"
jq -e '.packages|to_entries|map(select(
  .key|test("node_modules/@git-stunts/(git-cas|plumbing)$")))|
  map({package:(.key|capture("(?<name>@git-stunts/(git-cas|plumbing))$").name),
    version:.value.version})|unique|sort_by(.package,.version)|
  select(any(.[];.package=="@git-stunts/git-cas") and any(.[];.package=="@git-stunts/plumbing"))|
  {status:"verified",rootImport:"passed",privateStorageFirewall:"passed",
    cli:"passed",registrySignatures:"verified",dependencies:.}' package-lock.json > "$WORK/consumer-pending.json"
mv "$WORK/consumer-pending.json" "$WORK/consumer.json"
CONSUMER_STATUS="verified"
