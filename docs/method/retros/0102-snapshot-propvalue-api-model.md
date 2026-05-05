# 0102 Snapshot PropValue API Model Retrospective

- Outcome: `hill met for focused snapshot API model`
- Cycle doc: [docs/design/0102-snapshot-propvalue-api-model.md](../../design/0102-snapshot-propvalue-api-model.md)
- Release lane: `v17.0.0`

## Outcome

0102 is hill met for the focused snapshot public API model.

It split storage `PropValue` from public read-side
`SnapshotPropValue`, introduced runtime-backed immutable byte snapshot
values, replaced live-looking public snapshot fields with read-side
views, and made public immutable snapshot APIs return
`SnapshotWarpState` instead of storage `WarpState`.

Broader release readiness is not met while `npm run typecheck:consumer`
remains red. That suite is tracked as a release-blocker candidate by
`docs/method/backlog/bad-code/API_consumer-typecheck-suite-red.md`.

## What Went Well

- Storage `PropValue` and snapshot `SnapshotPropValue` were split.
- Public read-side APIs now return `SnapshotWarpState`.
- Byte-valued snapshot properties use `ImmutableBytes`.
- Live CRDT surfaces were replaced with snapshot read-side views:
  `SnapshotORSet` and `SnapshotVersionVector`.
- Focused public API conformance was added for the new snapshot return
  types.
- Ignored ESLint files were manually scanned for the checked sludge
  patterns.
- The broad consumer-suite failure was tracked instead of hand-waved.

## What Went Wrong

- The cycle got large. The API model touched materialization, query,
  state readers, observers, public exports, consumer fixtures, and
  conformance tests.
- Earlier GREEN attempts wandered into fake immutability, proxy-backed
  typed-array behavior, and test-gaming before correction.
- Public API fallout was larger than expected because honest snapshot
  values forced return-type changes beyond byte values.
- `npm run typecheck:consumer` being red reduced confidence and required
  focused conformance plus a separate blocker card.
- Backlog counts did not meaningfully go down because the cycle found
  deeper prerequisite work instead of closing many cards.

## What Changed From Original Plan

- `SnapshotPropertyBag` was downgraded from a required noun to an
  unnecessary named wrapper.
- `SnapshotORSet` and `SnapshotVersionVector` became MUST concepts after
  the public field type-surface audit showed live CRDT types exposed
  mutators.
- Public package exports had to be made deliberate because public APIs
  now return snapshot runtime classes and snapshot value types.
- `PropValue` also had to be exported because package-root helper APIs
  accept storage property values and should not use `unknown`.
- A new consumer-suite blocker card was created:
  `API_consumer-typecheck-suite-red`.

## What This Cycle Proved

- Public immutable snapshot bytes need a real runtime value,
  `ImmutableBytes`, not `Uint8Array` with fake readonly typing.
- Storage `PropValue` and public `SnapshotPropValue` are different
  concepts.
- `WarpState` cannot honestly be the public immutable snapshot return
  type once snapshot values differ from storage values.
- Public snapshot OR-set and version-vector fields need read-side views
  instead of frozen live CRDT objects with mutator APIs.
- Focused conformance can prove the new snapshot public API surface even
  while the broad consumer suite remains red for unrelated debt.

## What This Cycle Did Not Prove

- It did not prove the broad consumer type-check suite is release-ready.
- It did not produce release notes or API migration notes.
- It did not eliminate non-0102 0096 cast families.
- It did not change content byte APIs.
- It did not prove snapshot view allocation behavior is optimal.
- It did not make generic snapshot protocol work desirable or required.

## Why 0096 Remains Blocked

0096 remains blocked because 0102 repaired the immutable snapshot value
model only. Non-0102 cast families remain outside this cycle.

Known remaining 0096-adjacent blocker families include materialized-view
storage seams and other non-snapshot cast families already identified by
the cast quarantine work. They should be pulled as root-cause mini-cycles,
not resumed as one broad 0096 blob.

## Follow-Up Handling

Active follow-up:

- `docs/method/backlog/bad-code/API_consumer-typecheck-suite-red.md`

That card remains active and should be considered before release. The
broad consumer type-check suite is still red and is a release-blocker
candidate, not harmless background noise.

Deferred but not carded here:

- Release/API notes for public immutable read-side return type changes.
- Non-0102 0096 cast blockers.

No additional backlog cards were created in this retrospective. The
known serious new debt is already tracked by
`API_consumer-typecheck-suite-red`.

## Recommendation For Next Cycle

Recommendation: pull `API_consumer-typecheck-suite-red` next if release
readiness matters most.

Reason: 0102 changed public return types, and focused conformance covers
this slice, but the broad consumer type-check suite remains red. Before
release, the public API surface needs a green consumer gate or an
explicit release decision about what that suite is allowed to prove.

Alternative next cycles:

- Continue 0096 only by pulling the next root-cause cast family, not the
  whole blob.
- Add the staged anti-sludge/pre-commit hook as a tooling hardening
  slice if process hardening is more urgent than release readiness.
