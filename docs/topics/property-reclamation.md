# Property reclamation

Design and acceptance plan for [#885](https://github.com/git-stunts/git-warp/issues/885).
This document describes proposed work; it does not change the runtime contract.
The lifecycle decision below is pending.

## Reproduced failure

On the lifecycle-safe GC branch, replaying 25 generations of fresh node IDs,
seven properties per generation, and ordinary observed removals leaves:

| Measurement | Result |
| --- | ---: |
| Live nodes | 1 |
| Retained property registers | 175 |
| Registers reclaimed | 0 |
| Node clear witnesses | 0 |
| Pending node removals | 24 |

The reproduction uses `applyPatchOp`, real `NodeAdd`, `PropSet`, and
`NodeRemove` operations, followed by `executeGC` at each generation. It is
not an artifact of omitting lifecycle events from a test fixture.

Current node visibility clears a register only when a removal sorts between
that write and the latest add. A removed ID that is never reused therefore
never acquires a clear witness. An older concurrent add can also make a
pre-removal value visible again. Deleting that value only on the replica
that ran GC would change its future reads and state hash.

## Lifecycle decision

Two implementations are sound, but they promise different behavior:

1. **Removal clears older properties.** An observed node removal advances a
   monotone property-clear event immediately, independent of the latest add.
   A concurrent add can preserve node liveness but cannot restore a register
   ordered before that removal. Registers ordered after removal remain
   eligible to survive. Adds alone do not clear properties, and a removal
   with no observed dots establishes no clear event.
2. **Preserve current visibility exactly.** Values that can still become
   visible must remain recoverable. Reduce resident memory through a
   storage-backed register representation and bounded caching, with explicit
   ports and checkpoint/replay support. Merely deleting those values from
   the property map is not an implementation of this option.

Option 1 is the smaller proposed repair for ordinary remove-driven churn.
It changes observable concurrent-remove behavior and needs an explicit
compatibility decision. Option 2 is a storage architecture change, not a
small GC predicate adjustment.

## Implementation slices after the decision

1. Pin the selected semantics with failing regressions for fresh-ID churn,
   concurrent surviving adds, late properties, and reordered delivery.
2. Establish one authoritative lifecycle rule across eager reduction,
   session reduction, state joins, materialized indexes, and bounded reads.
   GC continues to require permanent invisibility and the compaction frontier.
3. Preserve removal evidence through clone, snapshot, checkpoint, and merge.
   Version derived materialization/index contracts so an older cached result
   cannot be mistaken for a result under changed visibility semantics.
4. Prove the packed public API behavior and replay compatibility. Document
   migration/replay requirements and the exact memory guarantee.

## Acceptance evidence

For option 1:

- Twenty-five generations with seven properties each retain seven active
  property registers after GC and reclaim 168 obsolete registers.
- Run the same history with GC disabled: visible nodes, properties,
  attachments, and state hashes agree with the collected replica.
- Compare reordered histories and replica partitions, including a concurrent
  lower-ordered add, late pre-removal writes, and writes after removal.
- Re-add retired IDs and merge with unswept replicas without restoring stale
  values or losing newer ones.
- Round-trip checkpoints and compare eager, incremental, and bounded reads.
- Retain values where the removal, owner identity, or stability evidence is
  insufficient. Legacy state without removal witnesses requires replay or
  conservative retention; do not infer historical removals from absence.
- Preserve existing no-coordination behavior and run the runtime matrix,
  type checks, lint, coverage, and packed-consumer checks.

For option 2, replace the register-count target with a measured resident-byte
and cache-entry bound, while proving retrieval of every value the unchanged
visibility contract may expose.

## Scope of the memory guarantee

Reclaiming property payloads does not establish a constant bound on all graph
metadata. Removal witnesses must remain available to reject old values after
future merges. Safe retirement of that evidence needs a separate causal
stability or graph-epoch contract. Historical payloads also remain in Git;
this issue concerns the live materialized state, not destructive history GC.

The existing dependency stack is #893, then #883. This work starts from the
lifecycle-safe #883 branch and must preserve its late-write and merge tests.
