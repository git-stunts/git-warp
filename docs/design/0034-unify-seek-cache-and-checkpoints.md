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

## Design goals

1. Unify the current seek-cache system and checkpoint system into one
   **WarpState snapshot cache**.
2. Make a checkpoint mean only one thing:
   - a cached WarpState snapshot marked **safe from removal**
3. When materializing at target coordinate `t`:
   - first try exact snapshot lookup for `t`
   - if absent, find the nearest earlier compatible snapshot
   - replay only the remaining ticks / patches from that snapshot to `t`
4. Allow pinned checkpoints to age out only by explicit policy, not by
   ordinary cache eviction.

## Core law

There is one snapshot substrate.

The repo should stop treating these as different species:

- named checkpoints
- seek-cache entries

Instead:

- **snapshot** = persisted materialized WarpState at a coordinate
- **pinned snapshot** = snapshot protected from ordinary eviction

That makes "checkpoint" a retention / promotion policy, not a separate
storage ontology.

## Coordinate identity

The design must define one canonical snapshot key.

The current code already implies that a coordinate is not just a scalar
tick. It is at least:

- frontier
- ceiling / tick boundary

So the snapshot identity cannot be just `tick = t` unless the repo
proves there is exactly one relevant frontier at each tick. Until then,
the canonical identity should remain a coordinate-shaped key:

- `frontier`
- `ceiling`

Optional derived fields:

- coordinate hash / cache key
- state hash
- max observed lamport

## Lookup contract

Snapshot lookup should work in two phases.

### 1. Exact lookup

Try exact coordinate hit:

- same frontier
- same ceiling

If present, restore directly.

### 2. Predecessor lookup

If exact lookup misses, find the nearest earlier **compatible**
snapshot.

Important: "earlier" cannot mean only "smaller tick".

The candidate snapshot must be replay-safe:

- snapshot ceiling must be `<=` target ceiling
- snapshot frontier must be causally no later than target frontier

That means predecessor search is not just numeric ordering. It is
coordinate compatibility plus recency.

## Candidate predecessor algorithm

Start with a simple truthful rule:

1. Collect snapshots whose ceiling is `<= target.ceiling`
2. Filter to snapshots whose frontier is causally no later than the
   target frontier
3. Choose the candidate with the greatest ceiling
4. Break ties by preferring the most specific frontier match

This can start with a simple sorted index and become more elaborate
later if the repo proves it needs more.

The first correctness law is:

> never resume from a snapshot that is newer than the target or
> incomparable to the target frontier.

## Snapshot descriptor requirements

Every snapshot probably needs at least:

- serialized state payload or state roots
- frontier
- ceiling
- state hash
- appliedVV
- provenance posture:
  - full provenance index
  - or explicit degraded marker
- optional index tree OID
- retention mode:
  - evictable
  - pinned

Without this, promotion from snapshot to pinned checkpoint becomes
guesswork rather than a metadata toggle.

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

6. What is the minimum metadata required for promotion without rewrite?
   If a coordinate snapshot already exists, can the system mark it
   pinned in place, or does it need a descriptor/index upgrade first?

7. What should happen when a caller requests receipts / provenance-rich
   replay and the best predecessor snapshot is degraded?
   The design must say whether:
   - degraded snapshots are forbidden for those paths
   - degraded snapshots are allowed but force replay/provenance rebuild
   - all pinned snapshots must carry full provenance

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

### Native reachability still matters

Even if seek-cache and checkpoint unify conceptually, the design still
has to answer a storage question:

- if trie roots must remain Git-reachable for GC safety, the shared
  snapshot substrate may need native-Git structure
- if CAS remains the payload store, the system may need a hybrid model
  where descriptor / payload / pinning are separated cleanly

So the unification target is "one snapshot system", not
"blindly store everything the current seek cache stores."

## Candidate direction

One possible target:

1. Define one **snapshot descriptor**
2. Define one **snapshot payload/artifact shape**
3. Let "seek cache" mean "evictable snapshot entry"
4. Let "checkpoint" mean "pinned snapshot ref or pinned snapshot mark"
5. Let promotion be "convert an existing snapshot from evictable to
   pinned without rewriting payload unless metadata needs upgrading"

That is only a candidate. The cycle still needs to decide whether the
shared artifact should be:

- full-state blob in CAS
- envelope tree with trie-root reachability
- hybrid descriptor + payload split

## Real plan

The plan should separate **logical unification** from **physical
storage unification**.

That means:

