---
title: "Shadow-trie semilattice proof uses the truthful session seam"
cycle: "0045-shadow-trie-semilattice-pbt"
---

# Shadow-Trie Semilattice Proof

## Why this exists

The shadow-trie trunk is now materially usable:

- [ShadowTrieORSet](../../src/domain/orset/shadow/ShadowTrieORSet.ts)
  persists alive-set truth through the trie substrate
- [StateSession](../../src/domain/orset/session/StateSession.ts)
  exposes the async session seam
- reducer replay, GC, materialization, and builder iteration now all consume
  that seam

What is still missing is the trust proof that this line preserves the CRDT laws
we rely on instead of merely looking plausible.

## Hill

A contributor can now answer:

- where semilattice laws are proven for trie-backed alive-set state
- how the session-backed join seam is compared against the in-memory ORSet
- how compact safety is checked against the same reference semantics
- where structural sharing is still verified at the engine/session layer

## Design goals

1. Prove commutativity, associativity, and idempotency at the truthful
   session-backed join seam.
2. Compare the session-backed result against in-memory
   [ORSet](../../src/domain/crdt/ORSet.ts)
   truth under randomized operation generation.
3. Prove compact safety against the same in-memory reference model.
4. Keep structural sharing verification in the trie/session layer instead of
   faking it through an abstract law-only test.
5. Keep the cycle bounded: no perf work, no geometry tuning, no package moves.

## Non-goals

- No new public `join()` method on `ShadowTrieORSet`.
- No rewrite of `JoinReducerSession`.
- No benchmark harness in this cycle.
- No `MaterializedViewService` or controller changes in this cycle.

## Core diagnosis

The original backlog note said “prove `ShadowTrieORSet` semilattice laws,” but
repo truth is a little sharper now:

- `ShadowTrieORSet` is an internal engine
- the public async alive-set seam is `StateSession`
- the actual join operation on trie-backed state lives at
  [joinFrames](../../src/domain/services/JoinReducerSession.ts)

So the honest proof split is:

- semilattice laws at the session-backed join seam
- direct engine/session verification for compact safety and structural sharing

What this cycle must **not** do is invent a fake public `ShadowTrieORSet.join()`
just to make the tests look mathematically neat.

## Design

### 1. Property-test the session-backed join seam

Generate randomized ORSet operation sequences, build:

- an in-memory `ORSet`
- a session-backed alive-set frame

Then prove:

- `join(a, b) == join(b, a)`
- `join(join(a, b), c) == join(a, join(b, c))`
- `join(a, a) == a`

The reference truth is the in-memory `ORSet`. The session-backed result is
projected back into an `ORSet` shape only for comparison, not because that is
the owning substrate.

### 2. Prove add-wins semantics explicitly

In addition to general semilattice properties, keep one explicit concurrent
add/remove proof so the add-wins law is legible without having to infer it from
 a randomized failure.

### 3. Prove compact safety by comparison

For randomized alive-set states and version vectors:

- compact the in-memory `ORSet`
- compact the trie-backed `StateSession`
- compare the projected results

This proves that trie compaction preserves the same visible result as the
reference implementation.

### 4. Keep structural sharing verification direct

Structural sharing is not a semilattice law. It is a persistence/runtime
property.

So this cycle should keep one direct session/engine regression that proves a
small follow-up write on a reopened root reuses untouched subtrees instead of
rewriting the whole trie.

## Playback questions

### Agent

- Can I point to the exact session-backed join seam being proven?
- Can I explain why the proof compares against `ORSet` without pretending
  `ORSet` is still the owning runtime substrate?
- Can I point to the direct structural-sharing proof and explain why it is not
  a pure semilattice property?

### Human

- Does the trust story now feel mathematically honest rather than hand-wavy?
- Is it clear why `ShadowTrieORSet` itself does not need a new public `join()`?
- Is it clear which parts are law proofs and which parts are persistence/runtime
  regressions?

## Test plan

### Golden path

- property-based commutativity check for session-backed join vs in-memory ORSet
- property-based associativity check for session-backed join vs in-memory ORSet
- property-based idempotency check for session-backed join vs in-memory ORSet
- property-based compact safety check for session-backed state vs in-memory
  ORSet

### Edge cases

- empty states remain identity elements
- duplicate dots stay idempotent
- concurrent add/remove keeps add-wins semantics
- reopened sessions preserve truth across flush/load boundaries

### Known failure modes

- a join implementation that only merges live dots but drops tombstoned dots
  fails the law checks
- compact removes dots that are still causally unsafe to drop
- reopened follow-up writes rewrite whole subtrees instead of preserving
  structural sharing

## Playback

### Witness

The shadow-trie trust proof is backed by:

- [StateSession.semilattice.property.test.ts](../../test/unit/domain/orset/session/StateSession.semilattice.property.test.ts)
- [JoinReducer.stateSession.test.ts](../../test/unit/domain/services/JoinReducer.stateSession.test.ts)
- [ShadowTrieORSet.compaction.test.ts](../../test/unit/domain/orset/shadow/ShadowTrieORSet.compaction.test.ts)
- `npm exec vitest run test/unit/domain/orset/session/StateSession.semilattice.property.test.ts test/unit/domain/services/JoinReducer.stateSession.test.ts test/unit/domain/orset/shadow/ShadowTrieORSet.compaction.test.ts`
- `npm run typecheck`
- `git diff --check`

### Agent

1. *Can I point to the exact session-backed join seam being proven?*
   Yes. The law proof now runs through
   [joinFrames](../../src/domain/services/JoinReducerSession.ts)
   over session-backed alive sets, and the results are projected only for
   comparison against in-memory ORSet truth.

2. *Can I explain why the proof compares against `ORSet` without pretending `ORSet` is still the owning runtime substrate?*
   Yes. `ORSet` is the reference semilattice implementation. The runtime seam
   under proof is still `StateSession` plus `joinFrames`; the projection exists
   only to compare the async line against the established CRDT law.

3. *Can I point to the direct structural-sharing proof and explain why it is not a pure semilattice property?*
   Yes. The session reopen/follow-up write regression in
   [StateSession.semilattice.property.test.ts](../../test/unit/domain/orset/session/StateSession.semilattice.property.test.ts)
   proves structural sharing as a persistence/runtime property, not as a
   lattice axiom.

### Human

1. *Does the trust story now feel mathematically honest rather than hand-wavy?*
   Yes. The cycle now proves the join laws, compact safety, and a concrete
   add-wins case under randomized comparison with the in-memory ORSet.

2. *Is it clear why `ShadowTrieORSet` itself does not need a new public `join()`?*
   Yes. The semilattice proof targets the actual public async join seam instead
   of inventing a fake engine API that the runtime does not use.

3. *Is it clear which parts are law proofs and which parts are persistence/runtime regressions?*
   Yes. The property tests prove CRDT laws; the structural-sharing regression
   proves a storage/runtime guarantee.

Verdict: pass.

## Drift check

No negative drift.

Positive drift only:

- the cycle proved the laws at the session-backed join seam rather than on a
  hypothetical `ShadowTrieORSet.join()` surface, which is more honest than the
  original backlog wording
- the red matrix exposed and fixed one real law bug: pure tombstone state was
  still disappearing during session join when the target replica had never seen
  the raw dot entry
