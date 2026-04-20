---
title: "Bounded LRU page cache for deserialized trie pages"
legend: "PERF"
cycle: "0031-lru-page-cache"
source_backlog: "docs/method/backlog/v17.0.0/PERF_lru-page-cache.md"
---

# Bounded LRU page cache for deserialized trie pages

Source backlog item (absorbed into this doc):
`docs/method/backlog/v17.0.0/PERF_lru-page-cache.md`
Legend: PERF

## Sponsors

- Human: Backlog operator
- Agent: Implementation agent

## Hill

`PageCache` is a session-scoped, count-bounded LRU over persisted
`TrieLeaf` and `TrieBranch` objects keyed by real Git OIDs.
`TrieCursor` consults it before touching `TrieStorePort`, stores
successful reads back into it, and treats cached pages as immutable
persisted truth. One cache instance can be shared across both
`nodeAlive` and `edgeAlive` cursors inside a future `StateSession`.

The cache does NOT own dirty pages, pending child OIDs, or flush
lifecycle. Working-set mutation state stays inside `TrieCursor`;
persisted-page residency stays inside `PageCache`.

## Playback Questions

### Human

- [ ] Is the ownership split obvious: dirty working pages live in
      the cursor, persisted pages live in the cache?
- [ ] Is the cache small enough in surface area that a later
      `StateSession` can own it without becoming magical?

### Agent

- [ ] Does a cache hit avoid both `store.readLeaf` and
      `store.readBranch` for the resolved OID?
- [ ] Does touching a resident page promote it to MRU so the next
      overflow evicts the true least-recently used page?
- [ ] Does `put` bound residency strictly by page count, never by
      bytes or heuristics?
- [ ] Are dirty pages excluded until they receive a real OID from
      the flusher?
- [ ] Can two cursors share one cache instance and observe fewer
      store reads without sharing dirty state?
- [ ] Does the first cold read of a branch still pay the existing
      leaf-then-branch probe cost, with later reads served from
      cache?

## Accessibility and Assistive Reading

- Linear truth / reduced-complexity posture: one runtime-backed
  cache class plus one stats value object. No callbacks, no hidden
  background eviction, no timers.
- Non-visual or alternate-reading expectations: stats use stable
  field names (`hits`, `misses`, `evictions`, `resident`,
  `maxResident`); no color or chart dependence.

## Localization and Directionality

- None. OIDs and path keys remain ASCII. LRU order is temporal by
  access sequence, not locale-sensitive.

## Agent Inspectability and Explainability

- Deterministic eviction: overflow always removes the single least
  recently used resident OID.
- Deterministic counters: cache hits and misses are counted once per
  `get(oid)` call; `put` never increments hit/miss counters.
- Cache truth is attributable: every resident entry is a real OID
  plus a concrete runtime page object (`TrieLeaf` or `TrieBranch`),
  never a loose record or transport blob.

## Non-goals

- [ ] No byte-weighted or heap-estimated capacity model. This cycle
      is page-count bounded only.
- [ ] No dirty-page staging, no write-back, and no pending-OID
      entries. Dirty pages remain in `TrieCursor` until flush.
- [ ] No `TrieStorePort` expansion for page kind probing. Cold
      branch loads still use the current read-fallback path.
- [ ] No background prefetch or speculative warming.
- [ ] No process-global or cross-session cache. Ownership is
      session-scoped.
- [ ] No geometry tuning. Capacity tuning belongs to
      `PERF_trie-geometry-and-memory-profile`.

## Backlog Context

Cycle 0029 explicitly left caching out of `TrieCursor`; cycle 0030
left it out of `TrieFlusher`. The shadow-trie line now has the
store port, codec, adapter, cursor, and flusher, but every cursor
read still resolves through `TrieStorePort` even when the same OID
was just read moments earlier. `PROTO_shadow-trie-orset` wants a
shared, bounded page cache before it wraps the trie under an async
engine.

## Problem

`TrieCursor` currently keeps two distinct kinds of state:

1. **Persisted pages already read from store** — root branch, child
   branches, and leaves loaded by OID.
2. **Working pages mutated in-memory** — dirty leaves, dirty
   branches, and pending child OIDs that only exist until flush.

Today both concerns blur into cursor-local maps. That is fine for a
single operation, but it means:

- repeated reads of the same persisted OID re-hit the store
- future sibling cursors cannot share hot pages
- `StateSession` has nowhere honest to hold bounded residency
- the repo has no place to measure cache hit/miss behavior

What we do NOT want is a fake fix where the cursor's dirty maps
become an accidental shared cache. That would couple persistence
truth to mutation lifecycle and create coherence bugs the moment two
cursors share a session.

## Fix

Introduce `PageCache` in `src/domain/orset/trie/` as the persisted
page residency owner and wire `TrieCursor` to consult it on every
OID-based load.

### Public surface

