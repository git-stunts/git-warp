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

# Parse all module-load forms and refuse computed targets before any execution.
node "$ROOT/scripts/package-payload/CalibrateAttachmentConsumerImports.ts"
node "$ROOT/scripts/package-payload/CheckAttachmentConsumerImports.ts" \
  attachments.mjs packed-content-types.ts packed-content-consumer.mjs packed-content.mjs
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
