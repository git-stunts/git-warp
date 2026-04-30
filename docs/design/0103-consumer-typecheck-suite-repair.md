# 0103 Consumer Typecheck Suite Repair

- Status: `DRIFT CHECK`
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

Stop at PLAYBACK. Drift Check should verify that the playback evidence
does not overclaim release readiness or hide fixture coverage loss.

## Playback Witness

### DESLUDGE Audit Questions

1. Did the new consumer fixture preserve meaningful public API
   coverage, or did it delete hard coverage to make the gate green?

   It preserved meaningful coverage for the current package-root public
   API gate, but it intentionally narrowed the old fixture. The old file
   mixed current package-root coverage with stale historical exports and
   API shapes. The new fixture still imports the current root runtime
   surface, current root function surface, current root constants, public
   snapshot types, the browser entrypoint, core graph construction,
   materialization, query/property bags, patch/writer flows, BTR,
   wormhole, state reader, index, HTTP serving, and negative compile
   checks.

   This is not the same as the old fixture's historical everything-file
   coverage. That narrowing is acceptable for 0103 because the removed
   expectations were stale or belonged to deeper API-specific tests, not
   to the current package-root consumer smoke gate.

2. Which old consumer expectations were truly stale?

   Stale root exports included names that are not current intentional
   root exports. The repair did not add them back to `index.ts` just to
   satisfy the old fixture.

   Stale BTR/provenance APIs included `serializeBTR`,
   `deserializeBTR`, `ProvenancePayload.toJSON`, and
   `ProvenancePayload.fromJSON`. The new fixture uses current BTR
   creation, verification, replay, and `ProvenancePayload` entry APIs.

   Stale option shapes included `clock` on `WarpApp.open`. The new
   fixture uses the current product-facing open shape.

   Stale adapter assumptions included old `BitmapIndexReader`
   construction and old `BitmapIndexBuilder.serialize()` result typing.
   The new fixture uses the current constructor and return shape.

3. Which old expectations were still valuable and are still covered?

   Current root exports are still imported and named through
   `exportedRuntimeSurface`, `exportedFunctionSurface`, and
   `exportedConstantSurface`.

   Graph construction remains covered through both `WarpApp.open` and
   `openWarpGraph`.

   Materialization remains covered through `graph.materialize()`,
   `graph.materialize({ receipts: true })`,
   `graphBag.materialize.materialize()`, and
   `graph.getStateSnapshot()`.

   Query and property-bag APIs remain covered through `getNodeProps`,
   `getEdgeProps`, `getEdges`, `neighbors`, `getPropertyCount`,
   `query`, `observer`, `worldline`, `createStateReader`, and
   `compareVisibleState`.

   Patch/writer APIs remain covered through `createPatch`, chained
   patch building, `commit`, `patch`, `writer`, and `PatchSession`.

   BTR, wormhole, indexing, browser entrypoint, and negative compile
   checks remain covered with current API shapes.

4. Did the repair avoid export carpet?

   Yes. `303f9275 test: repair consumer public api typecheck` changed
   only files under `test/type-check/`. It did not edit `index.ts`.

   The package root snapshot exports were introduced earlier by 0102
   because public read-side APIs return those types. 0103 did not add
   root exports for stale fixture names.

5. Are Bun/Deno declarations properly test-only?

   Yes. The Bun/Deno declarations live only in
   `test/type-check/runtime-declarations.d.ts`, and the only project
   that includes that file is `test/type-check/tsconfig.json`.

   They do not modify production source, package root exports, or
   production type declarations.

6. Is the `@git-stunts/trailer-codec` declaration shim scoped and
   honest?

   Yes. The shim lives in
   `test/type-check/trailer-codec.d.ts` and is included only by the
   consumer type-check project. It supplies the minimal shape needed for
   the consumer compiler to understand the otherwise untyped dependency.

   It does not declare product-domain behavior and does not widen the
   package root.

7. Does the new fixture still cover the 0102 snapshot public API?

   Yes. It imports and names `SnapshotWarpState`,
   `SnapshotPropValue`, `ImmutableBytes`, `SnapshotORSet`, and
   `SnapshotVersionVector`.

   It asserts `materialize()`, materialize-with-receipts,
   capability-bag materialization, and `getStateSnapshot()` expose
   `SnapshotWarpState`. It also checks `SnapshotWarpState.nodeAlive` as
   `SnapshotORSet`, `SnapshotWarpState.observedFrontier` as
   `SnapshotVersionVector`, and byte branches through
   `ImmutableBytes` methods.

8. Does the new fixture still include negative compile checks?

   Yes. It still uses `@ts-expect-error` checks for meaningful public
   misuse:

   - assigning `graph.materialize()` to `string`;
   - calling `hasNode` with a number;
   - calling `getEdgeProps` without all required identifiers;
   - calling `createNodeAdd` with a number.

9. Is `npm run typecheck:consumer` now a real gate again?

   Yes, evidence-scoped to the current package-root public API smoke
   surface. It is no longer red from stale fixture archaeology, missing
   Bun/Deno globals, or the untyped trailer-codec dependency. It now
   catches current root export drift, current public signature drift,
   and the focused 0102 snapshot public API shape.

   It is not a runtime immutability gate and it is not proof that every
   historical export expectation should return. Runtime snapshot
   behavior remains covered by conformance tests outside this
   compile-only fixture.

