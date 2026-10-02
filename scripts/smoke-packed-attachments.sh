#!/usr/bin/env bash
# Installed-package attachment examples and acceptance; called after tarball install.
set -euo pipefail
ROOT=$1
CONSUMER=$2
node "$ROOT/scripts/RequireDockerTests.ts"
cd "$CONSUMER"
cp "$ROOT/examples/attachments.mjs" ./attachments.mjs
cp "$ROOT/test/type-check/packed/attachments.ts" ./packed-content-types.ts
cp "$ROOT/test/fixtures/packed-content-consumer.mjs" ./packed-content-consumer.mjs
cp "$ROOT/test/fixtures/packed-content.mjs" ./packed-content.mjs

# Every package import must resolve through a supported package export. Reject
# checkout-relative, absolute, file:, and private imports before execution.
for fixture in attachments.mjs packed-content-types.ts packed-content-consumer.mjs packed-content.mjs; do
  if grep -nE "(from |import\\()['\"](\\.|/|file:|@git-stunts/git-warp/(src|dist|storage))" "$fixture"; then
    echo "attachment consumer fixture escaped supported package imports: $fixture" >&2
    exit 1
  fi
done
node_modules/.bin/tsc --noEmit --strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess \
  --skipLibCheck false --target ESNext --lib ESNext,DOM --types node --allowJs --checkJs \
  --module NodeNext --moduleResolution NodeNext attachments.mjs packed-content-types.ts
node_modules/.bin/tsc --noEmit --strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess \
  --skipLibCheck false --target ESNext --lib ESNext,DOM --types node --allowJs --checkJs \
  --module ESNext --moduleResolution Bundler attachments.mjs packed-content-types.ts
REPOSITORY=$(mktemp -d)
trap 'rm -rf "$REPOSITORY"' EXIT
git init -q "$REPOSITORY"
git -C "$REPOSITORY" config user.name 'Packed attachment example'
git -C "$REPOSITORY" config user.email 'packed-example@example.invalid'
node attachments.mjs "$REPOSITORY"
node packed-content.mjs
node packed-content-consumer.mjs
