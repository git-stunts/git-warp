---
id: PROTO_orsetlike-contract
blocked_by:
  - PROTO_orset-seam-in-root
blocks:
  - PROTO_shadow-trie-orset
  - PROTO_state-session-async
---

# Extract ORSetLike contract from concrete ORSet and retype consumers

## Problem

Every consumer of ORSet (Ops, JoinReducer, GCMetrics, CheckpointSerializer,
WarpStateIndexBuilder, DiffCalculator, ReceiptBuilder) is typed against the
concrete `ORSet` class. There is no seam to swap in a trie-backed
implementation.

## Fix

Define an `ORSetLike` abstract class or interface in root (under
the seam layout established by `PROTO_orset-seam-in-root`) that
captures the **synchronous, in-memory** contract: `add`, `remove`,
`contains`, `elements`, `getDots`, `countEntries`, `countLiveDots`,
`countTombstones`, `compact`, `clone`. The existing `ORSet` class
implements this contract. Retype all consumer call sites to accept
`ORSetLike` instead of concrete `ORSet`.

The contract will eventually move into `packages/warp-orset/` via
`INFRA_extract-warp-orset-package-post-publish`. For now, it stays
in root. No cross-package imports.

## Scope

**In:** Contract extraction. Consumer retyping. WarpState field types
change from `ORSet` to `ORSetLike`. All existing tests must pass
unchanged.

**Out:** No async changes. No new ORSet implementations yet.

## Role clarification

`ORSetLike` is the **in-memory seam only**. It captures the synchronous
contract that the existing in-memory `ORSet` satisfies. `ShadowTrieORSet`
does NOT implement `ORSetLike` directly — it is an async, storage-backed
engine that lives behind `StateSession`.

`StateSession` (PROTO_state-session-async) is the true **domain-facing
contract** for trie-backed state access. Domain code (Ops, reducer, GC)
goes through the session's async interface when operating on trie-backed
state. The session may internally use `ORSetLike` for in-memory fallback
or may use `ShadowTrieORSet` directly — that is an implementation detail
behind the session boundary.

This split avoids the contradiction of a synchronous interface promising
to wrap async I/O. The in-memory path stays synchronous. The trie path
stays honestly async. The session is the arbiter.

## Notes

- The contract methods that touch internal state (`.entries`, `.tombstones`)
  must not leak. CheckpointSerializer currently reads these directly and
  must be updated to use contract methods or a serialization protocol.
- This is the foundation seam, but it is NOT the seam that trie-backed
  state uses. That seam is StateSession.
