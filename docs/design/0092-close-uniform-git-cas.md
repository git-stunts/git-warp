---
title: "Close uniform git-cas"
cycle: "0092-close-uniform-git-cas"
---

# Close Uniform Git-CAS

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

`INFRA_uniform-git-cas` names a substrate law that is already true for the
default Git-backed runtime path:

- `GitGraphAdapter` creates `CasBlobAdapter` and defaults new patch writes to
  `git-cas`.
- `RuntimeHostBoot` resolves one runtime blob-storage surface and passes it to
  patch, checkpoint, and index adapters.
- checkpoint and index adapters write payloads through `writePayloadBlob()`,
  which stores payload bytes through `BlobStoragePort` when configured and
  keeps legacy raw blob reads as fallback.
- trust records persist through `GitTrustChainAdapter`, which stores record
  payloads via `@git-stunts/git-cas`.
- core trie publication remains native Git by design; it is not part of the
  git-cas unification law.

The remaining live card makes this shipped substrate law look like open v17
work. That obscures the real remaining item: `INFRA_unify-persistence-on-git-cas`,
which is about making `GitGraphAdapter` itself a thinner wrapper over git-cas
plumbing, not about payload routing.

## Hill

The stale `INFRA_uniform-git-cas` card is removed from the live v17 queue, and
the repo gains a ratchet that preserves the uniform payload-routing law while
documenting the allowed exceptions:

- legacy raw blobs may still be read
- pointer blobs may still be written so Git trees can reference CAS payloads
- core trie objects stay native Git for reachability

## Playback questions

### Agent

- Does `GitGraphAdapter` still provide `CasBlobAdapter` and default new patch
  writes to `git-cas`?
- Does runtime boot still pass resolved blob storage to patch, checkpoint, and
  index adapters?
- Do checkpoint and index adapters still use the CAS payload-pointer helpers?
- Does trust-chain persistence still use git-cas for record payloads?
- Is `INFRA_uniform-git-cas.md` removed from the live v17 lane?
- Are workload and backlog counts updated after removing the stale card?

### Human

- If I inspect the release ledger, is it clear that uniform payload routing is
  shipped and that the remaining CAS item is the broader persistence-adapter
  convergence?

## Test plan

### Witness

- `npx vitest run test/unit/scripts/uniform-git-cas-closeout.test.ts`
- `npm run typecheck`
- `git diff --check`

## Playback

### Verdict

`hill met`
