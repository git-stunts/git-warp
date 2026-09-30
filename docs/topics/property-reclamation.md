# Property reclamation

Design and acceptance plan for [#885](https://github.com/git-stunts/git-warp/issues/885).
The accepted contract is **observed-remove node membership plus a node-wide
LWW property clear**. This is a breaking lifecycle change, targeting a major
release together with #893. Implementation and validation are tracked in #910.

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
compaction frontier. The existing edge compaction guard remains unchanged.

Required observational invariant, within this interpretation:

```text
observe(merge(GC(S), T)) == observe(merge(S, T))
```

The same equivalence must hold after subsequent valid operations. Property
sweeping supports arbitrary later state joins with an empty membership-compaction
frontier. Existing membership compaction can resurrect stale additions if its
retirement assumptions are violated; [#911](https://github.com/git-stunts/git-warp/issues/911)
tracks that independent hazard. Do not infer safe membership retirement from
this property's monotone clear proof. Tests compare
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
- Runtime, type, lint, coverage and isolated packed-consumer validation remain
  required before this draft is ready to merge.

## Scope of the memory guarantee

Reclaiming property payloads does not establish a constant bound on all graph
metadata. Removal witnesses must remain available to reject old values after
future merges. Safe retirement of that evidence needs a separate causal
stability or graph-epoch contract. Historical payloads also remain in Git;
this issue concerns the live materialized state, not destructive history GC.

The existing dependency stack is #893, then #883. This work starts from the
lifecycle-safe #883 branch and must preserve its late-write and merge tests.

## Validation status and remaining acceptance

The reducer/GC regression initially failed four cases and now passes them.
A 256-pair partition test compares projections, attachments and hashes after
property collection, checkpoint round trips, future joins and subsequent writes.
The changed lifecycle predicate, sweep and lifecycle-record model have 100%
statement, branch, function and line coverage.

The isolated tarball smoke validates existing public CLI behavior, all public
exports/types, and reading/receipt interpretation markers. Its attempted public
remove/re-add scenario exposed [#912](https://github.com/git-stunts/git-warp/issues/912):
a reopened public writer lacks the bounded basis required to publish a removal.
That public-only lifecycle acceptance case remains blocked; internal graph API
and checkpoint/replay tests exercise the lifecycle behavior. This PR stays draft
until the acceptance gap is resolved. Do not claim the removal occurred from a
successful process exit; inspect the write receipt for a derived outcome.