```typescript
export interface PageCacheInit {
  readonly maxResident: number;
}

export default class PageCache {
  constructor(init: PageCacheInit);

  get(oid: string): TrieLeaf | TrieBranch | null;
  put(oid: string, page: TrieLeaf | TrieBranch): void;
  stats(): PageCacheStats;
}

export default class PageCacheStats {
  constructor(fields: {
    readonly hits: number;
    readonly misses: number;
    readonly evictions: number;
    readonly resident: number;
    readonly maxResident: number;
  });

  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly resident: number;
  readonly maxResident: number;
}
```

### Why this shape

- `get(oid)` returns concrete runtime objects, not a fake
  `TriePageLike` shape. Callers use `instanceof TrieLeaf` /
  `instanceof TrieBranch` when they need to branch.
- `put(oid, page)` is the only mutation entrypoint. Pages are stored
  under real OIDs only.
- `stats()` returns a named runtime object, not an anonymous metrics
  bag.
- Public manual eviction is unnecessary. Eviction is an internal
  consequence of `put` when residency exceeds `maxResident`.

### Capacity and validation

- `maxResident` must be a positive integer.
- `resident` is the number of cached pages, regardless of page kind.
- `put` on an existing OID refreshes recency and replaces the page
  instance without changing resident count.

## LRU mechanics

Use insertion-ordered `Map<string, TrieLeaf | TrieBranch>` as the
LRU spine:

1. `get(oid)`:
   - resident -> increment `hits`, remove and re-set the entry so it
     becomes MRU, return the page
   - absent -> increment `misses`, return `null`
2. `put(oid, page)`:
   - if present, delete then re-set to refresh MRU
   - if absent, set as MRU
   - while `resident > maxResident`, evict the first key in map
     order and increment `evictions`

This stays deterministic, count-bounded, and small enough to reason
about. No linked-list machinery is needed because JavaScript `Map`
already preserves insertion order.

## Cursor integration

`TrieCursorInit` gains a required `pageCache: PageCache`.

```typescript
export interface TrieCursorInit {
  readonly rootOid: string | null;
  readonly store: TrieStorePort;
  readonly geometry: TrieGeometry;
  readonly codec: CodecPort;
  readonly pageCache: PageCache;
}
```

### Read path rules

1. **Root load** (`#loadRootIfNeeded`)
   - if `rootOid === null`, do nothing
   - else ask `pageCache.get(rootOid)`
   - if hit, require `TrieBranch`; bind it into the working branch
     map without store I/O
   - if miss, use existing `readBranch` path, then `put(rootOid, branch)`

2. **Child load** (`#loadChildFromStore`)
   - first ask `pageCache.get(childOid)`
   - if hit:
     - `TrieLeaf` -> bind working leaf + record clean child OID
     - `TrieBranch` -> bind working branch + record clean child OID
   - if miss:
     - run the existing leaf-read / deserialize / branch-fallback
       logic
     - on successful page resolution, `put(childOid, page)`
     - then bind working maps and clean-child tracking exactly as
       today

3. **Dirty pages**
   - dirty branches / leaves produced by mutation stay only in the
     cursor's working and dirty maps
   - `PageCache` never stores pending OIDs like `pending:0/a/f`
   - this cycle does not change `snapshot()` or `DirtyPageSet`

### Important consequence

Because `TrieStorePort` still has no page-kind probe, the FIRST cold
read of a branch OID still pays the existing `readLeaf` -> decode
fallthrough -> `readBranch` sequence. The cache does not solve that
first-read ambiguity; it ensures later reads of the SAME OID do not
repeat it.

## Ownership law

### Owned by `PageCache`

- Real persisted OIDs
- Deserialized persisted `TrieLeaf` / `TrieBranch` objects
- Residency order
- Hit / miss / eviction counters

### Owned by `TrieCursor`

- Dirty leaves and branches
- Pending child OIDs
- Structural-sharing bookkeeping (`cleanChildren`)
- Mutation semantics (`add`, `remove`, split cascade)

### Future owner: `StateSession`

`StateSession` creates one `PageCache` and passes it into both
`nodeAlive` and `edgeAlive` cursors. That is where the "shared
across both tries within a session" requirement becomes concrete.
This cycle only defines the cache and the cursor seam needed for
that later owner.

## Scope

**In:**

- `docs/design/0031-lru-page-cache/lru-page-cache.md`
- `src/domain/orset/trie/PageCache.ts`
- `src/domain/orset/trie/PageCacheStats.ts`
- `TrieCursor` constructor and read-path wiring to consult the cache
- unit tests for pure LRU behavior
- cursor tests proving repeated reads and shared-cache second-cursor
  reads avoid extra store calls

**Out:**

- `StateSession` construction and cache lifetime management
- `ShadowTrieORSet` implementation
- cache seeding from `TrieFlusher` writes
- byte-budget heuristics or cache tuning policy

## Test matrix

### Happy path

