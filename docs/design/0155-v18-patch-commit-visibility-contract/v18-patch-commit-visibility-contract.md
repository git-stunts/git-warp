---
cycle: 0155
task_id: V18_patch_commit_visibility_contract
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-22
completed_at: 2026-05-22
release_home: v18.0.0
bearing_task: 7
---

# V18 Patch Commit Visibility Contract

## Pull

Continuum compatibility rests on witnessed causal history. For git-warp, a
patch is not graph truth merely because a Git object exists. It becomes graph
truth when the writer's canonical ref advances and the graph can observe that
patch through normal materialization.

## Hill

Define and test the patch commit success contract:

- the patch object is written;
- the canonical writer tip advances;
- reopening or materializing the graph sees the patch;
- failures between object creation and writer-tip advancement do not report
  success.

## Playback Questions

- What is the smallest observable proof that a patch write became graph truth?
- Does the write path distinguish object creation from writer-tip advancement?
- Can a hidden orphan object be misreported as a successful graph write?
- Does a reopen/materialize round trip prove visibility?

## Design

Add a focused contract around the existing Git-backed write path. The contract
should be expressed as tests first, then implemented with the smallest adapter
or domain change needed to make the tests true.

Expected behavior:

1. Successful patch write returns only after writer-tip advancement.
2. If object creation succeeds but ref advancement fails, the operation fails.
3. A successful write is visible through normal graph reads after reopening.
4. The failure path uses existing typed error conventions.

## Non-Goals

- Do not redesign the patch format.
- Do not change the writer-ref namespace.
- Do not add same-writer race coverage here; that is slice 8.

## RED

Observed first:

```text
npx vitest run test/unit/domain/services/PatchCommitter.visibility.test.ts --reporter=verbose
```

The new contract test failed because `commitPatch()` resolved the new commit
SHA after `updateRef()` resolved, even though a subsequent `readRef()` still
returned `null`.

The first test attempt also exposed a malformed type-only import in the new
test file; that was corrected before counting the behavioral RED.

## Implementation

`commitPatch()` now verifies writer-ref visibility immediately after
`updateRef()`. Success is reported only when a fresh `readRef(writerRef)` equals
the newly created commit SHA. If the ref remains missing or points elsewhere,
the operation raises `PersistenceError.E_REF_IO` and does not run
`onCommitSuccess`.

The writer-invalidation mock persistence was updated to model the same
contract: reads before `updateRef()` return the old head, and reads after a
successful update return the new head.

## Verification

- `npx vitest run test/unit/domain/services/PatchCommitter.visibility.test.ts --reporter=verbose`
- `npx vitest run test/unit/domain/services/PatchCommitter.visibility.test.ts test/unit/domain/WarpGraph.noCoordination.test.js test/unit/domain/WarpGraph.writerInvalidation.test.ts --reporter=verbose`
- `npm run typecheck`
- `npm run lint`
- `npx markdownlint docs/BEARING.md docs/design/0155-v18-patch-commit-visibility-contract/v18-patch-commit-visibility-contract.md`

## Closeout

Patch commit success is no longer object creation folklore. The commit path now
requires the canonical writer tip to be observable before handing success to
callers or eager materialization hooks.

## SSJS Scorecard

- Runtime-backed forms: use existing patch/ref concepts unless a real missing
  concept appears.
- Boundary validation: green; Git object/ref errors remain adapter boundary
  facts.
- Behavior ownership: green; success belongs to the write path, not tests.
- Message parsing: green.
- Ambient time or entropy: green.
- Fake shape trust or cast-cosplay: green; success is observable at the writer
  ref.
