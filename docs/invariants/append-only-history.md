# Append-Only History

## What must remain true?

Git history is never rewritten. No rebase, no force push, no amend.
Patch commits, once written, are immutable. Writer refs advance only
by appending new commits.

## Why does it matter?

Paper III defines the Boundary Transition Record (BTR) as a
tamper-evident package binding content hashes, payload, and
authentication tags. The security model assumes append-only storage:
any modification to a historical commit is detectable because it
changes the content hash, breaking the chain. Git's content-addressed
commit DAG provides exactly this property -- but only if history is
never rewritten.

In git-warp, graph state IS Git commits. Rewriting history does not
just lose code review context -- it destroys user data. A force push
that removes a writer's patch chain erases graph nodes and edges from
that writer's contribution. An amend that changes a patch commit
silently corrupts the CRDT state because other writers may have
already observed the original commit's SHA in their version vectors.

## Paper grounding

- **Paper III, Definition 3.6** (Boundary Transition Record): the
  authentication tag `kappa` binds `(h_in, U_0, P, h_out, t)` so
  that any modification is detectable.
- **Paper III, Section 5.2** (Security posture): payloads are
  tamper-evident when tick patches are content-addressed and
  authentication binds the patch order.
- **Paper III, Proposition 3.7** (Prefix-deduplicated branching):
  under content-addressed storage, shared prefixes are stored once --
  but only if commits are never mutated.

## How the codebase upholds it

- Writer refs advance via compare-and-swap (CAS) in
  `GitGraphAdapter`. CAS ensures refs only advance forward.
- `CLAUDE.md` and `.claude/CLAUDE.md` explicitly forbid `git rebase`,
  `git commit --amend`, `git push --force`, `git reset --hard`,
  `git clean -f`, and all other history-rewriting operations.
- Git hooks in `scripts/hooks/` enforce lint and test gates but do
  not perform history manipulation.
- The `verify-audit` CLI command walks the commit DAG and verifies
  hash chain integrity.

## How do you check?

1. **CI discipline**: The GitHub Actions workflow never uses
   `--force`, `--amend`, or `rebase`. Verify:
   ```bash
   grep -r "force\|amend\|rebase" .github/workflows/ --include="*.yml"
   ```
   Must return zero hits on git operations.

2. **CAS enforcement**: `GitGraphAdapter` uses compare-and-swap for
   ref updates. Grep for the CAS pattern:
   ```bash
   grep -n "compareAndSwap\|cas\|update-ref" src/infrastructure/adapters/GitGraphAdapter.js
   ```

3. **Audit verification**: `git warp verify-audit` walks the full
   commit chain and verifies content hashes. If any commit was
   tampered with, verification fails.

4. **Process gate**: `CLAUDE.md` Git Rules section is the
   human-readable enforcement. Code review must reject any PR that
   introduces history rewriting.
