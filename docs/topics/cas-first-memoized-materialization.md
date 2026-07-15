# WARP State-Cache Materialization

Use this page when you need to understand how `git-warp` skips redundant
materialization replay by memoizing WARP-owned state snapshots in
`@git-stunts/git-cas`.

`git-cas` provides byte storage and generic Git-reachability primitives. It does
not know about WARP frontiers, optics, checkpoints, graph state, or
materialization rules. `git-warp` owns those semantics through
`WarpStateCachePort`; the Git-backed adapter stores snapshot payloads in
`git-cas` and declares the live payload trees through a `RootSet`.

## The Live Materialization Lifecycle

When a Git-backed runtime has a state cache, live materialization follows this
coordinate-first lifecycle:

```text
[current frontier]
        |
        v
[state-cache exact hit?] ---- yes ---> [return cached state]
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
On a hit, it returns the cached state without replaying writer patch streams and
without republishing the same snapshot.

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

State-cache hits avoid redundant CRDT replay and can remove repeated startup
costs for graph-sized materializations. They do not make legacy full
materialization an `O(1)` memory API: a caller that asks for a full
`SnapshotWarpState` still receives a full in-memory state object.

The bounded-memory read path is optic/worldline/query work over a sharded or
streamed basis. The state cache is the replay-skipping compatibility bridge for
legacy materialization and checkpoint flows.

## `git-cas` Encapsulation

All state-cache payload storage routes through the formal `@git-stunts/git-cas`
library API. Raw Git plumbing remains an adapter concern for WARP refs and Git
object access; WARP state-cache payloads should not hand-roll a parallel CAS.

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

- Exact state-cache hits bypass replay, but full materialization still hydrates
  a full `WarpState`.
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
