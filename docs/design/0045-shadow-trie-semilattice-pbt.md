---
title: "Shadow-trie semilattice proof uses the truthful session seam"
cycle: "0045-shadow-trie-semilattice-pbt"
---

# Shadow-Trie Semilattice Proof

## Why this exists

The shadow-trie trunk is now materially usable:

- [ShadowTrieORSet](/Users/james/git/git-stunts/git-warp/src/domain/orset/shadow/ShadowTrieORSet.ts)
  persists alive-set truth through the trie substrate
- [StateSession](/Users/james/git/git-stunts/git-warp/src/domain/orset/session/StateSession.ts)
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
   [ORSet](/Users/james/git/git-stunts/git-warp/src/domain/crdt/ORSet.ts)
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
  [joinFrames](/Users/james/git/git-stunts/git-warp/src/domain/services/JoinReducerSession.ts)

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
