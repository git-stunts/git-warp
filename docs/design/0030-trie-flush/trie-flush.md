---
title: "Bottom-up flush of dirty trie pages to Git"
legend: "PROTO"
cycle: "0030-trie-flush"
source_backlog: "docs/method/backlog/v17.0.0/PROTO_trie-flush.md"
---

# Bottom-up flush of dirty trie pages to Git

Source backlog item (absorbed into this doc):
`docs/method/backlog/v17.0.0/PROTO_trie-flush.md`
Legend: PROTO

## Sponsors

- Human: Backlog operator
- Agent: Implementation agent

## Hill

`TrieFlusher` consumes a `DirtyPageSet` (cycle 0029), walks it
bottom-up, writes each dirty leaf and dirty branch to
`TrieStorePort`, replaces pending child OIDs with the freshly
assigned real OIDs, and returns a `FlushResult` carrying the new
root OID and write counts. Structural sharing is preserved via
`cleanChildOidAt` recorded by the cursor during descent. Empty
input returns the incoming root OID with zero writes.

## Playback Questions

### Human

- [ ] Can a reader open a fresh cursor at the flusher's returned
      root and find the same elements the source cursor wrote?
- [ ] Does the flusher leave the store in a consistent shape
      that `git cat-file` and `git ls-tree` can walk natively?

### Agent

- [ ] Does `flush(emptySnapshot)` return the incoming root OID
      with zero writes?
- [ ] Does `flush` walk the dirty set bottom-up, so every
      parent's children are persisted before the parent?
- [ ] Do sibling subtrees the cursor did not modify reuse their
      original OIDs (structural sharing)?
- [ ] Does `flush` produce a real root OID when the source trie
      was empty (`rootOid === null`)?
- [ ] Do store failures bubble as `TrieFlushError` with typed
      codes, carrying the offending path?
- [ ] Are writes sequential (no implicit fan-out), per the port
      contract?

## Accessibility and Assistive Reading

- Linear truth / reduced-complexity posture: a single class with
  one public method (`flush`) and a `FlushResult` return type.
  Internal state is an `OidByPath` map — one entry per dirty
  path. No callbacks, no streams.
- Non-visual or alternate-reading expectations: none. Error
  messages name the path and operation.

## Localization and Directionality

- None. All identifiers are ASCII; path keys are hex nibble
  strings joined by `/`.

## Agent Inspectability and Explainability

- Deterministic traversal: `DirtyPageSet.enumerateBottomUp()`
  yields in deepest-first, nibble-ascending-tie order. Two
  flushes of the same snapshot produce the same OIDs through
  the content-addressed store.
- Failure envelope: every failure is a `TrieFlushError` with a
  typed code and a `context.path` string identifying the last
  dirty path the flusher was working on.

## Non-goals

- [ ] No checkpoint commit creation. That is
      `PROTO_checkpoint-envelope-publication`.
- [ ] No ref updates. The flusher writes objects; wrapping them
      in a commit is a later concern.
- [ ] No partial-flush recovery. Retries are the caller's job.
- [ ] No implicit concurrency. Writes are sequential because the
      port contract does not promise concurrency safety.
- [ ] No merge logic (lives with `PROTO_trie-compaction`).
- [ ] No fanning out of writes to multiple stores.

## Backlog Context

## Problem

After mutations, the cursor holds a set of dirty pages that must
be persisted. Modified leaves become new Git blobs, modified
branches become new Git trees, and a new root OID is produced.
Without a flusher, cycle 0029's cursor output cannot reach the
store.

## Fix

Implement `TrieFlusher` in `src/domain/orset/trie/`:

```typescript
class TrieFlusher {
  constructor(fields: {
    readonly store: TrieStorePort;
    readonly codec: CodecPort;
  });

  async flush(dirty: DirtyPageSet): Promise<FlushResult>;
}

class FlushResult {
  constructor(fields: {
    readonly rootOid: string | null;
    readonly blobsWritten: number;
    readonly treesWritten: number;
    readonly bytesWritten: number;
  });
  readonly rootOid: string | null;
  readonly blobsWritten: number;
  readonly treesWritten: number;
  readonly bytesWritten: number;
}
```

### Flush algorithm

Deterministic, bottom-up:

