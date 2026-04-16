# 0018: Shadow-Trie ORSet + Workspace Package Reorganization

## Summary

Replace memory-resident ORSet with a bounded-residency storage-backed
ORSet engine using a hashed prefix trie stored as native Git objects.
Reorganize the repository into a workspace with four packages:
git-warp (product), warp-kernel (engine), warp-adapters (infrastructure),
warp-orset (ORSet engine).

## Status

Design approved. Backlog decomposed into 24 items across 7 layers
(ST-0 through ST-7) in `docs/method/backlog/v17.0.0/`. Cycle 0020
(extract-warp-orset-package) closed as `not-met` — publish pipeline
must exist first. The work is now split: build the seam inside root
(ST-1), then extract via the publish pipeline (ST-7).

## Seam in root

Root-local home for warp-orset-destined code is documented in
[`src/domain/orset/README.md`](../../../src/domain/orset/README.md).
Until the multi-package publish pipeline exists, all warp-orset
code stays in root behind the seam.

## Locked decisions

### 1. Core trie state uses native Git objects

Branch nodes are Git trees. Leaf nodes are Git blobs. This gives
native `git gc` reachability for all trie pages — no custom ref
pinning, no orphan management.

Branch tree entries are named `0` through `f` (hex nibbles), each
pointing to a child OID (tree for branch, blob for leaf).

### 2. Route keys are binary blake3(elementId)

Element IDs (node IDs, edge keys) are hashed with blake3 to produce
32-byte route keys. 4-bit nibble extraction gives uniform trie
distribution with 16-way branching at each level.

### 3. First cut: nodeAlive and edgeAlive only

The first implementation replaces only the two `ORSet` fields on
`WarpState`. Everything else stays as-is:

- `prop: Map<string, LWWRegister<PropValue>>` — stays in kernel
- `edgeBirthEvent: Map<string, EventId>` — stays in kernel
- Graph-level checkpoint envelope fields — stays in kernel

LWW does not move into `warp-orset` in the first cut.

### 4. StateSession is the async firewall

All trie-backed ORSet access goes through an async `StateSession`.
The session manages trie cursor lifecycle, page cache priming, and
dirty-page flushing. Domain code (Ops, reducer, GC) must go through
the session — they never touch raw trie nodes.

StateSession methods are async. No fake sync wrappers.

### 5. Checkpoint truth is ref → commit → envelope tree

Checkpoint publication model:

```
refs/warp/checkpoint/<graph>
  → checkpoint commit
    → envelope tree
      ├── state/
      │   ├── nodeAlive/   → trie root tree (real Git tree entry)
      │   └── edgeAlive/   → trie root tree (real Git tree entry)
      ├── descriptor.cbor  → graph identity, version, writer metadata
      ├── frontier.cbor    → observedFrontier, edgeBirthEvent
      └── appliedVV.cbor   → applied version vector (GC boundary)
```

The trie root entries are **real Git tree entries** pointing at the
actual trie root trees. Git follows tree → tree → blob natively. All
trie pages are reachable from the checkpoint commit through normal Git
tree traversal.

Do not degrade into "roots in CBOR." That reintroduces the exact
reachability bug this design exists to kill.

### 6. Patch envelopes are native Git trees

Patch envelopes use native Git tree reachability, not trailer-OID
reachability alone.

### 7. Workspace scaffolding uses npm workspaces

The repo is npm-first in contributor setup and CI. No pnpm migration
in this slice.

### 8. Package extraction order

1. **warp-orset** — extracted early, before trie implementation begins
2. **warp-kernel** — extracted later, after ORSet + materialization
   seams are proven
3. **warp-adapters** — extracted last, after index/materialization
   adapters are proven with trie-backed ORSets

Do not freeze kernel or adapter package boundaries before the ORSet
line proves them.

## Architecture

### Current state (being replaced)

```
ORSet.ts
  entries: Map<string, Set<string>>   // elementId → Set<encodedDot>
  tombstones: Set<string>             // Set<encodedDot>

WarpState.ts
  nodeAlive: ORSet                    // all in V8 heap
  edgeAlive: ORSet                    // all in V8 heap
  prop: Map<string, LWWRegister>
  observedFrontier: VersionVector
  edgeBirthEvent: Map<string, EventId>
```

All access is synchronous. Full state loaded into memory on open.
Does not scale to graphs exceeding available memory.

### Target state

