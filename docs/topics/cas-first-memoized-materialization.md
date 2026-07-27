# WARP State-Cache Materialization

Use this page when you need to understand how `git-warp` skips redundant
materialization replay by memoizing WARP-owned state snapshots in
`@git-stunts/git-cas`.

`git-cas` provides byte storage, retained cache entries, and generic
Git-reachability primitives. It does not know about WARP frontiers, optics,
checkpoints, graph state, or materialization rules. `git-warp` owns those
semantics through `WarpStateCachePort` and `MaterializationStorePort`; the
Git-backed adapters store snapshot payloads and coordinate-keyed retained roots
through `git-cas`.

## The Live Materialization Lifecycle

There are now two deliberately different controller contracts:

- `resolveLiveMaterialization()` returns an operation-scoped retained-handle
  resolution. An exact coordinate hit uses git-cas `CacheSet.acquire()` and
  does not open the legacy state cache, patch streams, a state session, or the
  whole-state projector. The acquisition pins the observed cache generation
  until the caller invokes `release()`; replacement or eviction cannot collect
  its roots during that scope. A miss does not publish a legacy full-state
  snapshot and acquires the newly retained handle before returning it.
- `materialize()` remains the explicit compatibility and diagnostic operation
  that returns a complete state projection.

The split prevents callers that need only a durable basis from paying the
graph-sized cost required by the legacy result shape. On a retained-handle miss,
handle resolution still performs the cold materialization path until every
independently addressable root can be produced without a complete state.
Acquisition release is mandatory on both warm and cold non-empty resolutions;
release failures remain operational failures, while failure-path cleanup never
replaces the primary materialization error.

When a Git-backed runtime has a state cache, the compatibility `materialize()`
operation follows this coordinate-first lifecycle:

```text
[current frontier]
        |
        v
[retained exact hit?] ------- yes ---> [load basis; reuse roots; zero patch replay]
        |
        no
        v
[retained predecessor?] ----- yes ---> [load basis; replay suffix]
        |
        no
        v
[state-cache exact hit?] ---- yes ---> [reopen roots; zero patch replay]
        |
        no
        v
[state-cache predecessor?] -- yes ---> [replay suffix, publish snapshot]
        |
        no
        v
[checkpoint/frontier replay] --------> [publish snapshot]
```

### 1. Derive a WARP coordinate

Before replay, the live path reads the current writer frontier and builds a
WARP state coordinate:

```text
{ frontier: Map<writerId, tipSha>, ceiling: null }
```

This coordinate belongs to `git-warp`; it is not a `git-cas` concept.

### 2. Check retained materializations, then the WARP state cache

The compatibility path first asks `MaterializationStorePort` for an exact
retained materialization and then for a causally compatible retained
predecessor. Only when neither retained resume applies does it consult the
legacy `WarpStateCachePort`.

The runtime asks `WarpStateCachePort` for an exact snapshot at that coordinate.
On a hit, it asks `MaterializationStorePort` for the matching retained-root
descriptor. A descriptor hit reopens the node/edge trie roots and projects the
result without replaying writer patch streams or republishing the same snapshot.
The descriptor records every named materialization root as `retained`, `empty`,
or `unavailable`; only retained roots become bundle members. On the first exact
snapshot hit without a descriptor, the runtime seeds the trie roots from the
snapshot and retains the resulting descriptor for later runtime instances.

The current payload records state but not the provenance index. A runtime may
retain its resident provenance index when the cached state has the same hash and
coordinate. A runtime restored only from the cache reports provenance as
degraded instead of presenting an empty index as complete evidence.

If no exact snapshot exists, the runtime asks for the best compatible
predecessor. A predecessor hit lets materialization replay only the suffix after
that cached coordinate, then publish a fresh snapshot for the current frontier.
Until cache payloads carry provenance indexes, that derived snapshot retains a
degraded provenance posture rather than claiming support for the cached prefix.

