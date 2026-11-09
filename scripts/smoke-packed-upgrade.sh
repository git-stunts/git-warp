#!/usr/bin/env bash
# Exercise the installed npm command without source files or a compiler.
set -euo pipefail
source "$(dirname "$0")/SmokeTestDockerEntry.sh"

PACKAGE_DIR=$(cd "$1" && pwd -P)
WORK=$(mktemp -d "${TMPDIR:-/tmp}/git-warp-upgrade-smoke.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

snapshot_package() {
  (cd "$PACKAGE_DIR" && find . -type f -print0 | sort -z | xargs -0 sha256sum)
}

test ! -e "$PACKAGE_DIR/tsconfig.publish.json"
test ! -e "$PACKAGE_DIR/index.ts"
snapshot_package > "$WORK/before.sha256"
if ! npm --prefix "$PACKAGE_DIR" --silent run upgrade -- --help > "$WORK/help.txt" 2>&1; then
  cat "$WORK/help.txt" >&2
  if [ ! -f "$PACKAGE_DIR/dist/scripts/upgrade-v16-to-v17.js" ]; then
    echo 'installed npm upgrade removed its compiled entry' >&2
  fi
  exit 1
fi
grep -q 'npm run upgrade' "$WORK/help.txt"
snapshot_package > "$WORK/after-help.sha256"
diff -u "$WORK/before.sha256" "$WORK/after-help.sha256"

git init -q "$WORK/repo"
git -C "$WORK/repo" config user.name 'Packed upgrade regression'
git -C "$WORK/repo" config user.email packed-upgrade@example.invalid
git -C "$WORK/repo" commit -q --allow-empty -m 'Upgrade fixture'
git -C "$WORK/repo" for-each-ref > "$WORK/refs-before.txt"
npm --prefix "$PACKAGE_DIR" --silent run upgrade -- \
  --repo "$WORK/repo" --dry-run --json > "$WORK/upgrade.json"
jq -e '. == {dryRun: true, graphCount: 0, graphs: []}' "$WORK/upgrade.json" > /dev/null
git -C "$WORK/repo" for-each-ref > "$WORK/refs-after.txt"
diff -u "$WORK/refs-before.txt" "$WORK/refs-after.txt"
snapshot_package > "$WORK/after-dry-run.sha256"
diff -u "$WORK/before.sha256" "$WORK/after-dry-run.sha256"
echo 'installed npm upgrade help and dry-run preserve package bytes and repository refs'
