# Membership compaction safety

The eager `ORSet.compact(includedVV)` and trie-backed
`StateSession.compact(includedVV)` retain membership entries and tombstones.
Their signatures remain available, but they retire no membership evidence.
Supported GC and checkpoint preparation likewise retain this evidence while
the eager property sweep can reclaim dominated property payloads.

An applied version vector records observed additions. It does not prove that
every replica has observed their removal, exclude a stale replica, or fence
later replay. Even observing an addition on every replica is insufficient:
a replica holding the addition without its tombstone can still rejoin.
Dropping both records lets union-based joins resurrect the element.

Retaining the evidence keeps all otherwise valid future joins and replays
admissible. A removed dot stays removed, including through clone and checkpoint
round trips. An unobserved addition with a different dot remains live under
observed-remove semantics, even if its dot is covered by the supplied vector.
Property-clear evidence must not be used to reject that concurrent addition.

This preservation contract fixes [#911](https://github.com/git-stunts/git-warp/issues/911)
without claiming safe tombstone retirement or a constant bound on metadata.
Entries and tombstones can grow with history. Compaction makes no page reads,
page writes, or trie reshaping; normal add, remove, flush and reopen operations
continue to use their existing page contracts. A future retirement mechanism
needs its own enforceable causal stability or epoch/fencing contract and must
account for admissible stale joins before it can discard evidence.

The deterministic acceptance witness compares removed and concurrent node/edge
membership across eager joins, direct replay, GC, serialized checkpoints, trie
branches and repeated close/reopen. The unchanged unsafe implementation fails
stale-join and retained-evidence checks. Internal WarpCore checkpoint/GC regression checks
must also stay green; retaining evidence does not change visible membership.
