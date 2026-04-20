---
title: "Bounded LRU page cache for deserialized trie pages"
cycle: "0031-lru-page-cache"
design_doc: "docs/design/0031-lru-page-cache/lru-page-cache.md"
outcome: hill-met
drift_check: yes
---

# Cycle 0031 Retro — LRU Page Cache

**Status:** HILL MET

## Hill

`PageCache` exists as a bounded in-memory LRU over persisted
`TrieLeaf` and `TrieBranch` objects keyed by real OIDs. `TrieCursor`
consults it on read paths, stores successful page resolutions back
into it, and leaves dirty working pages outside the cache. Cache
ownership is explicit: every `TrieCursor` receives a `PageCache` by
constructor injection; no hidden default cache remains.

## What ground was taken

### Code

- `src/domain/orset/trie/PageCache.ts` — count-bounded LRU over
  runtime page objects with three public operations: `get`, `put`,
  `stats`.
- `src/domain/orset/trie/PageCacheStats.ts` — frozen value object for
  hit/miss/eviction/residency reporting.
- `src/domain/errors/PageCacheError.ts` — typed error class for cache
  input and stats violations.
- `src/domain/orset/trie/TrieCursor.ts` — read-path integration for
  root and child OID loads. Cached root kind mismatch now fails as
  `TrieCursorError(E_TRIE_CURSOR_STRUCTURE)`.

### Tests

- `test/unit/domain/orset/trie/PageCache.test.ts` — pure LRU behavior,
  resident-pool mixing for leaves and branches, MRU promotion,
  shared-cache cursor reuse, dirty-page exclusion, root kind mismatch,
  and a dedicated deep-trie assertion proving the first branch miss
  pays the old ambiguous probe while later reads hit cache.
- Existing trie cursor / flusher / integration suites were updated to
  pass an explicit `PageCache` owner into every `TrieCursor`.

### Docs and backlog

- `docs/design/0031-lru-page-cache/lru-page-cache.md` — design,
  expanded test matrix, playback results, and drift notes.
- `docs/method/backlog/v17.0.0/PROTO_state-session-async.md` — now
  states explicitly that `StateSession` owns cache lifetime and
  internal cursor creation.
- `docs/method/backlog/v17.0.0/PROTO_shadow-trie-orset.md` and
  `src/domain/orset/README.md` — aligned to the ownership rule that
  `TrieCursor` and `PageCache` are implementation details below the
  session seam.
- `docs/method/backlog/v17.0.0/PERF_lru-page-cache.md` — removed from
  live backlog because the cycle is closed.
- `docs/releases/v17.0.0/README.md`, `docs/method/backlog/README.md`,
  and `docs/method/backlog/WORKLOADS.md` — updated to reflect the
  closure.

## Design decisions locked

- **Persisted pages only.** `PageCache` stores only real OID-addressed
  `TrieLeaf` / `TrieBranch` instances. Pending OIDs are rejected.
- **Count-bounded, not byte-bounded.** Residency is tracked by page
  count only in this cycle. Heap weighting is deferred to
  `PERF_trie-geometry-and-memory-profile`.
- **Read-through only.** Dirty working pages stay in `TrieCursor`
  until flush; the cache never becomes a write-back staging area.
- **Explicit ownership.** `TrieCursorInit.pageCache` is required.
  This is about dependency injection and lifetime ownership, not just
  parameter plumbing.
- **No `TrieCursorPort`.** The abstraction boundary remains at
  `StateSession`; the cursor is implementation machinery.

## Gate results

| Gate | Result |
|------|--------|
| `npm exec vitest run test/unit/domain/orset/trie/PageCache.test.ts test/unit/domain/orset/trie/TrieCursor.test.ts test/unit/domain/orset/trie/TrieFlusher.test.ts test/integration/domain/orset/trie/TrieCursor.flush.integration.test.ts` | green |
| `npm run typecheck` | green |
| `git diff --check` | green |

## Playback

### Agent

1. *Does a cache hit avoid both `store.readLeaf` and
   `store.readBranch` for the resolved OID?* Yes. Shared-cache tests
   prove the second cursor incurs no additional reads.
2. *Does touching a resident page promote it to MRU?* Yes. Pure LRU
   tests cover promotion and true LRU eviction.
3. *Does `put` bound residency strictly by page count?* Yes. The
   cache tracks resident entry count only.
4. *Are dirty pages excluded until they receive a real OID?* Yes.
   Dirty pages stay in cursor working maps, and pending OIDs are
   rejected by `PageCache`.
5. *Can two cursors share one cache instance without sharing dirty
   state?* Yes. Tests use one shared cache with independent cursors and
   unchanged store-read counts on the second traversal.
6. *Does the first cold branch read still pay the old ambiguous probe
   once, with later reads served from cache?* Yes. Dedicated deep-trie
   test now asserts that the first traversal incurred both leaf and
   branch reads and the second traversal incurred none.

### Human

Deferred to review.

## Drift

- **Initial implementation drifted on constructor ownership.** The
  first green slice made `TrieCursorInit.pageCache` optional with an
  internal default cache. That weakened the ownership story. The drift
  was corrected in the same cycle: `TrieCursor` now requires an
  explicit `PageCache`.
- **No DAG drift.** The `StateSession` backlog note was clarified, but
  its explicit `blocked_by` / `blocks` edges did not change.

## What remains unclosed

- `StateSession` still needs to become the real session owner that
  creates one `PageCache` and shares it across node/edge cursors.
- Capacity tuning and memory profiling remain in
  `PERF_trie-geometry-and-memory-profile`.
- The shadow-trie engine and async firewall trunk remain open:
  `PROTO_shadow-trie-orset`, `PROTO_trie-compaction`,
  `PROTO_state-session-async`, and downstream kernel integration work.