Retained materializations can now satisfy the same two resume cases without a
separate state-cache hit. A complete descriptor retains a canonical replay
basis beside the node, edge, and property roots. An exact retained hit validates
and loads that basis, reuses the retained roots, and performs no patch replay.
Descriptor schema v5 also admits explicitly partial handles: `stateHash: null`
means the roots can answer only the reads whose root status is retained or
empty, and the handle cannot resume a whole-state snapshot. When there is no
exact hit, the adapter inspects at most 1,024 current-schema cache entries in
pages of 100. It validates their descriptors and coordinates, checks causal
ancestry, and resumes the newest compatible complete predecessor by replaying
only the suffix. Receipt-producing reads still use the ordinary replay path, as
do diff-producing predecessor reads.

### 3. Fall back to replay and publish

When there is no usable cached snapshot, the runtime falls back to the existing
checkpoint/frontier replay path. Successful live and coordinate materializations
publish an evictable state-cache snapshot with the actual coordinate so the next
equivalent read can hit the cache.

## Memory Boundaries

State-cache hits with retained roots avoid redundant CRDT patch replay across
runtime instances. They do not make legacy full materialization an `O(1)` time
or memory API: the current result contract still loads a full snapshot and scans
the retained node/edge tries to produce a full `WarpState` and adjacency map.

The bounded-memory read path is optic/worldline/query work over a sharded or
streamed basis. The state cache is the replay-skipping compatibility bridge for
legacy materialization and checkpoint flows.

`RuntimeHost.hasNode()`, `RuntimeHost.getNodeProps()`, and
`RuntimeHost.getEdgeProps()` consume the handle-first path directly when the
runtime uses the built-in trie-backed state session and matching materialization
reader. On an exact retained-coordinate hit, node or edge liveness opens only
the required trie path through a bounded page cache. A node-property read uses
the node's full BLAKE3 route key to resolve one per-node property shard by exact
bundle member path. The schema-v2 shard envelope stores the property bag as
sorted key/value entries, preserving legal keys such as `__proto__` without
treating them as object structure. Writes reject an encoded shard over 16 MiB;
reads enforce the same byte ceiling plus CBOR container, depth, and item limits
before general decoding. The reader owns no cache.

Both exact paths release their operation borrow without hydrating `WarpState`,
building adjacency, publishing a state snapshot, or populating `_cachedState`.
The runtime storage adapter keeps one git-cas acquisition for the current
coordinate, retires it after in-flight readers finish when the coordinate
changes, and releases it from `RuntimeHost.close()`. On a cold handle miss, the
built-in session now streams only node and edge OR-Set operations into bounded
git-cas pages and retains those roots as a partial handle. It does not construct
`WarpState`, adjacency, property registers, receipts, diffs, provenance, or a
state-cache snapshot. When that partial handle proves the requested node is
live but has no usable property root, the runtime streams the handle's exact
coordinate and reduces only matching `NodePropSet` operations into the
requested node's LWW property bag. That targeted reducer does not hydrate
`WarpState`, hash or publish state, or build graph-wide indexes. A later
compatibility or property-root construction operation can replace the partial
entry with a complete descriptor. A cold edge-property read similarly proves
both endpoint nodes and the edge through retained liveness roots, then reduces
only matching `EdgeAdd` and `EdgePropSet` operations. Tracking the latest
matching edge birth preserves the existing rule that properties older than an
edge rebirth are hidden.

Once assembled, a newly built property root joins the operation's expiring
git-cas workspace before state hashing and final promotion, so the completed
root remains reachable throughout promotion. A custom state-session opener owns
its root storage and encoding, so git-warp does not pair it with the default
reader and instead preserves the compatibility fallback.

Schema v5 is the first release contract for retained-materialization
descriptors. Earlier v2, v3, and v4 profiles were unreleased derived-cache
formats; v19 does not decode or migrate them. A current-key miss rebuilds from
authoritative WARP history.

## `git-cas` Encapsulation

Materialization-root retention routes through the formal
`@git-stunts/git-cas` `CacheSet` API. v19 removes the parallel WARP-owned state
snapshot index, graph-scoped RootSet coordinator, and retention repair protocol.
The retained-materialization descriptor and its lane-scoped cache key are the
only derived-cache contract. Raw Git plumbing remains an adapter concern for
authoritative WARP refs and Git object access; WARP code does not hand-roll a
parallel CAS.

