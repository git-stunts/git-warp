---
id: PROTO_orsetlike-contract
blocked_by:
  - INFRA_extract-warp-orset-package
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

Define an `ORSetLike` abstract class or interface in `warp-orset` that
captures the contract used by all current consumers: `add`, `remove`,
`contains`, `elements`, `getDots`, `countEntries`, `countLiveDots`,
`countTombstones`, `compact`, `clone`. The existing `ORSet` class
implements this contract. Retype all consumer call sites to accept
`ORSetLike` instead of concrete `ORSet`.

## Scope

**In:** Contract extraction. Consumer retyping. WarpState field types
change from `ORSet` to `ORSetLike`. All existing tests must pass
unchanged.

**Out:** No async changes yet. No new ORSet implementations. The
contract is the seam; the async boundary comes later in
PROTO_state-session-async.

## Notes

- The contract methods that touch internal state (`.entries`, `.tombstones`)
  must not leak. CheckpointSerializer currently reads these directly and
  must be updated to use contract methods or a serialization protocol.
- This is the foundation that lets ShadowTrieORSet slide in without
  changing callers.
