---
title: "Checkpoint envelope publication"
cycle: "0033-checkpoint-envelope-publication"
design_doc: "docs/design/0033-checkpoint-envelope-publication.md"
outcome: pivot
drift_check: yes
next_cycle_design_doc: "docs/design/0034-unify-seek-cache-and-checkpoints.md"
---

# Cycle 0033 Retro — Checkpoint Envelope Publication

**Status:** PIVOT

## Hill

Publish trie-backed checkpoints through a new schema-5 envelope tree so
runtime checkpoint creation and load stop depending on `state.cbor`
full-state blobs.

## What we learned

### The repo already has two snapshot systems

The cycle started from the assumption that "checkpoint" and
"seek-cache snapshot" were different enough to justify separate
substrates.

Playback against repo truth showed otherwise:

- named checkpoints persist materialized state so replay can resume
  from a known point
- seek-cache entries persist materialized state so coordinate reads can
  resume from a known point
- both are coordinate-bound materialization artifacts

The current split is mostly one of lifetime and completeness, not of
kind.

### The noun split is misleading

The seek-cache path is materially doing checkpoint work:

- materialize a full graph state
- persist it in `@git-stunts/git-cas`
- restore it later to avoid replay

Calling one artifact family "checkpoint" and the other "cache" hides
the actual design problem. The codebase currently has two snapshot
systems with different names, different metadata, and different
retention policies.

### The schema namespace is already muddy

The red work also surfaced that checkpoint schema numbers currently mix
multiple unrelated dimensions:

- layout shape
- presence of `index/`
- "V5" historical naming

That made the original "schema 5 envelope" move feel more local and
incremental than it really is.

## What ground was taken

### RED matrix landed

The cycle did produce useful failing evidence:

- runtime checkpoint creation still emits schema `4`
- runtime checkpoint trees still publish `state.cbor`
- runtime checkpoint load still rejects schema `5`
- shipped runtime still accepts legacy schemas `2`, `3`, and `4`

Those reds are now committed and preserved as the proof that the old
snapshot split remains live.

### Pivot decision

This cycle is closing early because the next truthful step is not
"green schema-5 checkpoint envelopes in isolation."

The next truthful step is to unify the two snapshot systems and only
then decide how pinned checkpoints, evictable coordinate snapshots, and
shared artifact schemas should relate.

## Why the hill is not the right next hill

If we greened the original cycle as written, we would likely harden a
new checkpoint-only substrate while leaving the seek-cache path on a
second, weaker snapshot format.

That would preserve the very duplication the cycle uncovered.

The right next design question is:

> If any materialized coordinate result can become a checkpoint, what
> is the one snapshot artifact shape that both systems should share?

## What comes next

Next pull:

- [0034-unify-seek-cache-and-checkpoints.md](../../../design/0034-unify-seek-cache-and-checkpoints.md)

That design card is the direct successor to this cycle. It will decide:

1. one shared snapshot/checkpoint artifact shape
2. which metadata is mandatory for all snapshots
3. how an evictable coordinate snapshot is promoted into a pinned
   checkpoint
4. whether "checkpoint" and "seek cache" should survive as policy nouns
   only, rather than substrate nouns

## Playback

### Agent

1. *Did cycle 0033 prove the original checkpoint path is still blob
   centric?*
   Yes.
2. *Did cycle 0033 prove the runtime still treats coordinate snapshots
   and checkpoints as separate systems?*
   Yes.
3. *Would greening the original design as-is risk preserving two
   snapshot substrates?*
   Yes.
4. *Is the next correct move a pivot rather than a straight green?*
   Yes.

### Human

Deferred to review.

## Drift

- The cycle opened as a checkpoint-envelope implementation slice and
  closed as an architectural pivot.
- No green implementation was attempted after the pivot call.
- Live planning references were updated to point at the direct design
  successor instead of the deleted backlog note.

## What remains

The concrete remaining work is not in this retro. It is now captured in
the next design card:

- [0034-unify-seek-cache-and-checkpoints.md](../../../design/0034-unify-seek-cache-and-checkpoints.md)