1. unify the noun and control plane first
2. unify lookup and promotion semantics next
3. only then finish substrate convergence

This avoids cementing two snapshot systems while still leaving room to
handle native-Git reachability honestly.

### Step 1 — define one snapshot descriptor

Introduce one runtime-backed snapshot descriptor concept, for example:

- `WarpStateSnapshot`

And one owning system noun, for example:

- `WarpStateCache`

The repo should stop modeling:

- seek cache metadata over here
- checkpoint metadata over there

Instead, every persisted materialization result becomes a
`WarpStateSnapshot` with:

- coordinate
- state hash
- payload location
- provenance posture
- retention mode

### Step 2 — exact lookup + predecessor lookup

`MaterializeController` should stop talking directly in terms of
"seek-cache fast path".

Instead it should ask one snapshot resolver:

1. find exact snapshot for coordinate
2. if absent, find best compatible predecessor
3. restore and replay from there

Start with a simple truthful index:

- exact map by coordinate hash
- secondary ordering by descending ceiling

Each descriptor must store the full frontier, not just a frontier hash,
because predecessor search needs real compatibility checks.

Compatibility rule:

- candidate ceiling `<=` target ceiling
- candidate frontier causally no later than target frontier

Selection rule:

- choose greatest compatible ceiling
- break ties by frontier specificity / closeness

This can be implemented with a simple descending scan first. No need to
invent a fancy index before the repo proves it needs one.

### Step 3 — make checkpoint creation a pin operation

`createCheckpoint()` should stop meaning "serialize a second species of
artifact."

It should mean:

1. resolve or create the snapshot for the requested coordinate
2. mark that snapshot as pinned
3. publish any stable name / ref needed for checkpoint discovery

So the happy-path checkpoint flow becomes:

- exact snapshot already exists -> pin it
- exact snapshot missing -> materialize once, persist once, pin it

This is the key simplification:

> checkpoint creation is snapshot promotion, not separate snapshot
> invention.

### Step 4 — allow storage-class promotion when pinning

Logical unification does **not** require pretending the current CAS
seek-cache payload is already sufficient for durable checkpoints.

If the current evictable snapshot substrate cannot satisfy checkpoint
durability or reachability requirements, pinning may need to promote the
payload into a stronger storage class.

So the descriptor likely needs a field like:

- `storageKind: 'evictable-cas' | 'durable-git' | 'durable-cas'`

Then "checkpoint = safe from removal" remains true at the policy level,
while the implementation is free to strengthen storage on promotion.

This is still one snapshot system. It just acknowledges that not every
payload backing has the same retention guarantees.

### Step 5 — retention policy

Retention should become policy on one artifact family.

Initial rule set:

- **evictable snapshots**
  - subject to LRU / age / count limits
- **pinned snapshots**
  - excluded from ordinary eviction
  - removed only by explicit user action or explicit checkpoint policy

Do **not** start by auto-dropping pinned snapshots because they are
"too clustered." That can come later, but only after the pinning law is
trusted. Otherwise "safe from removal" stops meaning what it says.

### Step 6 — staged rollout

The rollout should be:

1. define unified snapshot nouns and descriptor
2. introduce exact + predecessor lookup
3. route coordinate materialization through the unified snapshot resolver
4. make `createCheckpoint()` pin/promote snapshots
5. retire the old split vocabulary (`seek cache` vs `checkpoint`) where
   it no longer reflects real behavior
6. migrate legacy checkpoint schemas and old seek-cache entries into the
   new descriptor/index model

This order matters. It lets the repo stop lying about the two systems
before every last payload/storage detail is perfect.

## Immediate decisions

If we follow the plan above, the first concrete decisions should be:

1. **Use coordinate, not tick, as identity**
   "tick = t" is not enough in a multi-writer graph. The identity has
   to include frontier + ceiling.

2. **Use one snapshot descriptor**
   The system should not maintain separate checkpoint and seek-cache
   descriptor/index formats.

3. **Treat checkpoints as pinned snapshots**
   That is the public semantic contract.

4. **Allow promotion to rewrite backing storage if needed**
   That is the implementation escape hatch that keeps the public model
   clean without lying about GC/reachability guarantees.

## Output expected from this cycle

By the end of cycle 0034 we should have:

1. one noun map for snapshot / checkpoint / cache
2. one chosen shared artifact model
3. one promotion story from coordinate snapshot to pinned checkpoint
4. one migration/compatibility posture for current schema 2/3/4 and
   current seek-cache entries
5. one exact-match + predecessor lookup law for materialize-at