- **`PageCache` pure behavior**
  - cache miss returns `null`, increments `misses`, leaves
    `resident` unchanged
  - `put(oid, leaf)` and `put(oid, branch)` make the page resident
    and visible through `get`
  - repeated `get(oid)` on a resident entry increments `hits`
  - re-`put` of an existing OID refreshes MRU without increasing
    `resident`
- **Cursor integration**
  - cached root branch avoids `store.readBranch`
  - repeated read of the same leaf OID through one cursor hits the
    store once, then the cache
  - two cursors sharing one cache instance observe reduced store
    reads on the second cursor

### Edge cases

- `maxResident = 1` still honors MRU promotion and evicts exactly the
  previous LRU page
- mixed `TrieLeaf` and `TrieBranch` entries compete in the same
  residency pool
- first cold read of a branch OID still pays the current
  `readLeaf -> decode fallthrough -> readBranch` cost once, then
  becomes a cache hit
- root-path loading and child-path loading both consult the cache
- dirty copy after cache hit remains copy-on-write: mutating through
  the cursor leaves the cached persisted page object unchanged

### Known failure cases

- invalid cache construction rejects:
  - zero `maxResident`
  - negative `maxResident`
  - non-integer `maxResident`
- cache kind mismatch is surfaced explicitly:
  - cached `TrieLeaf` returned where root load requires
    `TrieBranch`
  - cached `TrieLeaf` / `TrieBranch` mismatch at a branch-only read
    site
- cache pollution is forbidden:
  - pending OIDs like `pending:0/a/f` never become resident
  - dirty pages never enter the cache before flush gives them a real
    OID
- store and decode failures on cache miss still surface through the
  existing cursor error path; cache integration must not swallow,
  reclassify, or convert them into fake cache misses
- stats honesty:
  - `put` does not increment `hits` or `misses`
  - failed loads do not count as hits
  - `evictions` increments only on real overflow

## Notes

- `TrieLeaf` and `TrieBranch` are already runtime-backed immutable-ish
  page objects. Cursor mutations allocate new page instances rather
  than mutating the cached persisted page in place, so the cache can
  safely store page instances directly.
- Shared-cache behavior is testable with `InMemoryTrieStore`'s
  read-count introspection. The second cursor in a shared-cache test
  should see reduced store reads even though it has its own working
  maps.
- The cache is domain-side, not adapter-side. It stores decoded page
  objects, so it belongs above `TrieStorePort`, not inside a Git
  adapter.

## Playback results

Recorded after implementation commit `e09b0d75` and red-test commit
`589dc413`.

### Human

- **Is the ownership split obvious?** Yes. `PageCache` owns persisted
  OID-addressed pages and counters; `TrieCursor` still owns dirty
  working maps and pending child OIDs.
- **Is the cache small enough for later `StateSession` ownership?**
  Yes. The public surface stayed at three methods (`get`, `put`,
  `stats`) plus a constructor.

### Agent

- **Does a cache hit avoid both `store.readLeaf` and
  `store.readBranch` for the resolved OID?** Yes, for the exercised
  shared-cache path. `test/unit/domain/orset/trie/PageCache.test.ts`
  proves the second cursor does not increase read counts.
- **Does touching a resident page promote it to MRU?** Yes. The pure
  LRU unit tests show hit promotion and least-recently-used eviction.
- **Does `put` bound residency strictly by page count?** Yes.
  `PageCache` tracks only resident-entry count; no byte-based logic
  was introduced.
- **Are dirty pages excluded until they receive a real OID?** Yes.
  The cache rejects pending OIDs and the cursor does not insert dirty
  working pages into it.
- **Can two cursors share one cache without sharing dirty state?**
  Yes. The shared-cache cursor test passes while each cursor keeps its
  own working maps.
- **Does the first cold read of a branch still pay the existing
  leaf-then-branch probe cost, with later reads served from cache?**
  Code-truth yes: the miss path in `TrieCursor.#loadChildFromStore`
  still falls through the existing leaf-read / branch-read logic
  before caching the resolved page.

## Drift check

- **Design said `TrieCursorInit.pageCache` was required; implementation
  made it optional.** The code currently allows omitted `pageCache`
  and falls back to an internal default cache to avoid broad call-site
  churn in this slice. This preserves behavior and keeps tests green,
  but it weakens the explicit ownership story described above.
- **The branch-fallback playback is proven by code path, not a
  dedicated assertion.** Shared-cache tests prove zero additional
  reads on cache hit, but there is not yet a dedicated unit asserting
  "first branch miss pays the ambiguous probe once, second read is a
  cache hit."

## Downstream effects

- **`PROTO_shadow-trie-orset`** — gains the bounded residency owner
  it expects under the async engine.
- **`PROTO_state-session-async`** — can own one session-scoped cache
  and hand it to both node and edge cursors.
- **`PERF_trie-geometry-and-memory-profile`** — can tune
  `maxResident` using real hit/miss/eviction counters instead of
  folklore.
