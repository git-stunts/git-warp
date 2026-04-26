# 0092 Close Uniform Git-CAS

- Outcome: `hill met`
- Cycle doc: [docs/design/0092-close-uniform-git-cas.md](/Users/james/git/git-stunts/git-warp/docs/design/0092-close-uniform-git-cas.md)

## What changed

- removed the stale `INFRA_uniform-git-cas` v17 backlog card
- ratcheted the default Git-backed runtime path so patches,
  checkpoints, indexes, and trust records keep routing payloads through
  git-cas-backed storage
- preserved the explicit carve-outs for legacy raw reads, pointer blobs, and
  native Git trie publication
- refreshed backlog and workload counts

## Drift check

- No storage implementation change was needed. The current default path already
  carries the uniform payload-routing law.
- `INFRA_unify-persistence-on-git-cas` remains live because it is a different
  slice: making `GitGraphAdapter` itself converge on git-cas/plumbing adapter
  surfaces rather than raw command wrappers.

## Witness

- `npx vitest run test/unit/scripts/uniform-git-cas-closeout.test.ts`
- `npm run typecheck`
- `git diff --check`
