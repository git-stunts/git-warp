---
title: "Close ORSetLike contract"
cycle: "0091-close-orsetlike-contract"
---

# Close ORSetLike Contract

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

`PROTO_orsetlike-contract` is no longer valid v17 implementation work.
Cycle `0023` rejected the `ORSetLike` abstraction as sludge, cycle `0024`
landed the concrete `ORSet` encapsulation methods that mattered, and cycle
`0032` proved current `src/` truth has no `ORSetLike` symbol or need for one.

Leaving the source backlog card open now corrupts the dependency graph: the
post-publish `warp-orset` extraction card still names `PROTO_orsetlike-contract`
as a prerequisite even though the truthful seam is concrete `ORSet` for the
synchronous in-memory form and `StateSession` over `ShadowTrieORSet` for the
async trie-backed form.

## Hill

The stale `PROTO_orsetlike-contract` card is removed from the live v17 queue,
the remaining live dependency edge to it is deleted, and the docs ratchet the
current noun law: no fake `ORSetLike`; concrete `ORSet`, `StateSession`, and
internal `ShadowTrieORSet`.

## Playback questions

### Agent

- Is `PROTO_orsetlike-contract.md` deleted from the live v17 lane?
- Does `src/**/*.ts` still avoid defining or importing `ORSetLike`?
- Does `INFRA_extract-warp-orset-package-post-publish` no longer depend on
  `PROTO_orsetlike-contract`?
- Does the v17 release ledger show the card as retired/invalid rather than
  open implementation work?
- Do workload and backlog counts reflect the removed live card?

### Human

- If I inspect the ORSet lane, does it now teach the real seam model without
  inviting a future agent to reintroduce `*Like` sludge?

## Test plan

### Witness

- `npx vitest run test/unit/scripts/orsetlike-contract-closeout.test.ts`
- `npm run typecheck`
- `git diff --check`

## Playback

### Verdict

`hill met`
