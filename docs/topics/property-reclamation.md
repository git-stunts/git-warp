# Property reclamation

The prepared v20.0.0 implementation follows [#885](https://github.com/git-stunts/git-warp/issues/885)
and [#910](https://github.com/git-stunts/git-warp/issues/910): **observed-remove node
membership plus a node-wide LWW property clear**. This breaking interpretation
requires coordinated reader/writer upgrade. Source validation below is not a claim
of completed registry publication.

## Historical reproduced failure

Before the node-wide clear implementation, replaying 25 generations of fresh node IDs,
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

The previous node visibility rule cleared a register only when a removal sorts between
that write and the latest add. A removed ID that is never reused therefore
never acquires a clear witness. An older concurrent add can also make a
pre-removal value visible again. Deleting that value only on the replica
that ran GC would change its future reads and state hash.

## Accepted lifecycle contract

Each removal carrying at least one observed addition dot immediately advances
`clear(node)` by EventId maximum. Qualification comes from the operation's
nonempty observed-dot collection, even if those dots have not arrived locally.
A removal with no observed dots does not establish a clear.

Membership retains its observed-remove set rule. Adding a node asserts
existence only: it neither clears properties nor restores cleared contents.
A register is permanently cleared exactly when `register.eventId < clear(node)`.
Equality is not cleared. Later-ordered writes remain eligible, including while
the node is absent. "Later" means deterministic EventId order, not arrival
order, wall-clock time, or causal observation.

A clear can defeat a concurrent property write that the remover never observed.
That is the chosen LWW conflict policy; only membership removal is limited to
observed addition dots. Causally observed-only property resets would require a
separate register design capable of retaining otherwise losing concurrent values.

## Reclamation and future merges

The retained clear can only advance. A dominated register can therefore be
reclaimed even if its node is alive, or if original membership records have
already been compacted. Node-register reclamation does not require a membership
compaction frontier. Edge registers use their existing monotone birth/removal
boundaries. Neither sweep retires membership or lifecycle evidence.

Required observational invariant, within this interpretation:

```text
observe(merge(GC(S), T)) == observe(merge(S, T))
```

The same equivalence must hold after subsequent valid operations. Property
sweeping supports arbitrary later state joins even with a nonempty applied
frontier. All supported GC and checkpoint collection paths retain node and edge
membership entries and tombstones: an applied vector is not proof that stale
additions can no longer arrive. Session GC currently reclaims nothing because
sessions own only membership. Low-level eager and trie compaction also retain
all membership evidence under the [preservation contract](membership-compaction.md)
for [#911](https://github.com/git-stunts/git-warp/issues/911). Those calls retire
no dots or tombstones and establish no metadata bound. Tests compare
visible nodes, properties, attachments and hashes, as well as retained-register
counts. Delayed stale registers may enter a joined state, but the next sweep
reclaims them using the retained clear without requiring their owner to reappear.

## Compatibility and historical readings

| Artifact | Current interpretation marker |
| --- | --- |
| Full state | `full-v7` |
| Materialization/cache descriptor | schema 7 |
| Lifecycle shard and receipt | schema 2 |
| Public read receipt `reducerVersion` | `observed-remove/node-lww-clear` |
| Bounded read identity `reducerVersion` | `checkpoint-tail-locator/observed-remove/node-lww-clear` |

Older cache descriptors miss. Older checkpoint descriptors require replay from
immutable patches; rebuild indexed checkpoints afterward. Direct decoding of
intermediate `full-v6` states is refused. Legacy `full-v5` decoding remains
available for legacy tooling, but does not reconstruct missing lifecycle evidence
and is not a substitute for replay under the new interpretation.

Upgrade all writers and readers together before resuming shared operation.
There is no mixed-interpreter agreement guarantee or automatic fencing of an old
client replaying old patches. A cache/schema bump cannot impose new semantics on
that client. Do not backport this visibility change as a maintenance GC patch.

Git history is unchanged. Replaying that history under this interpreter may
produce a different visible reading and state hash. Preserve old receipts and
hashes with their original interpreter identity; an unqualified historical hash
is not evidence of the current interpretation. Recompute derived readings and
receipts instead of relabeling historical evidence. State hashes remain hashes
of visible projections; their bytes alone do not identify the interpreter.

## Acceptance

- Fresh-ID churn: 25 generations of seven properties retain seven registers
  and reclaim 168, with the same visible projection as unswept replay.
- Live concurrent membership and delayed reintroduction remain reclaimable.
- Earlier concurrent writes lose; later-ordered writes survive a clear.
- Adds, empty removals, replay permutations, partitioned joins and checkpoint
  round trips preserve the contract.
- Eager, session, targeted and checkpoint-tail reads agree. Ambiguous keys and
  missing removal witnesses are retained conservatively.
- Final release-head runtime, type, lint, coverage and isolated registry-consumer
  verification remain separate release gates.

## Scope of the memory guarantee

Reclaiming property payloads does not establish a constant bound on all graph
metadata. Removal witnesses must remain available to reject old values after
future merges. Safe retirement of that evidence needs a separate causal
stability or graph-epoch contract. Historical payloads also remain in Git;
this issue concerns the live materialized state, not destructive history GC.

The implementation preserves the lifecycle-safe late-write and merge regressions
introduced through #893 and #883.

## Recorded source validation

The reducer/GC regression initially failed four cases and now passes them.
A 256-pair partition test compares projections, attachments and hashes after
property collection, checkpoint round trips, future joins and subsequent writes.
The changed lifecycle predicate, sweep and lifecycle-record model have 100%
statement, branch, function and line coverage.

The isolated tarball smoke validates public exports/types and interpretation
markers, then runs lifecycle writes and reads in separate installed CLI processes.
Every write must return a derived receipt. Before lifecycle assertions, the
checker reads the actual persisted removal from installed artifact modules and
verifies its nonempty observed dots. Reopening the original writer, re-adding,
and explicitly replacing a property all pass. An isolated second repository
proves that a concurrent unobserved add survives while the old property clears.

## Public bounded removal basis (#912)

`Runtime` / `Lane.write` prepares node removals automatically before lowering.
It captures writer heads, pins the publishing writer to its existing CAS parent,
and scans immutable journal histories newest-first. The observation retains only
membership dots, incident edges, and property names needed by the existing
reject/cascade/warn deletion policy. It does not construct or cache a whole-graph
`WarpState`, load property payloads into the observation, or materialize as a
fallback. Its frontier identifies the admission evaluation coordinate; its
observed context and maximum Lamport advance the removal patch's causal basis.
Foreign additions published after capture remain unobserved and can survive.

The initial profile admits at most 1,024 writer refs, 10,000 patches, 50,000
operations, 50,000 charged evidence names/dots/context entries, and 8,388,608
UTF-16 text units. Repeated evidence is charged conservatively. These are bounds
on the observation and scan work, not a new bound on a single decoded patch in
the journal adapter. Oversized observations refuse publication; this is not yet
a checkpoint-accelerated removal path for arbitrarily long histories.
State-dependent Strand removals still require their existing scoped basis: the
worldline scan is never substituted for a Strand coordinate.

All public writes restore the persisted writer-parent context before allocating
new dots, preventing a reopened writer from reusing an already removed addition
counter. Empty observed-dot removals still do not establish a clear, and missing
nodes return a law-violation obstruction rather than a fabricated removal.

The five checkpoint-tail refusal cases in #913 now inject faults into the current
root-backed index/property members. Missing roots and missing/malformed shards
still refuse without materialization fallback; no expectation was weakened.
The shared neighbor-provider contract in #913 now verifies both the retained-basis
and cold/replayed checkpoint-tail backends; typed refusal preserves its cause.