```
ORSetLike (synchronous in-memory seam)
  ← implemented by ORSet (existing, in-memory)
  ← NOT implemented by ShadowTrieORSet

ShadowTrieORSet (async storage-backed engine)
  cursor: TrieCursor
  cache: PageCache (LRU, bounded residency)
  store: TrieStorePort (Git trees + blobs)
  all methods async: add, remove, contains, getDots, scan, compact

TrieCursor
  descends nibble path: blake3(element) → [n₀, n₁, n₂, ...]
  reads/writes leaf pages
  tracks dirty pages for flush

PageCache
  bounded LRU over deserialized TriePage objects
  shared across nodeAlive + edgeAlive within a session

StateSession (domain-facing contract for trie-backed state)
  async open() / close() lifecycle
  primes cache, manages cursors, flushes on close
  domain code goes through session, never raw trie
  wraps ShadowTrieORSet internally
```

**Seam architecture:** `ORSetLike` is the in-memory seam (synchronous).
`StateSession` is the domain-facing contract for trie-backed state
(async). `ShadowTrieORSet` is an internal engine behind the session.
Domain code never touches `ShadowTrieORSet` directly.

### Trie structure

```
Root (Git tree)
├── 0 → Branch (Git tree)
│   ├── 0 → Leaf (Git blob) — entries for keys 00xx...
│   ├── 1 → Leaf (Git blob) — entries for keys 01xx...
│   └── ...
├── 1 → Branch (Git tree)
│   └── ...
└── f → Leaf (Git blob) — entries for keys fxxx...
```

Leaves contain CBOR-encoded arrays of
`(routeKeySuffix, element, liveDots[], tombstonedDots[])` tuples,
sorted by route-key suffix for binary search. The suffix is the
portion of the route key below the leaf's trie depth — the prefix is
already encoded by the trie path.

Leaves split when they exceed a capacity threshold and merge when they
fall below a floor. Thresholds are constructor parameters, validated
by benchmarking.

### Package map

```
packages/
├── git-warp/          # product: public API, CLI, migrations
├── warp-kernel/       # engine: WarpState, controllers, reducer, GC
├── warp-adapters/     # infra: Git/CAS adapters, crypto, HTTP
└── warp-orset/        # ORSet: trie, cursor, cache, session, compact
```

## Backlog mapping

All items live in `docs/method/backlog/v17.0.0/`. Layers:

- **ST-0** — DX_design-0018-flesh-out, DX_v17-lane-readme-update,
  INFRA_npm-workspaces-scaffold, INFRA_extract-warp-orset-package
- **ST-1** — PROTO_orsetlike-contract, PROTO_blake3-route-key,
  PROTO_git-trie-store-port, INFRA_git-trie-store-adapter
- **ST-2** — PROTO_trie-codec-and-geometry, PROTO_trie-cursor,
  PERF_lru-page-cache, PROTO_trie-flush,
  PROTO_checkpoint-envelope-publication
- **ST-3** — PROTO_shadow-trie-orset, PROTO_trie-compaction,
  TRUST_shadow-trie-semilattice-pbt
- **ST-4** — PROTO_state-session-async, PROTO_joinreducer-state-session,
  PROTO_gc-state-session
- **ST-5** — PROTO_materialize-integration,
  PROTO_index-builder-trie-iteration,
  PERF_trie-geometry-and-memory-profile
- **ST-6** — INFRA_extract-warp-kernel-package,
  INFRA_extract-warp-adapters-package

## What this design explicitly does not do

- Does not move LWW into warp-orset in the first cut
- Does not make ORSetLike async (it stays the synchronous in-memory seam)
- Does not make ShadowTrieORSet implement ORSetLike (it has its own
  async interface, exposed through StateSession)
- Does not serialize checkpoint truth as "trie root OID in CBOR"
- Does not switch to pnpm
- Does not force core trie publication through git-cas
- Does not replace all of WarpState in one shot
- Does not move `src/ports/` into warp-adapters (ports stay with kernel)

## git-cas carve-out

The existing v17 item INFRA_unify-persistence-on-git-cas calls for
GitGraphAdapter to delegate to git-cas. Core trie publication is
explicitly **out of scope** for that unification. The trie
reachability model depends on native Git tree traversal (tree entries
pointing at tree entries), which git-cas tree OIDs would break.

git-cas is still the right choice for user content blobs, seek cache,
and trust records. But trie state, checkpoint envelopes, and trie
root publication stay on native Git.
