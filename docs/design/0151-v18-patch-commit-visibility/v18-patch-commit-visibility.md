---
cycle: 0151
task_id: V18_patch_commit_visibility
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-21
completed_at: 2026-05-21
release_home: v18.0.0
---

# V18 Patch Commit Visibility

## Pull

Receipt-family projection depends on the source fact underneath it: a successful
patch commit must mean canonical writer-tip advancement and visible graph truth,
not merely Git object creation.

## Hill

Patch commit success is reported only after the writer ref is atomically
advanced to the returned patch commit and the returned commit is visible through
materialization.

## Playback Questions

Agent:

- Does patch commit use the persistence CAS ref surface for writer-tip
  advancement?
- Does commit reject success when the writer ref does not point at the returned
  commit after CAS?
- Does a successful graph patch become visible through materialization?

Human:

- Can later receipt-family projections trust a returned patch SHA as the
  canonical writer-tip fact?

## Accessibility / Assistive Reading Posture

No user-facing visual surface changes. The contract is asserted through tests
and error codes.

## Localization / Directionality Posture

No localized strings are introduced. Error messages remain developer-facing.

## Agent Inspectability / Explainability Posture

The visibility failure path uses a stable error code so agents can distinguish
object creation from canonical writer-tip visibility.

## Non-Goals

- Do not change checkpoint, strand, or audit ref update behavior.
- Do not project receipt-family values yet.
- Do not rewrite existing patch history.

## RED

Expected failing spec:

```text
npx vitest run test/unit/domain/services/PatchCommitter.visibility.test.ts
```

Observed RED:

```text
expected [] to deeply equal [{ ref, newOid, expectedOid }]
promise resolved instead of rejecting
```

The old path used plain `updateRef()` and did not verify the post-update writer
ref before returning success.

## GREEN

This slice changes patch commit persistence to:

1. create the patch commit object,
2. atomically advance the writer ref with `compareAndSwapRef()`,
3. reread the writer ref,
4. report success only when the writer ref points at the returned commit SHA.

If the post-CAS visibility check fails, the commit path throws
`WriterError` with code `WRITER_COMMIT_NOT_VISIBLE`.

## Playback

Witness:

```text
npx vitest run test/unit/domain/services/PatchCommitter.visibility.test.ts test/unit/domain/services/PatchBuilder.cas.test.ts
Test Files  2 passed (2)
Tests       10 passed (10)

npm run typecheck:src -- --pretty false
npm run typecheck:test -- --pretty false
npm run lint:sludge
npx eslint --no-warn-ignored src/domain/services/PatchCommitter.ts src/domain/errors/WriterError.ts test/unit/domain/services/PatchCommitter.visibility.test.ts test/unit/domain/services/PatchBuilder.cas.test.ts
git diff --check
```

Agent answers:

- Yes, patch commit uses the CAS ref surface for writer-tip advancement.
- Yes, commit rejects success when the writer ref does not point at the
  returned commit after CAS.
- Yes, the successful graph patch test proves materialization-visible graph
  truth.

Human answer:

- Later receipt-family projections can trust a returned patch SHA as canonical
  writer-tip evidence after successful commit.

## SSJS Scorecard

- Runtime-backed forms: green; existing `WriterError` carries the new stable
  visibility code.
- Boundary validation: green; persistence stays behind the ref port.
- Behavior ownership: green; commit visibility is enforced inside the patch
  commit path that owns patch persistence.
- Message parsing: green; no message parsing introduced.
- Ambient time or entropy: green; no ambient time or entropy introduced.
- Fake shape trust or cast-cosplay: green; success is now checked against the
  canonical writer ref instead of inferred from object creation.

## Closeout

This closes BEARING task 7 and gives receipt projection a stronger source fact:
successful patch commit means canonical writer-tip visibility.
