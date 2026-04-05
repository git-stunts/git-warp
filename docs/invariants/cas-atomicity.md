# CAS Atomicity

## What must remain true?

Every writer ref update uses compare-and-swap (CAS): the update
succeeds only if the ref still points to the expected previous commit.
If another process advanced the ref, the update fails and must be
retried. No ref update ever overwrites an unseen commit.

## Why does it matter?

Paper II's tick semantics (Definition 4.2, Remark 4.3) treats each
tick as an atomic commit: either all selected rewrites succeed and
the committed successor is observed, or the state is unchanged. In
git-warp, a "tick" is a `PatchBuilderV2.commit()` call that creates
a Git commit and advances the writer's ref. CAS is the mechanism that
makes this atomic in a concurrent environment.

Without CAS, two concurrent `commit()` calls from processes sharing
a writer could race: both read the same parent ref, both create
commits, and one silently overwrites the other's commit. This loses a
patch, breaking the provenance chain and violating backward
provenance completeness.

OG-4's suffix transport (Definition 8) requires that each writer's
spine is a linear sequence of accepted events. CAS ensures linearity:
every commit has exactly one parent (the previous tip), creating an
unbranched chain per writer.

## Paper grounding

- **Paper II, Remark 4.3** (Atomicity and failure): a tick is an
  atomic commit; either all selected rewrites succeed or the state
  is unchanged.
- **Paper III, Definition 3.1** (Tick patch and Apply): `U_{i+1} =
  Apply(U_i, mu_i)` -- each successor state is uniquely determined
  by the current state and the patch.
- **OG-4, Definition 1** (The Accepted Spine): the spine is a linear
  sequence of events representing the replica's local chronology.

## How the codebase upholds it

- `GitGraphAdapter.updateRef()` uses Git's `update-ref` with the
  expected old value, implementing CAS.
- `PatchBuilderV2.commit()` and `Writer.commit()` both go through
  this CAS path.
- `@git-stunts/alfred` provides retry with exponential backoff for
  CAS failures, ensuring transient conflicts resolve without data
  loss.
- The `InMemoryGraphAdapter` (used in tests) also implements CAS
  semantics for ref updates.

## How do you check?

1. **CAS implementation audit**:
   ```bash
   grep -n "update-ref\|updateRef\|compareAndSwap" src/infrastructure/adapters/GitGraphAdapter.js
   ```
   Every ref update must pass the expected old value.

2. **Concurrent write test**: Spawn two writers targeting the same
   writerId (simulating a race). One commit must succeed and the
   other must fail with a CAS error. Verify no commits are lost.
   Covered by `PatchSession` and `Writer` tests.

3. **Linear chain verification**: After multiple commits, walk the
   writer's ref chain. Every commit must have exactly one parent
   (except the first commit). No forks in the per-writer chain:
   ```bash
   git log --format="%H %P" refs/warp/<graph>/writers/<writerId>
   ```
   Each line must have exactly one parent hash.