1. `dirty.enumerateBottomUp()` yields leaves and branches with
   paths, deepest-first.
2. For each **leaf**: serialize via codec, call
   `store.writeLeaf(bytes)`, remember `path-key → newOid`.
3. For each **branch**: build `TrieBranchEntries` by iterating
   child nibbles — for each child, use:
   - the freshly-written OID (from this flush's own output map)
   - or `dirty.cleanChildOidAt(childPath)` (structural sharing)
   - or (fallback) the branch's own stored child OID if it is
     not a pending sentinel and not in either map. This falls
     back to the incoming branch's entries when the cursor
     neither modified nor recorded-as-clean that subtree, which
     can happen if a parent branch was rewritten for some OTHER
     nibble.
4. Call `store.writeBranch(entries)` and remember the new OID.
5. Return `FlushResult` with the root's new OID (or the prior
   `rootOid` if `dirty.isEmpty()`).

### Edge cases

- **Empty flush** — `dirty.isEmpty()` short-circuits: return
  incoming rootOid, zero writes, zero bytes.
- **Single leaf** — first write is a blob, then the root branch
  carrying that blob's OID.
- **Deep mutation** — every ancestor branch is rewritten with
  updated child OIDs; sibling subtrees at each level keep their
  clean OIDs.
- **Empty root** (rootOid was null) — enumeration still yields
  the newly-created root branch; the flusher persists it and
  returns its fresh OID.
- **Pending-OID resolution** — every pending sentinel the cursor
  inserted into a branch must be replaced before the branch is
  written. If a pending path has no matching freshly-written OID
  and no clean-child entry, the flusher raises
  `E_TRIE_FLUSH_UNRESOLVED` with the offending path. This is a
  structural bug, not an expected failure.

### Error surface

`TrieFlushError` — new class, own file, extends `WarpError`:

| Code | Meaning |
|------|---------|
| `E_TRIE_FLUSH_STORE` | A store read or write failed during flush. |
| `E_TRIE_FLUSH_ENCODE` | A leaf could not be serialized through the codec. |
| `E_TRIE_FLUSH_UNRESOLVED` | A pending child OID could not be resolved to a real OID after walking the dirty set. |
| `E_TRIE_FLUSH_STRUCTURE` | The dirty set has a shape the flusher does not expect (e.g. a dirty path references a missing child). |

Default code is `E_TRIE_FLUSH_STORE` — matches the cursor/port
conventions.

## Scope

**In:**

- `src/domain/orset/trie/TrieFlusher.ts`.
- `src/domain/orset/trie/FlushResult.ts`.
- `src/domain/errors/TrieFlushError.ts`.
- Unit tests at `test/unit/domain/orset/trie/TrieFlusher.test.ts`
  using the `InMemoryTrieStore` from `test/helpers/trieHelpers.ts`.
- Integration test at
  `test/integration/domain/orset/trie/TrieCursor.flush.integration.test.ts`
  — real-git round trip through `GitTrieStoreAdapter`: cursor
  adds entries, flusher persists, fresh cursor reopens at the
  new root and verifies all entries remain.
- Seam README updated.

**Out:**

- No checkpoint commit creation, ref updates, or CAS routing.
- No LRU cache.
- No compaction / merge logic.
- No modifications to existing cursor or port surfaces beyond
  JSDoc cross-references.

## Notes

- Consumer of: `DirtyPageSet`, `TrieStorePort`, `CodecPort`,
  `TrieLeaf` (for `serialize`), `TrieBranch` (for `entries`).
- Writes are sequential. No concurrent `await` inside the flush
  loop.
- All state flows through `DirtyPageSet` input and `FlushResult`
  output. No mutable side channels.
- Pending child OIDs encoded by the cursor follow the format
  `pending:<path-key>`. The flusher recognises this prefix and
  rejects branches whose entries still carry it after the
  lookup pass.

## Downstream effects

- **`PROTO_checkpoint-envelope-publication`** — unblocked on
  the trie-root side. The envelope tree can reference a real
  `FlushResult.rootOid`.
- **`PROTO_shadow-trie-orset`** — unblocked. `StateSession` can
  close by flushing the cursor's snapshot and persisting the
  returned root.
- **`PROTO_state-session-async`** — advances. The async session
  lifecycle can wire `open() → mutate → flush() → close()`.
