---
cycle: 0158
task_id: V18_warp_ttd_receipt_smoke
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-22
completed_at: 2026-05-22
release_home: v18.0.0
bearing_task: 10
---

# V18 Warp-TTD Receipt Smoke

## Pull

`warp-ttd` needs git-warp facts as generated-family nouns, not handwritten
adapter-local receipt folklore. Once receipt-family projection exists, the next
test is a narrow consumer smoke.

## Hill

Add the first `warp-ttd` smoke over generated-family git-warp receipt facts.

## Playback Questions

- Can `warp-ttd` consume a git-warp receipt-family projection fixture?
- Does the smoke depend on generated-family facts rather than local hand-shaped
  DTOs?
- Does the consumed value preserve evidence posture?
- Is the smoke narrow enough to avoid pulling reading-envelope or
  runtime-boundary work forward?

## Design

Inspect `~/git/warp-ttd` for its minimum receipt input shape. Add a smoke path
that feeds it git-warp receipt-family projection output from slice 9.

The smoke can be one of:

- a fixture exported by git-warp and consumed by a warp-ttd command/test;
- a git-warp-side compatibility test that shells into a warp-ttd fixture
  reader;
- a documented fixture contract if direct cross-repo execution is not stable
  yet.

## Non-Goals

- Do not implement full `warp-ttd` integration.
- Do not add reading-envelope projection.
- Do not make `warp-ttd` a runtime dependency of core git-warp code.

## RED

Observed first:

```text
node --experimental-strip-types test/smoke/warpTtdReceiptFamilyProjectionSmoke.ts
```

The smoke command failed because the script did not exist yet.

## Implementation

Added a standalone smoke script:

```text
test/smoke/warpTtdReceiptFamilyProjectionSmoke.ts
```

The script imports the sibling `warp-ttd` adapter from:

```text
../../../../warp-ttd/src/adapters/gitWarpAdapter.ts
```

It builds a `ContinuumReceiptFamilyProjection` from generated receipt-family
descriptor authority, explicit `translated-git-warp-evidence`, a local
`TickReceipt`, and a `DeliveryObservation`. It rejects a handwritten object
that contains only a local `receipts` array, then feeds the generated-family
projection's receipt facts to `GitWarpAdapter.create()` through a stub graph.

The smoke asserts that `warp-ttd` surfaces the expected receipt summary:

- patch digest preserved;
- writer preserved;
- output tick preserved;
- applied, superseded, and redundant operation counts preserved.

## Verification

- `node --experimental-strip-types test/smoke/warpTtdReceiptFamilyProjectionSmoke.ts`
- `npx vitest run test/unit/domain/continuum/ContinuumReceiptFamilyProjection.test.ts --reporter=verbose`
- `npm run typecheck`
- `npm run lint`
- `npx markdownlint docs/BEARING.md docs/design/0158-v18-warp-ttd-receipt-smoke/v18-warp-ttd-receipt-smoke.md`

## Closeout

The first `warp-ttd` smoke exists without making `warp-ttd` a runtime
dependency of git-warp core. The smoke is intentionally local and explicit: it
requires the sibling repo at `~/git/warp-ttd`, uses generated-family projection
output, and refuses adapter-local receipt DTO folklore.

## SSJS Scorecard

- Runtime-backed forms: green if slice 9 projection is reused.
- Boundary validation: green; cross-repo fixture loading stays at test or
  adapter boundaries.
- Behavior ownership: green; warp-ttd consumes, git-warp provides.
- Message parsing: green.
- Ambient time or entropy: green.
- Fake shape trust or cast-cosplay: green; smoke uses generated-family
  output.
