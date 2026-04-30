# 0103 Consumer Typecheck Suite Repair

- Status: `GREEN`
- Release lane: `v17.0.0`
- Source backlog: `API_consumer-typecheck-suite-red`
- Design role: active METHOD cycle
- Review audience: maintainers and future agents

## Hill

`npm run typecheck:consumer` is a trustworthy public API gate again.

## Why This Exists

0102 made the focused snapshot public API model honest, but the broad
consumer type-check suite still failed. That left release confidence
split between focused snapshot conformance and a red package-root
consumer gate.

This cycle repairs the gate without turning `index.ts` into an export
carpet and without weakening meaningful current public API coverage.

## PULL

Pulled:

`docs/method/backlog/bad-code/API_consumer-typecheck-suite-red.md`

The backlog card is resolved by this cycle and removed from the open
bad-code backlog.

## RED Witness

Command:

```sh
npm run typecheck:consumer
```

Result before repair: failed.

Failure classification:

- Test-only environment declaration gap:
  `BunServeOptions`, `BunServer`, `DenoServeOptions`, and `DenoServer`
  were missing from the consumer type-check project.
- Missing dependency/declaration problem:
  `@git-stunts/trailer-codec` had no declaration file visible to the
  consumer type-check project.
- Stale consumer fixture expectation:
  the consumer fixture imported many package-root names that are not
  current intentional root exports.
- Old BTR/provenance example drift:
  the fixture still expected old BTR and provenance APIs such as
  `serializeBTR`, `deserializeBTR`, `ProvenancePayload.toJSON`, and
  `ProvenancePayload.fromJSON`.
- Real public API mismatch in the fixture:
  the fixture used old option shapes such as `clock` on
  `WarpApp.open`, stale `BitmapIndexReader` construction, and stale
  `BitmapIndexBuilder.serialize()` result typing.

## GREEN Witness

Implementation commit:

```txt
303f9275 test: repair consumer public api typecheck
```

Repair summary:

- Added test-only runtime declarations for Bun and Deno HTTP adapter
  globals.
- Added a test-only declaration shim for `@git-stunts/trailer-codec`.
- Replaced the stale consumer fixture with a current package-root public
  API smoke test.
- Kept public snapshot API coverage for `SnapshotWarpState`,
  `SnapshotPropValue`, `ImmutableBytes`, `SnapshotORSet`, and
  `SnapshotVersionVector`.
- Kept negative compile checks for meaningful public API mistakes.
- Did not add root exports for stale names just to satisfy the old
  fixture.
- Did not edit production implementation code.

Validation:

```sh
npm run typecheck:consumer
npm run typecheck
npm run lint:sludge
git diff --check
npx eslint $(git diff --name-only -- '*.ts')
rg -n "any|as any|as unknown as|Record<string, unknown>|unknown|Readonly<Uint8Array>|ReadonlySet|globalThis\\.Set|Object\\.create|\\bProxy\\b|JSON\\.parse|JSON\\.stringify|\\bFunction\\b|[A-Za-z0-9_]+Like\\b" \
  test/type-check/consumer.ts \
  test/type-check/runtime-declarations.d.ts \
  test/type-check/trailer-codec.d.ts \
  test/type-check/tsconfig.json
```

Results:

- `npm run typecheck:consumer` passed.
- `npm run typecheck` passed.
- `npm run lint:sludge` passed.
- `git diff --check` passed.
- ESLint reported no errors. It warned that
  `test/type-check/consumer.ts` is ignored by config.
- Manual policy scan of changed type-check files found no checked
  sludge pattern matches.

## Non-Goals

- Do not resume `0096-purge-cast-hacks`.
- Do not add the pre-commit hook in this cycle.
- Do not export every stale consumer fixture name from `index.ts`.
- Do not delete meaningful current consumer coverage.
- Do not weaken the consumer gate to hide failures.

## Next Phase

Stop at GREEN. Playback should verify that the consumer suite is now a
trustworthy release gate and that the repaired fixture covers the
current public package surface rather than stale expectations.
