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
[state-cache exact hit?] ---- yes ---> [reopen retained roots; zero patch replay]
        |
        no
        v
[compatible predecessor?] --- yes ---> [replay suffix, publish snapshot]
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

### 2. Check the WARP state cache

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

## `git-cas` Encapsulation

Materialization-root retention routes through the formal
`@git-stunts/git-cas` `CacheSet` API. The legacy state-cache adapter also routes
payload bytes through `git-cas`, but still owns its snapshot index and RootSet
reconciliation. Removing that compatibility cache lifecycle is required before
the one-cache boundary is complete. Raw Git plumbing remains an adapter concern
for WARP refs and Git object access; WARP code must not hand-roll a parallel
CAS.

Routing state snapshots through `git-cas` allows content-addressed storage and
chunk-level reuse where the underlying CAS representation can identify unchanged
byte ranges. The WARP cache index remains responsible for determining whether a
snapshot is semantically usable for a materialization coordinate.

## Git Retention and Repair

A payload object ID written as text inside the state-cache index is not a Git
reachability edge. Without a ref-backed edge, Git sees the payload tree and its
blobs as unreachable objects and may eventually prune them even while WARP's
index still names them.

The Git-backed adapter therefore mirrors its live index membership into this
graph-scoped `git-cas` RootSet:

```text
refs/cas/rootsets/git-warp/<graph-name>/state-cache
```

Cache policy and Git retention are separate axes. Both `pinned` and `evictable`
records must remain Git-reachable while they are live in the index; `pinned`
only controls WARP eviction policy. Each cache mutation follows this ordering:

1. Publish a RootSet generation that anchors a safe superset of the desired
   payload trees.
2. Compare-and-swap the WARP state-cache index.
3. Guardedly replace the RootSet with the exact recoverable live membership.

An interrupted write can therefore leave extra reachable payloads, but it does
not publish an index entry whose payload was never anchored. Ordinary reads
also adopt legacy index entries that predate RootSet retention.

Inspect retention without changing it:

```bash
git warp doctor --repo ./team-repo
```

Reconcile the RootSet from the authoritative WARP index:

```bash
git warp doctor --repo ./team-repo --repair-state-cache
```

Repair anchors every indexed payload that still exists as a Git tree and
removes stale RootSet membership. It reports missing payloads and wrong-type
objects as unrecoverable; it does not delete logical cache records, recreate
lost payload bytes, or run Git garbage collection.

## Current Limitations

- RuntimeHost and checkpoint creation do not yet consume the handle-first
  result, so their compatibility path still owns process-resident whole state.
- Exact state-cache hits bypass replay, but full materialization still hydrates
  a full `WarpState`, scans retained node/edge tries, and builds full adjacency.
- Retained materialization descriptors currently carry node/edge trie roots;
  property, frontier, edge-birth, adjacency, provenance-support, and roaring
  roots are explicitly marked unavailable until their paged representations
  land.
- `WarpStateCachePort` remains a legacy full-snapshot compatibility cache with
  a WARP-owned index. Ordinary bounded observers cannot rely on it as their
  final storage contract.
- The Git-backed state-cache adapter stores full-state snapshots today. A future
  sharded basis format should make optic reads avoid full-state hydration.
- Cache coordinates must stay schema/version aware. A snapshot is reusable only
  when WARP semantics say the coordinate is compatible.
- Retention repair cannot restore payload objects that Git has already pruned;
  those entries remain visible as doctor findings until normal cache lifecycle
  replacement or explicit operator cleanup.

## See also

- [Content and CAS](content-and-cas.md)
- [Git substrate](git-substrate.md)
- [Optic reads](optic-reads.md)
- [Troubleshooting](troubleshooting.md)
