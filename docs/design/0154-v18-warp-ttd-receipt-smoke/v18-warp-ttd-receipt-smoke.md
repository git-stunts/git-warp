---
cycle: 0154
task_id: V18_warp_ttd_receipt_smoke
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-21
completed_at: 2026-05-21
release_home: v18.0.0
---

# V18 WARP TTD Receipt Smoke

## Pull

`git-warp` can project `TickReceipt` into Continuum receipt-family facts. The
opening campaign needs one smoke test proving a `warp-ttd` consumer can read
those facts without reverse-engineering raw `TickReceipt` shape.

## Hill

A live git-warp patch receipt can be projected through the generated
receipt-family descriptor into `warp-ttd`-targeted receipt facts with explicit
participant-runtime evidence posture.

## Playback Questions

Agent:

- Does the smoke start from a real committed git-warp patch?
- Does it load the generated receipt-family fixture descriptor instead of a
  handwritten descriptor-only shortcut?
- Does it query projected receipt-family facts by head and frame for a
  `warp-ttd` target?
- Does the projection keep participant-runtime evidence posture explicit?

Human:

- Is this enough proof to stop `warp-ttd` from depending on raw git-warp
  `TickReceipt` folklore for the first receipt shell?

## Accessibility / Assistive Reading Posture

No visual surface changes. The smoke output is structured test evidence.

## Localization / Directionality Posture

No localized strings are introduced.

## Agent Inspectability / Explainability Posture

The smoke keeps artifact descriptor, evidence status, and projected receipts as
separate inspectable facts.

## Non-Goals

- Do not edit the `warp-ttd` repo in this slice.
- Do not add delivery observation projection.
- Do not claim separate Continuum witnesshood.

## RED

Expected failing spec:

```text
npx vitest run test/unit/domain/continuum/WarpTtdReceiptFamilySmoke.test.ts
```

Observed result:

```text
Test Files  1 passed (1)
Tests       1 passed (1)
```

This smoke became green immediately because slice 9 had already added the
receipt-family projection surface.

## GREEN

The smoke:

1. opens a real in-memory git-warp runtime;
2. commits a real patch;
3. materializes real `TickReceipt` output;
4. loads the generated receipt-family fixture descriptor through
   `ContinuumArtifactJsonFileAdapter`;
5. projects the materialized receipts into `ContinuumReceiptFamilyProjection`;
6. queries `receiptsForHead()` for the winning patch SHA and frame;
7. asserts the evidence posture remains participant-runtime evidence, not
   Continuum-witnessed evidence.

## Playback

Witness:

```text
npx vitest run test/unit/domain/continuum/WarpTtdReceiptFamilySmoke.test.ts test/unit/domain/continuum/ContinuumReceiptProjection.test.ts test/unit/domain/continuum/ContinuumEvidenceStatus.test.ts test/unit/infrastructure/adapters/ContinuumArtifactJsonFileAdapter.test.ts
Test Files  4 passed (4)
Tests       24 passed (24)

npm run typecheck:test -- --pretty false
npx eslint --no-warn-ignored test/unit/domain/continuum/WarpTtdReceiptFamilySmoke.test.ts
```

Agent answers:

- Yes, the smoke starts from a real committed git-warp patch.
- Yes, it loads the generated receipt-family fixture descriptor through the
  artifact adapter.
- Yes, it queries projected receipt-family facts by head and frame for a
  `warp-ttd` target.
- Yes, participant-runtime evidence posture remains explicit.

Human answer:

- This is enough first proof to stop `warp-ttd` from needing raw git-warp
  `TickReceipt` folklore for the first receipt shell.

## SSJS Scorecard

- Runtime-backed forms: green; the smoke uses the runtime-backed projection
  classes from slice 9.
- Boundary validation: green; generated fixture JSON is admitted through the
  adapter seam.
- Behavior ownership: green; `git-warp` owns its receipt projection and
  `warp-ttd` remains a consumer target.
- Message parsing: green; no behavior branches parse messages.
- Ambient time or entropy: green; no ambient time or entropy introduced.
- Fake shape trust or cast-cosplay: green; the projection remains
  participant-runtime evidence and does not claim separate witnesshood.

## Closeout

This closes BEARING task 10 and completes the requested five-slice batch.
