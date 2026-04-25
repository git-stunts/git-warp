---
id: TS_publish-pipeline
blocks:
  - TS_ssts-conformance-suite
blocked_by:
  - TS_infrastructure-adapters
  - TS_cli-viz-scripts
feature: tooling-release
---

# Publish pipeline for v17.0.0

## Sequencing

This is **launch-prep work**, not an active engineering trunk.

Do not pull this early just because it is visible in `v17.0.0/`.
The correct posture is:

- finish the remaining product/runtime work first
- get the repo essentially release-candidate ready
- then do the publish/declaration surface hardening at the very end

That keeps release mechanics from stealing time from shipping-critical
engine and API work.

Phase 6 of cycle 0013. After all `.js` files are `.ts` and the API
redesign is complete, configure the build to emit declarations, verify
the public surface, and ship to npm + JSR.

## Current state

- `tsconfig.base.json` has `"noEmit": true` — no declarations generated.
- Three hand-maintained `.d.ts` files at the repo root:
  - `index.d.ts` (4,080 LOC) — the entire public API surface
  - `browser.d.ts` (42 LOC) — browser entry point
  - `sha1sync.d.ts` (14 LOC) — standalone sha1 export
- `package.json` `"types"` field points to `./index.d.ts`.
- `jsr.json` `"exports"` maps `"."` to `./index.js`.
- Consumer type-check: `test/type-check/consumer.ts` (compile-only, not executed).
- Surface validator: `scripts/check-dts-surface.js` cross-checks a manifest.
- Release preflight: `scripts/release-preflight.sh` runs all gates.
- Release CI: `.github/workflows/release.yml` publishes to npm + JSR.

## Step 1: tsconfig changes for declaration generation

Create `tsconfig.build.json` (used only for `npm run build:types`):

```jsonc
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "noEmit": false,
    "emitDeclarationOnly": true,
    "declaration": true,
    "declarationMap": true,
    "declarationDir": "./dist/types",
    "outDir": "./dist/types",
    // Strip internal types (see Step 3)
    "stripInternal": true
  },
  "include": [
    "src/**/*.ts",
    "index.ts",
    "browser.ts"
  ],
  "exclude": [
    "node_modules",
    "test/**/*",
    "scripts/**/*",
    "bin/**/*",
    "demo/**/*"
  ]
}
```

**Sludge to watch:** The current `tsconfig.base.json` includes `bin/`
and `scripts/` in its `include`. The build config must NOT include
those — they are not part of the published package.

Add a `build:types` script to `package.json`:

```json
"build:types": "tsc -p tsconfig.build.json"
```

## Step 2: Create the root `.ts` entry points

After all source is `.ts`, the root entry points need to change:

- Rename `index.js` to `index.ts` — re-exports from `src/domain/`.
- Rename `browser.js` to `browser.ts` — re-exports for browser.
- Delete `sha1sync.d.ts` — `sha1sync` is already `.ts` after infra
  adapter conversion; tsc generates the declaration.

The existing `index.js` (337 LOC) is a barrel of re-exports. In `.ts`
form, these become real typed re-exports. The hand-maintained
`index.d.ts` (4,080 LOC of manually synchronized declarations) is
**deleted** — tsc generates the declarations from the source.

## Step 3: Strip internal types from declarations

Use `@internal` JSDoc tags + `"stripInternal": true` in
`tsconfig.build.json` to exclude internal implementation types from
the generated `.d.ts` files.

Types to mark `@internal`:

- `_internal.ts` shim (dies with WarpRuntime kill, but if remnants exist)
- All `OpStrategy` implementations (internal reducer machinery)
- `SnapshotBeforeOp` (internal reducer state)
- `ReceiptBuilder` (internal)
- `PatchCommitter` (internal)
- `PatchHydrator` (internal)
- `JoinReducer` (internal)
- `OpNormalizer` (internal)
- `MultiplexSink` (internal)
- All stream internals (`Sink`, `Transform`, `WarpStream`) unless
  the user-facing API exposes them

**Verification:** After `build:types`, grep the output `dist/types/`
for any type that should NOT be public. Automate this as a script or
add checks to `check-dts-surface.js`.