10. Are there any remaining release/API-note debts?

    Yes. 0102 release/API-note debt remains because public read-side
    APIs now return snapshot value/state types. 0103 also still needs
    Drift Check, Retrospective, and Cycle End before it is closed.

### Playback Validation

Commands:

```sh
npm run typecheck:consumer
npm run typecheck
npm run lint:sludge
git diff --check
npx markdownlint docs/design/0103-consumer-typecheck-suite-repair.md
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
- `npx markdownlint docs/design/0103-consumer-typecheck-suite-repair.md`
  passed.
- Manual policy scan of the changed type-check files returned no
  matches.

### Playback Finding

The consumer type-check suite is a trustworthy current package-root
public API gate again. It is not green theater from export carpet or
test-only global pollution.

The gate is evidence-scoped. It verifies current consumer compile-time
surface, not runtime immutability and not every historical expectation
that used to live in the stale fixture.

## Drift Check

1. Did 0103 stay within the consumer typecheck repair hill?

   Yes. 0103 repaired `npm run typecheck:consumer` by updating only the
   consumer type-check project and the design packet. It did not pull a
   new feature, resume 0096, add the pre-commit hook, or start release
   prep.

2. Did it avoid production implementation changes?

   Yes. The GREEN implementation commit
   `303f9275 test: repair consumer public api typecheck` changed only:

   - `test/type-check/consumer.ts`
   - `test/type-check/runtime-declarations.d.ts`
   - `test/type-check/trailer-codec.d.ts`
   - `test/type-check/tsconfig.json`

   The Playback and Drift Check commits are design documentation only.

3. Did it avoid export carpet?

   Yes. `index.ts` was changed earlier by 0102 to export public
   snapshot return/input types, including `ImmutableBytes`,
   `SnapshotORSet`, `SnapshotVersionVector`, `SnapshotWarpState`,
   `SnapshotPropValue`, and `PropValue`.

   0103 did not further widen `index.ts` to satisfy stale consumer
   fixture expectations. Therefore 0103 avoided export carpet.

4. Did it keep Bun/Deno/trailer-codec declarations test-only?

   Yes. Bun/Deno declarations live in
   `test/type-check/runtime-declarations.d.ts`; the trailer-codec shim
   lives in `test/type-check/trailer-codec.d.ts`. Both are included only
   by `test/type-check/tsconfig.json`.

   No production source, package root exports, or production type
   declaration file was changed to add those declarations.

5. Did it preserve meaningful current public API coverage?

   Yes, evidence-scoped to compile-time package-root smoke coverage. The
   fixture still covers current imports, `WarpApp.open`, `openWarpGraph`,
   materialization, materialization with receipts, capability-bag
   materialization, `getStateSnapshot`, query/property bags, observer,
   worldline, patch/writer flows, BTR, wormhole, state reader, indexing,
   HTTP serving, browser entrypoint, and negative compile checks.

   The fixture is intentionally not historical export archaeology and is
   not runtime behavior coverage.

6. Did it correctly remove stale historical expectations instead of
   restoring them as public API?

   Yes. Removed stale expectations include non-current root exports, old
   BTR/provenance APIs such as `serializeBTR`, `deserializeBTR`,
   `ProvenancePayload.toJSON`, and `ProvenancePayload.fromJSON`, the old
   `clock` option on `WarpApp.open`, and old index adapter assumptions.

   0103 did not restore those names by adding root exports or
   compatibility aliases.

7. Does `npm run typecheck:consumer` now pass honestly?

   Yes. It passes after the repair and checks the current package-root
   public API smoke surface. Its scope is explicit: compile-time current
   consumer surface, not runtime immutability and not historical API
   restitution.

8. Does the new fixture's scope remain clearly described as compile-time
   public API smoke coverage, not runtime immutability coverage?

   Yes. Playback records that runtime snapshot behavior remains covered
   by conformance tests outside the compile-only fixture.

9. Are release/API-note debts still visible?

   Yes. 0102 release/API-note debt remains visible because public
   read-side APIs now return snapshot state/value types. 0103 itself
   still needs Retrospective and Cycle End before it is closed.

10. Is any correction required before Retrospective?

    No code correction is required from this Drift Check. The only
    wording correction was the export-scope distinction: 0102 changed
    `index.ts` for intentional public snapshot types; 0103 did not
    widen `index.ts` for stale consumer fixture expectations.

### Drift Validation

Commands:

```sh
npm run typecheck:consumer
npm run typecheck
npm run lint:sludge
git diff --check
npx markdownlint docs/design/0103-consumer-typecheck-suite-repair.md
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
- `npx markdownlint docs/design/0103-consumer-typecheck-suite-repair.md`
  passed.
- Manual policy scan of the changed type-check files returned no
  matches.

### Drift Finding

No 0103 drift was found. The repair remains within the consumer
type-check hill, and the green gate claim remains evidence-scoped.

Stop at Drift Check. Retrospective should record the cost of rewriting
the fixture, the useful coverage preserved, the stale coverage removed,
and the remaining release/API-note debt.
