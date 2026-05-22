---
cycle: 0152
task_id: V18_same_writer_race_witness
status: Complete
sponsors:
  human: James
  agent: Codex
completed_at: 2026-05-21
---

# Retro: V18 Same-Writer Race Witness

## Hill

A same-writer concurrent patch race has a regression witness proving exactly
one stale builder wins, the final writer frontier names the winning commit, and
only the winning patch is visible after materialization.

## Result

Hill met.

## Witness

```text
npx vitest run test/unit/domain/WarpGraph.sameWriterRace.test.ts test/unit/domain/services/PatchCommitter.visibility.test.ts
Test Files  2 passed (2)
Tests       4 passed (4)

npm run typecheck:test -- --pretty false
npx eslint --no-warn-ignored test/unit/domain/WarpGraph.sameWriterRace.test.ts
```

## Drift Check

No drift. This was intentionally a witness slice. It did not alter runtime code
after the slice 7 CAS visibility hardening.

## What Mess We Got Into

Before projecting receipts, we needed to prove stale same-writer builders do
not both become canonical history just because both can create patch objects.

## What Mess We Got Out Of

The new witness pins the final frontier and the visible graph state. One stale
builder wins; the losing builder is not graph truth.

## What Comes Next

Project `TickReceipt` facts into Continuum receipt-family `Receipt` facts with
translated git-warp evidence posture.
