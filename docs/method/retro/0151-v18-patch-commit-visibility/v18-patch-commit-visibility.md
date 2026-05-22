---
cycle: 0151
task_id: V18_patch_commit_visibility
status: Complete
sponsors:
  human: James
  agent: Codex
completed_at: 2026-05-21
---

# Retro: V18 Patch Commit Visibility

## Hill

Patch commit success is reported only after the writer ref is atomically
advanced to the returned patch commit and the returned commit is visible through
materialization.

## Result

Hill met.

## Witness

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

## Drift Check

No drift. The slice stayed on patch commit success semantics and did not touch
checkpoint, audit, strand, or receipt projection behavior.

## What Mess We Got Into

Patch commit had the right preflight CAS check but then used non-CAS ref update
for the final writer-tip move. It also treated object creation as enough for
success.

## What Mess We Got Out Of

The final ref move is now CAS-backed and success requires the writer ref to
name the returned commit. If the ref is not visible, the error code says so.

## What Comes Next

Use this stronger commit contract to test same-writer concurrent patch races:
only one stale concurrent builder may win, and only the winning patch may become
visible graph truth.
