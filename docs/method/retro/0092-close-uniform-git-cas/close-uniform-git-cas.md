# 0092 Close Uniform Git-CAS

- Outcome: `hill met`
- Cycle doc: [docs/design/0092-close-uniform-git-cas.md](/Users/james/git/git-stunts/git-warp/docs/design/0092-close-uniform-git-cas.md)

## What changed

- removed the stale `INFRA_uniform-git-cas` v17 backlog card
- ratcheted the default Git-backed runtime path so patches,
  checkpoints, indexes, and trust records keep routing payloads through
  git-cas-backed storage
- preserved the explicit carve-outs for pointer blobs and native Git trie
  publication
- clarified that old raw-substrate readers belong in `scripts/migrations/`,
  exposed through `npm run upgrade`, not as permanent mainline runtime branches
- refreshed backlog and workload counts

## Drift check

- No storage implementation change was needed. The current default path already
  carries the uniform payload-routing law.
- `INFRA_unify-persistence-on-git-cas` remains live because it is a different
  slice: making `GitGraphAdapter` itself converge on git-cas/plumbing adapter
  surfaces rather than raw command wrappers.
- `INFRA_substrate-upgrade-tool` remains live and now owns deleting raw
  compatibility branches from `src/` after the upgrader can carry those readers.

## Witness

- `npx vitest run test/unit/scripts/uniform-git-cas-closeout.test.ts`
- `npm run typecheck`
- `git diff --check`
