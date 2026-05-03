---
id: PROTO_v17-tail-budget-semantics
feature: v17-optics-checkpoint-tail
blocked_by:
  - 0117-v17-plumber-recovery-contract
  - PROTO_v17-optic-error-contract
blocks: []
---

# v17 Tail Budget Semantics

**Effort:** S

## Hill

Define what checkpoint-tail optic scan budgets mean and how callers may
respond when they are exceeded.

## Problem

The current implementation has `maxTailPatches`. That is a real bound, but it
is not yet a full budget contract. The v17 plan also names `maxTailBytes` and
`maxTailMs`, and their semantics are still undefined.

Without a contract, future code can turn budgets into magic numbers, ambient
performance guesses, or adaptive retry behavior that changes read meaning.

## Must Define

- `maxTailPatches`
- `maxTailBytes`
- `maxTailMs`
- whether each budget is deterministic, operational, or host-local
- default budget source
- caller override shape
- error context fields when a budget is exceeded
- relationship to `plumber.optic.retryWithExtendedBudget`
- relationship to `plumber.checkpoint.createIndexedBasis`

## Must Answer

- Are budgets caller-controlled?
- Which budgets are stable across runtimes?
- Is `maxTailMs` allowed in deterministic core logic, or only adapters?
- Does exceeding budget always fail closed?
- May a caller retry with a larger budget without changing read identity?
- When should callers create a checkpoint instead of retrying?

## Acceptance

- `maxTailPatches`, `maxTailBytes`, and `maxTailMs` are each defined.
- The design distinguishes deterministic bounds from host-local operational
  limits.
- Exceeded-budget errors have stable context fields.
- Adaptive retry is explicit and caller-owned.
- No bounded optic read silently increases its own budget.

## Non-Goals

- No implementation.
- No performance benchmark.
- No RSS acceptance recalibration.
- No hidden materialization fallback.
- No CAS slice cache.
- No Roaring implementation.