The old `refs/warp/<graph-name>/state-cache` and
`refs/cas/rootsets/git-warp/<graph-name>/state-cache` corridors are not migrated
or consulted. They contain derived snapshots, not authoritative history. A
current retained-materialization miss therefore rebuilds from WARP patch and
checkpoint history.

## Git Retention and Repair

git-cas owns the `git-warp/materializations` cache namespace and its RootSet
reachability. Cache entries retain opaque bundle handles; bundle members retain
the descriptor and materialization roots. `CacheSet` receipts provide the
generation, policy, reachability, root ref, and path witness for every retained
materialization.

Inspect retention without changing it:

```bash
git warp doctor --repo ./team-repo --lane users
```

Ask git-cas to sweep expired entries, discard malformed or missing entries, and
rebuild cache metadata through the git-cas repair interface. git-warp v19
reports this posture but does not expose a second physical cache-repair path.

Doctor reports git-cas structural issues plus WARP-specific live, stale,
expired, malformed, missing, and collectible lane-coordinate evidence. Repair
preserves entries belonging to other lanes in the shared namespace. It does not
recreate lost bytes, mutate authoritative WARP history, or run Git garbage
collection.

## Current Limitations

- RuntimeHost exact node-liveness and node-property reads consume the
  handle-first result when the built-in trie session and reader pair is active;
  exact edge-property reads do the same after proving both endpoint nodes and
  the edge live. Cold node liveness now produces a partial retained handle
  through bounded node/edge replay. A cold node- or edge-property read reduces
  only one proven-live target without whole-state projection, but
  `PatchCollector` can still buffer one writer chain while producing that
  coordinate stream. Custom session openers, neighborhoods, list reads,
  checkpoint creation, and other compatibility operations still own
  process-resident whole state.
- Exact state-cache hits bypass replay, but full materialization still hydrates
  a full `WarpState`, scans retained node/edge tries, and builds full adjacency.
- Retained exact and predecessor resume load a complete canonical `WarpState`
  replay basis before they reuse roots or replay a suffix. This eliminates
  redundant prefix replay but is still a whole-state compatibility bridge, not
  the bounded-memory observer representation.
- Complete retained materialization descriptors carry node/edge trie roots, a
  per-node property-shard root, and the full-state replay basis. Partial cold
  handles carry node/edge roots and mark the remaining roots unavailable.
  Frontier, edge-birth, adjacency, provenance-support, and roaring roots remain
  explicitly unavailable until their paged representations land. Cold
  property-root construction still projects a complete `WarpState`; only
  exact retained property reads avoid that state.
- One node's complete encoded property bag must currently fit within the 16 MiB
  shard limit. Property-key pagination or a property trie is not yet available.
- The first property-root profile stores one bundle member per property-bearing
  node and therefore inherits the configured git-cas bundle-member ceiling
  (100,000 by default). The profile preflights this count before staging any
  shard assets. A hierarchical property root is required to exceed that ceiling
  without widening a repository-wide safety limit.
- Staged pages and bundles are immediately retained by the active git-cas
  workspace. Each checkpoint atomically replaces the workspace's active staged
  roots; promotion transfers the final materialization into the cache policy,
  and release closes the staging workspace. git-warp never owns raw CAS-object
  reachability or relies on Git's unreachable-object grace period.
- `WarpStateCachePort` remains a legacy full-snapshot compatibility cache with
  a WARP-owned index. Ordinary bounded observers cannot rely on it as their
  final storage contract.
- The Git-backed state-cache adapter stores full-state snapshots today. A future
  sharded basis format should make optic reads avoid full-state hydration.
- Cache coordinates must stay schema/version aware. A snapshot is reusable only
  when WARP semantics say the coordinate is compatible.
- Compatible-predecessor lookup is deliberately bounded to 1,024 inspected
  materialization entries. Exceeding that bound fails closed instead of silently
  selecting from an incomplete cache scan.
- Retention repair cannot restore payload objects that Git has already pruned;
  those entries remain visible as doctor findings until normal cache lifecycle
  replacement or explicit operator cleanup.

## See also

- [Content and CAS](content-and-cas.md)
- [Git substrate](git-substrate.md)
- [Optic reads](optic-reads.md)
- [Troubleshooting](troubleshooting.md)
