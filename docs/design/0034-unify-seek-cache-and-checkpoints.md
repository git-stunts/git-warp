---
title: "Unify seek cache and checkpoints"
cycle: "0034-unify-seek-cache-and-checkpoints"
pivot_from: "docs/design/0033-checkpoint-envelope-publication.md"
---

# Unify Seek Cache and Checkpoints

## Why this exists

Cycle 0033 established that the repo currently has two persisted
materialization systems:

- named checkpoints
- coordinate snapshots currently called seek-cache entries

Both are materialized graph snapshots. Both exist to avoid replay.
They differ mainly in retention policy, public naming, and metadata
completeness.

That means the next honest design question is not "how do we invent a
new checkpoint-only envelope?" It is "what is the one snapshot
substrate both systems should share?"

## Working premise

Any materialization result keyed by a coordinate is *potentially a
checkpoint*.

The likely end state is:

- **evictable snapshot** — current "seek cache" role
- **pinned checkpoint** — current named checkpoint role

Both should share one artifact shape and one promotion path.

## Questions this cycle must settle

1. What metadata is required for every snapshot artifact?
   Candidate set:
   - state payload
   - coordinate descriptor
   - writer frontier
   - appliedVV
   - state hash
   - provenance index or explicit "degraded provenance" marker
   - optional index tree OID

2. Is the artifact itself native-Git, CAS-backed, or hybrid?
   We already know trie-root reachability matters. We also already know
   git-cas is being used for persisted coordinate snapshots.

3. What is the promotion operation?
   If a coordinate snapshot already exists, can `createCheckpoint()`
   pin it rather than rewrite the world?

4. What is the retention law?
   If cache entries and checkpoints are the same artifact class, then
   "cache vs checkpoint" should become a policy bit:
   - evictable
   - pinned

5. What metadata differences are still acceptable?
   If pinned checkpoints need more metadata than evictable snapshots,
   is that a version of the same artifact or two wrappers around one
   substrate?

## Starting observations

### Coordinate snapshots are already checkpoint-like

`MaterializeController` already:

- computes a coordinate key
- restores a serialized full state on cache hit
- persists a serialized full state on cache miss

That is checkpoint behavior with weaker guarantees.

### Named checkpoints are currently stronger but duplicated

Named checkpoints currently carry additional replay/folding semantics,
but they are still snapshots. If they keep a separate substrate, the
repo will continue paying duplication tax.

### The current checkpoint schema namespace is muddled

The existing checkpoint schema numbers currently mix:

- blob/tree layout choices
- presence of `index/`
- legacy "V5" era naming

This cycle should separate those concepts before adding any further
numbering.

## Candidate direction

One possible target:

1. Define one **snapshot descriptor**
2. Define one **snapshot payload/artifact shape**
3. Let "seek cache" mean "evictable snapshot index"
4. Let "checkpoint" mean "pinned snapshot ref"
5. Let promotion be "convert an existing snapshot from evictable to
   pinned without rewriting payload unless metadata needs upgrading"

That is only a candidate. The cycle still needs to decide whether the
shared artifact should be:

- full-state blob in CAS
- envelope tree with trie-root reachability
- hybrid descriptor + payload split

## Output expected from this cycle

By the end of cycle 0034 we should have:

1. one noun map for snapshot / checkpoint / cache
2. one chosen shared artifact model
3. one promotion story from coordinate snapshot to pinned checkpoint
4. one migration/compatibility posture for current schema 2/3/4 and
   current seek-cache entries
