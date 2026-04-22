---
id: PROTO_orsetlike-contract
blocked_by: []
blocks:
  - PROTO_shadow-trie-orset
  - PROTO_state-session-async
  - INFRA_extract-warp-orset-package-post-publish
feature: trie-state-storage
---

# Extract ORSetLike contract and retype consumers

## Problem

Consumers still type directly against the concrete in-memory `ORSet`
class, and several paths still reach into representation details. That
prevents a clean seam between the synchronous in-memory ORSet and the
future async trie-backed state session.

## Fix

- introduce `ORSetLike` as the synchronous in-memory seam
- make `ORSet` implement or extend that contract
- retype consumers to the contract instead of the concrete class
- eliminate direct representation leaks in non-owning code

## Scope

**In:** contract extraction, consumer retyping, and replacing direct
field leaks with real contract methods.

**Out:** async `StateSession`, `ShadowTrieORSet`, and package
extraction.

## Why it matters

`ShadowTrieORSet` does not implement `ORSetLike`; it sits behind
`StateSession`. This contract is the clean border that lets the repo
keep the sync in-memory seam honest while the async trie line lands.