## Step 4: Update package.json exports

```jsonc
{
  "exports": {
    ".": {
      "types": "./dist/types/index.d.ts",
      "import": "./index.ts",
      "default": "./index.ts"
    },
    "./node": {
      "types": "./dist/types/src/domain/entities/GraphNode.d.ts",
      "import": "./src/domain/entities/GraphNode.ts",
      "default": "./src/domain/entities/GraphNode.ts"
    },
    "./visualization": {
      "types": "./dist/types/src/visualization/index.d.ts",
      "import": "./src/visualization/index.ts",
      "default": "./src/visualization/index.ts"
    },
    "./browser": {
      "types": "./dist/types/browser.d.ts",
      "import": "./browser.ts",
      "default": "./browser.ts"
    },
    "./sha1sync": {
      "types": "./dist/types/src/infrastructure/adapters/sha1sync.d.ts",
      "import": "./src/infrastructure/adapters/sha1sync.ts",
      "default": "./src/infrastructure/adapters/sha1sync.ts"
    }
  },
  "types": "./dist/types/index.d.ts",
  "files": [
    "bin/",
    "src/",
    "dist/types/",
    "browser.ts",
    "index.ts",
    "README.md",
    "CHANGELOG.md",
    "LICENSE",
    "NOTICE",
    "scripts/install-git-warp.sh",
    "scripts/uninstall-git-warp.sh"
  ]
}
```

**Sludge to watch:** The `"files"` array currently lists individual
`.d.ts` files. After the switch to generated declarations, those are
replaced by `"dist/types/"`. Make sure `npm pack --dry-run` does not
accidentally include `test/`, `demo/`, or `scripts/` beyond the
install/uninstall scripts.

## Step 5: Update jsr.json

JSR publishes `.ts` source directly (no declaration generation needed).
Update exports to point to `.ts` files:

```jsonc
{
  "name": "@git-stunts/git-warp",
  "version": "17.0.0",
  "exports": {
    ".": "./index.ts",
    "./node": "./src/domain/entities/GraphNode.ts",
    "./visualization": "./src/visualization/index.ts",
    "./browser": "./browser.ts",
    "./sha1sync": "./src/infrastructure/adapters/sha1sync.ts"
  },
  "publish": {
    "include": [
      "index.ts",
      "browser.ts",
      "src/**/*.ts",
      "README.md",
      "CHANGELOG.md",
      "LICENSE",
      "NOTICE"
    ]
  }
}
```

## Step 6: npm pack dry-run verification

```bash
# Generate declarations
npm run build:types

# Dry-run pack
npm pack --dry-run 2>&1 | tee /tmp/pack-output.txt

# Verify:
# 1. No .js source files (everything is .ts now)
# 2. dist/types/ is included
# 3. No test/, demo/, .obsidian/, or .env files
# 4. Total size is reasonable (compare to v16 tarball size)
# 5. bin/ scripts are included
```

Automate this check by adding to `release-preflight.sh`:

```bash
# After existing pack dry-run check:
PACK_FILES=$(npm pack --dry-run 2>&1)
if printf '%s\n' "$PACK_FILES" | grep -qE 'test/|demo/|\.env'; then
  fail "pack includes test/demo/.env files"
fi
if ! printf '%s\n' "$PACK_FILES" | grep -q 'dist/types/index.d.ts'; then
  fail "pack missing generated declarations"
fi
```

## Step 7: JSR publish dry-run

```bash
npx jsr publish --dry-run --allow-dirty 2>&1 | tee /tmp/jsr-output.txt

# Verify:
# 1. No missing exports
# 2. No "slow types" warnings (JSR requires explicit return types)
# 3. All public functions have explicit return type annotations
```

**Sludge to watch:** JSR's "slow types" diagnostic rejects functions
without explicit return types. After converting to `.ts`, any function
that relied on type inference for its return type needs an explicit
annotation. Run `npx jsr publish --dry-run` early and often during
the conversion phases to catch these.

## Step 8: Consumer compatibility verification

### Update existing consumer test

