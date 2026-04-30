# 0103 Consumer Typecheck Suite Repair Retrospective

- Outcome: `hill met for consumer public API typecheck gate`
- Cycle doc: [docs/design/0103-consumer-typecheck-suite-repair.md](../../design/0103-consumer-typecheck-suite-repair.md)
- Release lane: `v17.0.0`

## Outcome

0103 is hill met for the focused consumer public API typecheck gate.

`npm run typecheck:consumer` now passes and checks the current
package-root public API smoke surface. That is release-confidence
progress because the broad consumer gate is no longer red from stale
fixture expectations, missing Bun/Deno test globals, or an untyped
`@git-stunts/trailer-codec` dependency.

This does not mean release readiness is fully established. 0102
release/API-note debt remains because public read-side APIs now return
snapshot state/value types, and the consumer fixture is compile-time
coverage, not runtime immutability proof.

## What Went Well

- The red consumer type-check suite was repaired without editing
  production implementation code.
- The repair avoided root export carpet. `index.ts` was not widened by
  0103 to satisfy stale fixture imports.
- Test-only Bun/Deno declarations stayed under `test/type-check/`.
- The `@git-stunts/trailer-codec` declaration shim stayed under
  `test/type-check/`.
- The current fixture still covers public snapshot API types from 0102:
  `SnapshotWarpState`, `SnapshotPropValue`, `ImmutableBytes`,
  `SnapshotORSet`, and `SnapshotVersionVector`.
- The current fixture kept negative compile checks for meaningful public
  API misuse.
- Playback and Drift Check explicitly separated compile-time consumer
  API coverage from runtime immutability coverage.

## What Went Wrong

- The previous consumer fixture had become historical archaeology. It
  mixed useful package-root coverage with stale exports and old API
  shapes.
- The fixture rewrite was large enough to require extra audit. A green
  replacement fixture can become green theater if coverage loss is not
  named.
- The suite depended on test-only environment declarations that were not
  present in the consumer type-check project.
- The untyped trailer-codec dependency made the consumer gate fail on
  environmental typing instead of package API correctness.
- The old fixture still expected stale BTR/provenance APIs and old
  adapter shapes.

## What Changed From Original Plan

- The cycle moved from tracking a release-blocker candidate to repairing
  it directly.
- The old consumer fixture was replaced with a current package-root
  smoke gate instead of being patched line-by-line.
- The repair added test-only declarations for Bun, Deno, and
  trailer-codec rather than changing production code.
- The cycle added Playback and Drift Check audits because replacing a
  broad consumer fixture is a high-risk move.

## What This Cycle Proved

- `npm run typecheck:consumer` can now be used as a current public API
  compile-time smoke gate again.
- The 0102 snapshot public API types are nameable through the package
  root and usable from the consumer fixture.
- The current fixture catches meaningful compile-time misuse such as
  assigning `materialize()` to `string`, passing the wrong identifier
  type, and calling `getEdgeProps` with missing arguments.
- 0103 did not add stale exports to the package root to make the old
  fixture pass.

## What This Cycle Did Not Prove

- It did not prove runtime snapshot immutability. That remains the job
  of conformance tests.
- It did not prove every historical export expectation should return.
- It did not produce release notes or API migration notes.
- It did not survey the whole codebase for structural sludge.
- It did not resume 0096.
- It did not add the anti-sludge pre-commit hook.

## Follow-Up Handling

No new backlog cards were created in this retrospective.

Remaining known debt:

- Release/API notes for 0102 public read-side snapshot return type
  changes.
- 0096 remains blocked by non-0102 cast families.
- Codebase-wide structural sludge has not been surveyed by this cycle.

## Recommendation For Next Cycle

Recommendation: run a doc-only sludge screening and survey before
pulling another v17 implementation ticket.

Reason: the consumer gate is now green, but v17 should be treated as a
cleanliness standard rather than a date. The next useful move is to map
god objects, boundary leaks, fake safety, DI failures, DRY failures, and
other structural sludge before doing more implementation work.
