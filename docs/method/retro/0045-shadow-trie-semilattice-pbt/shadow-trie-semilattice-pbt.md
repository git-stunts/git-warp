# 0045 Retrospective — Shadow-Trie Semilattice Proof

## Conclusion

Hill met.

Cycle `0045` turned the shadow-trie trust claim into repo truth and flushed out
one remaining semilattice bug in the process.

What landed:

- [StateSession.semilattice.property.test.ts](../../../../test/unit/domain/orset/session/StateSession.semilattice.property.test.ts)
  proving commutativity, associativity, idempotency, add-wins semantics, and
  compact safety against in-memory ORSet truth
- a direct structural-sharing regression at the session layer so reopened
  follow-up writes keep reusing untouched subtrees
- a real join fix in
  [JoinReducerSession.ts](../../../../src/domain/services/JoinReducerSession.ts):
  pure tombstoned state is now preserved during session-backed join instead of
  evaporating when the target replica had never seen the raw dot entry

## What changed in repo truth

- `TRUST_shadow-trie-semilattice-pbt` is now done for `v17`
- `PERF_trie-geometry-and-memory-profile` is now the next direct shadow-trie
  trunk task
- the shadow-trie line now has explicit proof coverage for the law it claims to
  implement, not just operational smoke tests

## What worked

- proving the law at the session-backed join seam was the right move; it hit the
  API the runtime actually uses instead of a hypothetical engine surface
- randomized comparison against in-memory ORSet immediately exposed a real
  tombstone-loss bug that narrower example tests had missed
- keeping structural sharing as a direct session/runtime regression prevented
  the proof from blurring algebraic laws with storage behavior

## Drift

Positive drift only.

The cycle reinterpreted the original note slightly: semilattice proof now lives
at `StateSession` + `joinFrames`, while structural sharing stays a direct
session/runtime regression. That is tighter and more truthful than pretending
the internal engine itself exposes a public join surface.

## Next

The next `v17` trunk task is `PERF_trie-geometry-and-memory-profile`. The
shadow-trie line now has law coverage, so the next honest move is to measure
geometry and residency on real workloads instead of continuing to trust the
defaults by taste.