`test/type-check/consumer.ts` already exercises the full public API.
After the switch from hand-maintained to generated declarations:

1. Run `npm run build:types`
2. Run `npm run typecheck:consumer`
3. If any import breaks, the generated declarations are missing an export

### Create a standalone consumer project

```bash
mkdir /tmp/warp-consumer-test && cd /tmp/warp-consumer-test
npm init -y
npm pack --pack-destination . /path/to/git-warp
npm install git-stunts-git-warp-17.0.0.tgz
```

Create `test.ts`:

```typescript
import WarpApp, { WarpCore, InMemoryGraphAdapter } from '@git-stunts/git-warp';
import { sha1sync } from '@git-stunts/git-warp/sha1sync';

// Verify runtime works
const adapter = new InMemoryGraphAdapter();
const app = await WarpApp.open({
  graphName: 'test',
  persistence: adapter,
  writerId: 'test-writer',
});
const graph: WarpCore = app.core();
await graph.patch((p) => p.addNode('hello'));
const state = await graph.materialize();
console.log('Nodes:', Object.keys(state.nodes));

// Verify sha1sync export
const hash: string = sha1sync(new TextEncoder().encode('hello'));
console.log('Hash:', hash);
```

Create `tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ESNext",
    "noEmit": true
  },
  "include": ["test.ts"]
}
```

Run:

```bash
npx tsc --noEmit          # Type-check passes
npx tsx test.ts           # Runtime works
```

This verifies both type declarations AND runtime behavior from a
consumer's perspective.

## Step 9: Update surface validator

`scripts/check-dts-surface.js` currently cross-checks against a
manifest. After the switch to generated declarations, the manifest
must be updated to match the new `dist/types/index.d.ts` paths. Or:
delete the manifest and have the surface validator parse the generated
`dist/types/index.d.ts` directly.

**Decision needed:** Keep manifest-based validation or switch to
parsing generated declarations? Manifest is more explicit but
requires manual updates. Parsing is automatic but may miss
intentional omissions.

## Step 10: Update release runbook

Changes to `docs/method/release.md`:

1. Add `npm run build:types` before `npm run release:preflight`
2. Add `dist/types/` to the list of generated artifacts
3. Note that hand-maintained `.d.ts` files are gone
4. Update the preflight table to include declaration generation check
5. Add JSR slow-types check to the preflight

## Step 11: Update CI

Changes to `.github/workflows/release.yml`:

1. Add `npm run build:types` step before pack/publish
2. Add `dist/types/` to the artifact cache
3. Verify the `verify` job checks for `dist/types/index.d.ts`

## Step 12: Delete hand-maintained declarations

After all the above is verified and green:

- Delete `index.d.ts` (4,080 LOC)
- Delete `browser.d.ts` (42 LOC)
- Delete `sha1sync.d.ts` (14 LOC)
- Delete `src/visualization/index.d.ts` (41 LOC)

Total: ~4,189 LOC of hand-maintained type declarations deleted across the full
TS migration path. The blocked `_wiredMethods.d.ts` runtime shim already died
in cycle `0069`.

## Step 13: Tag v17.0.0

1. Bump version in `package.json` and `jsr.json` to `17.0.0`
2. Move `[Unreleased]` items in `CHANGELOG.md` to `[17.0.0]` section
3. Commit: `release: v17.0.0`
4. Run `npm run release:preflight`
5. Follow the release runbook

## Execution order

1. Create `tsconfig.build.json` and `build:types` script
2. Convert `index.js` and `browser.js` to `.ts`
3. Run `build:types`, verify output in `dist/types/`
4. Update `package.json` exports and `files` to use generated types
5. Update `jsr.json` exports
6. Run `npm pack --dry-run` and `npx jsr publish --dry-run`
7. Update `consumer.ts` if needed, run `typecheck:consumer`
8. Create standalone consumer project, verify types + runtime
9. Update `check-dts-surface.js` or delete manifest
10. Update `release-preflight.sh` with new checks
11. Update CI workflow
12. Delete hand-maintained `.d.ts` files
13. Final full verification: lint, typecheck, test, pack, JSR dry-run
14. Tag and release
