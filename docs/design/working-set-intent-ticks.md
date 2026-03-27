# RFC: Working-Set Intent Queues and Deterministic Ticks

**Status:** DESIGN
**Date:** 2026-03-25
**Scope:** First honest write-side substrate slice for speculative working-set evolution

> Update 2026-03-26: this note remains useful for queue/tick mechanics, but its
> public noun model is now constrained by
> [`docs/design/worldline-observer-working-set-model.md`](./worldline-observer-working-set-model.md).
> In particular, `WarpGraph` should be read as the immutable snapshot noun, and
> working sets should be treated as speculative child-worldline handles rather
> than merely overlay descriptors.

---

## Problem

git-warp working sets already pin a base observation, carry an overlay, braid
support overlays, materialize deterministically, and produce comparison and
transfer facts.

What they still do not do is behave like speculative future lanes.

Today, higher layers can mutate a working set only by committing overlay patches
immediately through `patchWorkingSet()`. That is useful plumbing, but it is not
yet the write-side model we want higher layers to think in.

The missing substrate step is:

- queue intent against a working set
- drain that queue deterministically as a tick
- admit independent rewrites together
- reject conflicting rewrites for that tick
- advance only the speculative lane
- record the rejected alternatives as substrate facts

Without that, higher layers will keep reinventing future-search, bundle
admission, and counterfactual bookkeeping above the substrate.

---

## Direction

The first bounded write-side slice should add three public working-set
capabilities:

1. **Queue intent**
   - enqueue a patch-shaped candidate rewrite against a working set
   - do not change the visible working-set overlay yet

2. **Inspect intent queue**
   - list queued intents deterministically
   - keep queue identity stable across repeated reads

3. **Tick a working set**
   - drain the queue deterministically
   - admit only footprint-independent intents into the same speculative tick
   - reject conflicting intents for that tick
   - advance only the working-set overlay
   - leave live truth unchanged
   - return and persist deterministic counterfactual facts for the rejected
     intents

---

## Public Semantics

### Queue

Queued intents are substrate facts attached to a working set descriptor. They
are not yet canonical graph truth and they are not yet part of the working-set
overlay patch chain.

Each queued intent should minimally carry:

- `intentId`
- enqueue timestamp
- the patch-shaped rewrite payload
- its normalized footprint (`reads`, `writes`)

For this first slice, the patch payload may stay close to existing `PatchV2`
shape so git-warp does not invent a second rewrite language.

### Tick

A working-set tick is a deterministic queue-drain step over one working set.

For this first slice:

- queued intents are sorted deterministically
- a candidate intent is admitted only when its footprint does not overlap with
  the already-admitted footprint for that tick
- conflicting intents are rejected from that tick and recorded as
  counterfactuals
- admitted intents are committed onto the target working-set overlay in that
  same deterministic order

### Counterfactuals

Counterfactuals in this slice are mechanical substrate facts only:

- which intent was rejected
- why it was rejected
- which admitted intent(s) it overlapped with
- what the rejected footprint was

git-warp does not assign business meaning to these facts.

---

## Non-Goals

This slice does **not** yet require:

- human or agent policy
- case/decision semantics
- automatic collapse into live truth
- multi-working-set search orchestration
- worldline governance
- full BTR packaging for every working-set tick
- fancy scoring or outcome ranking

Those remain higher-layer concerns or later substrate slices.

---

## Initial Boundedness

To keep this first tick slice honest:

- live truth must not advance
- sibling working sets must not change
- queued intents may be persisted in the working-set descriptor
- a small tick record on the descriptor is acceptable
- durable queue/tick refs can come later if growth or replay pressure demands it

This is the first honest primitive, not the final storage architecture.

---

## Expected Public Shape

The first public API slice should look roughly like:

- `queueWorkingSetIntent(workingSetId, build)`
- `listWorkingSetIntents(workingSetId)`
- `tickWorkingSet(workingSetId)`

`patchWorkingSet()` remains valid plumbing for direct overlay mutation, but the
preferred speculative-lane story should start shifting toward queue + tick.

---

## Spec Expectations

The executable spec for this slice should prove at least:

1. queueing intents does not mutate the working set or live truth
2. ticking a working set admits independent intents in deterministic order
3. conflicting intents are rejected and recorded as counterfactuals
4. ticking one working set does not affect sibling working sets
5. ticking a working set advances only its overlay

---

## Follow-Ons

Once this slice is solid, later substrate work can add:

- richer intent envelopes
- durable tick/BTR packaging
- multi-lane candidate evaluation helpers
- transfer/collapse from a selected speculative lane
- explicit worldline handles that compose observer + working-set semantics more
  directly
