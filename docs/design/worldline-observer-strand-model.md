# RFC: Worldlines, Immutable WarpGraphs, Observers, and Strands

**Status:** DESIGN
**Date:** 2026-03-26
**Scope:** Public substrate rewrite for git-warp's core nouns and boundaries

> Update 2026-03-27: the naming proposal in this note is superseded by
> [`docs/design/warpstate-runtime-noun-split.md`](./warpstate-runtime-noun-split.md).
> The current preferred split is `WarpRuntime` for the mutable/session host and
> `WarpState` for the immutable materialized snapshot.

---

## Purpose

This note captures the stronger model now intended for git-warp after the
docs-first observer/strand checkpoint.

The previous boundary note correctly identified that observers should be the
preferred read-side abstraction and strands the preferred speculative
write abstraction. That note did **not** go far enough on the underlying noun
split.

The public model should be:

- `Worldline` is the append-only causal history handle
- `WarpGraph` is the immutable materialized snapshot at one coordinate
- `Observer` is an immutable read-only view over a worldline coordinate
- `Strand` is the speculative write handle over a child worldline
- `BTR` is the causal boundary/hologram appended to a worldline on each tick

This is a stronger statement than "WarpGraph is plumbing." It means the current
mutable/session-shaped `WarpGraph` API is the wrong noun for the long-term
surface and should be decomposed or renamed accordingly.

---

## Core Thesis

git-warp should model a distributed system as a field of observers over shared
causal history.

The canonical substrate object is **not** a mutable graph session. The
canonical substrate objects are:

1. an append-only worldline of BTRs
2. an immutable materialized WARP snapshot at a worldline coordinate
3. observer-relative projections over that immutable snapshot
4. child worldlines used for speculative ticking

In that model:

- materialization is replay
- replay produces immutable snapshots
- observers never mutate snapshots
- strands never mutate canonical worldlines directly
- ticks append new BTRs to child worldlines
- transfer/collapse remains a later explicit move between worldlines

---

## Why The Current Model Is Insufficient

The current git-warp implementation still centers a mutable `WarpGraph`
instance that:

- owns cached state
- is retargeted by coordinate materialization
- is retargeted by strand materialization
- is then wrapped by snapshotting helpers to simulate independent reads

That shape is serviceable for incremental evolution, but it bakes in the wrong
ontology:

- `WarpGraph` looks like a live mutable session instead of an immutable graph
- "materialize" looks like mutating one handle instead of producing a snapshot
- observers look like filtered wrappers around mutable substrate plumbing
- strands look like overlay patch logs instead of child worldlines with
  tick semantics

Because major-version API changes are acceptable, git-warp should correct the
ontology directly instead of preserving the current noun split indefinitely.

---

## Canonical Nouns

### `WarpGraph`

`WarpGraph` should mean one thing only:

- an immutable materialized WARP graph snapshot at one worldline coordinate

Properties:

- read-only
- hash-stable
- attachment-inclusive
- safe to cache by content address
- safe to hand to multiple observers simultaneously
- incapable of being advanced, patched, or dirtied in place

If a caller has a `WarpGraph`, they already have a snapshot, not a live
session.

### `Worldline`

A `Worldline` is an append-only causal history graph that can produce
`WarpGraph` snapshots by replay.

Operationally, a worldline is:

- a worldline identity
- a lineage relation to zero or one parent worldline
- an ordered sequence of BTRs
- optional checkpoints over materialized snapshots
- a current frontier coordinate

Conceptually, it is a linked list of immutable BTRs with shared-prefix reuse
via content addressing.

### `Observer`

An `Observer` is the read porcelain:

- read-only
- worldline-relative
- coordinate-aware
- aperture-bearing
- potentially accumulation-bearing
- unable to tick or mutate history

An observer should be treated as immutable. Seeking should return a **new**
observer bound to a different lawful coordinate instead of mutating the current
observer in place.

### `Strand`

A `Strand` is the speculative write porcelain:

- a child worldline
- an observer-relative read surface over that child worldline
- an intent queue
- deterministic tick semantics
- BTR emission on successful tick

The strand does not mutate its parent worldline. It appends to its own
child worldline, which shares prefix history structurally with its ancestor.

### `BTR`

Each committed tick produces a `Boundary Transition Record`:

- boundary identity for the tick
- input coordinate / input snapshot hash
- output coordinate / output snapshot hash
- admitted rewrite bundle
- rejected counterfactual rewrites
- tick receipts and related provenance payloads
- enough replay information to reconstruct the successor snapshot

The BTR is the worldline entry. It is the causal/holographic record of what
happened at that tick.

---

## Naming Proposal

To avoid repeating the current confusion, the naming split should be:

- `WarpGraph`: public immutable materialized snapshot
- `WarpState`: internal in-memory structural representation used during replay
- `ObserverProjection`: optional derived observer-filtered cached view
- `Worldline`: public history handle
- `Strand`: public speculative child-worldline handle

The current mutable/session façade should be renamed away from `WarpGraph`.
Placeholder names:

- `WarpRepository`
- `WarpStore`
- `WarpRuntime`

This document does not force the exact replacement name, only that the mutable
host object must stop using the `WarpGraph` noun.

---

## Coordinates, Identity, and Cache Keys

We should distinguish **semantic coordinates** from **content-addressed
identity**.

### Semantic coordinate

The natural observer/worldline coordinate is:

\[
  c = (\texttt{worldlineId}, t)
\]

where \( t \) is the tick index on that worldline.

This is the right API-level coordinate because:

- it is stable for observers
- it matches worldline semantics
- multiple observers can occupy different ticks on the same worldline
- a strand can append beyond previously observed ticks without changing
  what an existing observer sees

### Content identity

The natural snapshot identity is:

\[
  h_c = \operatorname{Hash}(\texttt{WarpGraph}_c)
\]

or equivalently a BTR-bound boundary identity derived from the relevant
input/output hashes.

This is the right storage-level identity because:

- it enables deduplication across worldlines sharing equivalent states
- it supports Git / CAS caching directly
- it supports stable replay verification
- it decouples content address from coordinate lookup

### Resulting rule

git-warp should use **two keys**:

- lookup key: `(worldlineId, tick)`
- dedupe/cache key: `warpGraphHash` or the equivalent BTR boundary hash

That is better than choosing only one.

If two different worldlines materialize the same immutable snapshot, they
should remain different coordinates but may reuse the same cached content.

---

## Materialization Model

Materialization should mean:

\[
  \texttt{materialize}(W, t)
  =
  \operatorname{Replay}(\texttt{checkpoint}_{\le t}, \texttt{BTR suffix}_{\le t})
  \to \texttt{WarpGraph}_{(W,t)}
\]

where:

- `W` is a worldline
- `t` is the target tick on that worldline
- replay starts from the latest valid checkpoint at or before `t`
- the remaining ordered BTR suffix is replayed deterministically
- the result is an immutable `WarpGraph`

### Materialization invariants

Materialization must:

- be deterministic
- be replayable from boundary data
- include the attachment plane transitively
- produce an immutable result
- produce a stable hash
- be cacheable in Git / git-cas
- never mutate a previously materialized snapshot

### Checkpoints

A checkpoint is a cached immutable `WarpGraph` plus enough boundary metadata to
resume replay correctly.

Checkpoints are performance artifacts, not authoritative truth. The worldline
and its BTR chain remain authoritative.

### Read-only rule

Every materialized `WarpGraph` is read-only. That includes:

- node plane
- edge plane
- property plane
- attachment plane
- any derived handles directly exposing those structures

If a snapshot can be mutated in place, it is not a `WarpGraph`.

---

## Observer Model

Observer Geometry supplies the right mental model here: an observer is not just
a filter. It is a structural observer with projection and, when needed,
accumulation.

At the git-warp API boundary, an `Observer` should therefore bind:

- a `Worldline`
- a coordinate on that worldline
- an aperture / projection policy
- optionally a native basis and accumulation structure

### Observer semantics

An observer:

- reads from a `WarpGraph` at one coordinate
- may expose filtered nodes, edges, properties, and provenance according to
  its aperture
- may accumulate additional observational state over a prefix chain
- cannot observe beyond the worldline frontier
- cannot append to the worldline

### Observer seeking

Seeking should be a pure operation:

\[
  \texttt{observer.seek}(t') \to \texttt{Observer}'
\]

where `Observer'` is a new immutable observer on the same worldline and
aperture at coordinate `t'`.

This avoids reintroducing mutable-handle instability at the observer layer.

### Observer-specific caches

Observers may maintain derived caches of filtered views, but those caches are:

- optional
- derived
- observer-relative
- non-authoritative

The canonical truth remains the immutable unfiltered `WarpGraph` at the
worldline coordinate.

If cached, the derived observer cache key should include observer structure,
not just worldline position. A reasonable derived key is:

\[
  (\texttt{observerSignature}, \texttt{worldlineId}, t)
\]

or equivalently:

\[
  (\texttt{observerSignature}, \operatorname{Hash}(\texttt{WarpGraph}_{(W,t)}))
\]

where `observerSignature` captures the observer's aperture and any future
basis/accumulation semantics that affect emitted structure.

If we cache these derived observer-relative values, `ObserverProjection` is a
better noun than `WarpGraph` or `WarpState`.

---

## Strand Model

A `Strand` is a writable child worldline with deterministic tick semantics.

It should be understood as:

- a child of an ancestor worldline
- a speculative continuation with shared prefix history
- an observer-backed read surface over its current frontier
- an intent queue plus deterministic tick engine

### Parent / child behavior

If strand `C` is forked from worldline `P` at tick \( t_f \):

- `C` inherits `P`'s history through \( t_f \)
- `C` may append its own BTR suffix after \( t_f \)
- later ticks on `P` do **not** automatically advance `C`
- later ticks on `C` do **not** mutate `P`

The relationship is shared-prefix and causally entangled, not "live following."

### Braids

Braids should be understood primarily as lineage and causal-entanglement
structure across related worldlines, not merely as an implementation trick for
overlay composition.

Operationally, braids may still use read support overlays or similar storage
mechanisms, but the semantic model is:

- related worldlines share ancestry
- related worldlines may observe and compare one another
- shared-prefix history is reused structurally
- speculative descendants remain separate causal lanes

---

## Intent And Tick Model

The write path should be:

1. enqueue graph rewrite intents against a strand
2. compute the deterministic rewrite bundle for one tick
3. emit a BTR for that tick
4. append the BTR to the strand's child worldline
5. materialize and cache the resulting immutable frontier snapshot

### Intent

An intent proposes a graph rewrite and declares its footprint.

The footprint must include:

- nodes read
- nodes written
- edges read
- edges written
- deletes
- anchors / existence preconditions

Attachment-plane reads or writes count against the owning node or edge
footprint. There is no separate loophole for attachments.

### Tick

Ticking a strand means:

1. sort queued intents deterministically
2. iterate through intents in that order
3. admit an intent only if its footprint does not overlap with the already
   admitted set
4. reject conflicting intents as counterfactuals
5. apply the admitted rewrites to the strand frontier `WarpGraph`
6. emit a BTR carrying the admitted set, receipts, and rejected
   counterfactuals
7. append that BTR to the child worldline as the new strand frontier

Because admitted footprints are disjoint, rewrite application order inside the
bundle should be semantically irrelevant.

### Rewrite engine

The rewrite engine should be described as double-pushout rewriting over WARP
graphs and their attachment structure.

git-warp should expose deterministic tick behavior and replayable BTRs. It
should not embed higher-layer governance, policy, or product semantics.

---

## Snapshot Hashing

The immutable snapshot hash for a `WarpGraph` must cover:

- visible node/edge/property structure
- recursive attachment plane content transitively
- attachment metadata
- any canonicalized structural encoding needed for deterministic hashing

This is required because WARP is recursive. A snapshot hash that ignores the
attachment plane is incomplete.

Stated differently:

\[
  \operatorname{Hash}(\texttt{WarpGraph})
\]

must be a function of the full recursive object, not only the top-level wiring
plane.

---

## Deletion, Liveness, and Borrow Semantics

Worldline-relative deletion should be observer-relative absence, not immediate
physical erasure.

If a node or edge is deleted on one worldline but still needed by a descendant
or sibling worldline that shares ancestry, it may remain physically
materialized and content-addressed until no worldline still depends on it.

That implies a liveness model closer to borrow checking / shared-prefix reach
tracking than to eager destructive deletion.

Consequences:

- observer-visible absence is worldline-relative
- physical GC must be lineage-aware
- attachment blobs remain live while their owning recursive structure is still
  reachable from any retained worldline

---

## Public API Direction

This document intentionally points toward a major-version rewrite.

### Read side

The public read story should look like:

```javascript
const repo = await WarpRepository.open({});
const worldline = await repo.openWorldline('live');

const graph = await worldline.materialize({ tick: 42 });
const observer = await worldline.observe('public', {
  tick: 42,
  match: 'task:*',
  redact: ['internalNotes'],
});

const earlier = observer.seek(12);
```

### Write side

The public speculative story should look like:

```javascript
const strand = await worldline.forkStrand({
  strandId: 'plan-rewrite',
  atTick: 42,
  retention: 'scratch',
});

await strand.queueIntent(intentA);
await strand.queueIntent(intentB);

const tick = await strand.tick();
const nextGraph = await strand.materialize();
await strand.promote({ visibility: 'shared' });
```

This note does **not** fix the exact method names. It fixes the noun model and
the semantic direction.

---

## Debugger Time Versus Substrate Time

The substrate model and the human debugger model should be separated
deliberately.

### Substrate time

At the substrate level:

- worldlines may tick independently
- strands may tick independently
- parent and child worldlines do not advance in lockstep
- observers remain pinned to their own coordinates unless explicitly re-seeked

This independent-causality model is the truthful ontology.

### Debugger time

For human DX, especially in a Time Travel Debugger with playback controls, a
single global playback cursor is often easier to reason about than a bag of
independent coordinates.

That debugger cursor should therefore be treated as a **derived composite
coordinate**, not as proof that all worldlines share one real tick clock.

One useful model is:

\[
  \texttt{DebuggerFrame} = (g, \{\, c_W(g) \,\}_{W \in \mathcal{A}})
\]

where:

- \( g \) is a global debugger-frame index over a merged event stream
- \( \mathcal{A} \) is the set of active worldlines/strands in the current
  debugger session
- \( c_W(g) \) is the latest coordinate on worldline \( W \) visible at
  debugger frame \( g \)

In plain language:

- the debugger has one scrubber / stepper / playback cursor
- each worldline resolves to "its latest coordinate at or before that frame"
- stepping forward advances the composite debugger scene
- rewinding rewinds the composite debugger scene
- pausing pauses the debugger scene, not the ontology of the substrate

### Consequence

The right design is:

- independent worldlines in the substrate
- optional lockstep playback in the debugger

not:

- fake global lockstep time baked into the worldline model itself

### Placement

This debugger-frame concept should live in:

- TTD session state
- higher-level debugger surfaces such as XYPH's human-facing time-travel panel
- optional CLI helpers that resolve a merged playback frame
- host-agnostic debugger application layers built over substrate ports

It should **not** redefine the canonical coordinate model of
`(worldlineId, tick)`.

See also:

- `docs/design/ttd-human-centered-hex-architecture.md`

### Mental model

For developers, the TTD may honestly say:

- "rewind everything"
- "step everything"
- "pause playback"

while internally meaning:

- resolve every active worldline to the composite debugger frame

This keeps the debugger cognitively simple without sacrificing substrate truth.

---

## Migration Implications

This is not a "small adapter" change.

The intended model likely requires:

- renaming the current mutable `WarpGraph` façade
- introducing first-class `Worldline`
- making `WarpGraph` immutable by construction
- making observer handles immutable
- moving materialization to worldline/strand APIs
- turning current strand overlay mechanics into an implementation detail
  of child-worldline replay
- replacing any shallow-frozen materialized-state returns with truly immutable
  snapshots

The current coordinate materialization, detached observer snapshotting, and
strand descriptor model are therefore best treated as transitional
substrate steps, not the final architecture.

---

## Non-Goals

This note does **not** yet attempt to:

- finalize every concrete class name
- settle the entire transfer/collapse API
- specify the full binary BTR format revision
- fully redesign the CLI
- encode higher-layer governance or policy semantics

It does set the semantic rails that later test specs and implementation slices
must follow.

---

## Required Invariants

The rewrite should treat the following as explicit invariants rather than
informal design preferences.

### A. Ontology and naming

1. `Worldline` is the authoritative append-only causal history handle.
2. `WarpGraph` means immutable materialized snapshot only.
3. `Observer` means immutable read handle only.
4. `Strand` means speculative child-worldline write handle only.
5. `BTR` is the authoritative tick-level boundary record appended to a
   worldline.
6. No mutable/session façade may continue to use the `WarpGraph` noun.

### B. Snapshot immutability

1. Every materialized `WarpGraph` is read-only.
2. A `WarpGraph` hash must remain stable for the lifetime of the object.
3. No caller may mutate node, edge, property, or attachment-plane data through
   a `WarpGraph` handle.
4. Derived helper views must not expose backdoors that mutate the underlying
   snapshot.
5. Materializing the same worldline coordinate twice must yield content-equal
   snapshots with the same canonical hash.

### C. Snapshot hashing and recursive truth

1. Snapshot hashing includes the recursive attachment plane transitively.
2. Attachment metadata is part of canonical snapshot truth.
3. A snapshot hash that ignores recursive attachment content is invalid.
4. Content-addressed cache entries may be reused across distinct worldlines
   only when their canonical snapshot hashes are equal.

### D. Coordinates and clocks

1. The canonical semantic coordinate is `(worldlineId, tick)`.
2. `tick` is a per-worldline append coordinate, not a runtime-global clock.
3. Any global debugger/session frame is correlation metadata, not worldline
   identity.
4. APIs must not silently reinterpret a global/session frame as a worldline
   tick.
5. Different worldlines may legitimately have different tick counts.

### E. Replay and materialization

1. Replay is deterministic.
2. Replay reconstructs snapshots from checkpoints plus ordered BTR suffixes.
3. Replay observes existing history; it does not invent future state.
4. Materialization never mutates previously materialized snapshots.
5. Checkpoints are caches, not authoritative truth.
6. Worldlines and their BTR chains remain authoritative even when checkpoints
   exist.

### F. Observer invariants

1. Observers are immutable.
2. `observer.seek(...)` returns a new observer; it does not retarget the
   current observer in place.
3. Observers cannot tick, patch, or otherwise mutate worldlines.
4. Observers cannot see beyond the frontier of the worldline they are bound to.
5. Observer-specific filtered caches are derived, non-authoritative views.
6. Observer projection must not become a second hidden graph system above the
   canonical snapshot.
7. Observation, replay, and seek do not by themselves create strands or any
   other new causal lanes.

### G. Strand invariants

1. A strand is a child worldline, not a mutable overlay pretending to be
   one.
2. Ticking a strand appends only to that child worldline.
3. Ticking a child worldline does not mutate its parent worldline.
4. Ticking a parent worldline does not automatically advance existing children.
5. Forked worldlines share prefix history structurally but own independent
   future suffixes.
6. Transfer/collapse remains an explicit later move; it is not implied by
   ticking.
7. Explicit debugger-created counterfactuals create real strands rooted at
   exact fork bases; observation alone does not.
8. TTD-created strands should default to scratch or author-only speculative
   retention, not silent shared publication.
9. Promotion into shared admitted history remains a later explicit act.

### H. Intent and footprint invariants

1. Every intent declares a footprint.
2. Footprints include reads, writes, deletes, and anchors/existence
   preconditions.
3. Attachment-plane reads/writes count against the owning node or edge
   footprint.
4. Within one tick, only footprint-independent intents may be admitted
   together.
5. Overlapping footprints produce rejected counterfactuals rather than silent
   co-admission.
6. Admitted intents must replay to the same result regardless of execution
   order inside the admitted bundle.

### I. Tick and BTR invariants

1. Every successful tick emits one BTR for that lane.
2. A BTR records admitted rewrites, rejected counterfactuals, and enough
   provenance for deterministic replay/verification.
3. The output snapshot hash in a BTR must match the canonical hash of the
   resulting `WarpGraph`.
4. Appending a BTR is the only way a worldline frontier advances.
5. Replay helpers observe BTR history; live mutation flows through the
   deterministic tick path.

### J. PlaybackHead invariants

1. `PlaybackHead` is a coordination/control object, not a history object.
2. A playback head does not replace per-worldline coordinates.
3. A playback head may track many lanes simultaneously.
4. A playback frame is a derived composite mapping from one debugger/app frame
   index to per-lane coordinates.
5. Advancing a playback head frame does not imply every tracked lane emitted a
   new BTR.
6. A lane may be observed by many playback heads.
7. Writable control authority must be explicit; it is not implied by mere
   observation.
8. A playback head is distinct from higher-level debugger session state such
   as panel layout, bookmarks, and watched entities.

### K. PlaybackHead authority and overlap

1. A lane must not have ambiguous writable playback-head authority.
2. A lane may have at most one active writable controlling playback head at a
   time unless a more specific future authority-sharing model is defined.
3. Read-only observation by multiple heads is always allowed.
4. If two distinct active playback heads control writable lanes whose effective
   write footprints overlap, git-warp must surface an inter-head coordination
   hazard before silent advancement.
5. Inter-head hazards must be detectable at two levels:
   - static control overlap, when heads claim writable control over overlapping
     domains
   - dynamic intent overlap, when queued/admitted intents across heads overlap
     in actual footprint
6. Silence is invalid here: overlapping writable control across heads must not
   be treated as a benign condition.

### L. Debugger-time invariants

1. Substrate time and debugger time are distinct concepts.
2. Worldlines may tick independently in the substrate.
3. The TTD may expose one composite playback cursor for human DX.
4. Rewind/step/play/pause in the debugger resolve per-lane coordinates against
   the selected debugger frame; they do not prove the substrate has one global
   lockstep clock.
5. Debugger/session frames are derived control-plane coordinates, not canonical
   history coordinates.

### M. Seek and rewind semantics

1. Observational seek is read-side only.
2. Observational seek must not rewrite live canonical history.
3. Continuing execution from an earlier coordinate should normally happen by
   forking a child worldline, not by destructively rewinding a canonical one.
4. If administrative rewind ever exists, it must be explicit, privileged, and
   clearly separated from ordinary observer/playback APIs.
5. Debugger-created continuations should carry explicit fork provenance and,
   when retained, explicit retention or revelation posture.

### N. Deletion and liveness

1. Observer-visible deletion is worldline-relative absence, not immediate
   physical erasure.
2. Shared-prefix ancestry may keep structures physically materialized after
   logical deletion on one worldline.
3. GC must be lineage-aware.
4. Recursive attachment content remains live while reachable from any retained
   worldline.

### O. Determinism and side-channel invariants

1. No API may depend on wall-clock time for causal ordering.
2. No API may depend on host-local nondeterministic iteration order for
   materialization, hashing, admission, or replay.
3. Equivalent inputs and equivalent history must produce equivalent hashes,
   BTRs, and replay results.
4. Higher-layer policy/governance meaning must not leak into git-warp core
   substrate mechanics.

---

## Design Commitments

The rewrite should preserve these commitments:

- The graph is the plan.
- Worldlines are the authoritative causal history.
- BTRs are the authoritative tick-level boundary records.
- `WarpGraph` means immutable materialized snapshot.
- Observers are immutable read handles.
- Strands are child-worldline speculative write handles.
- Attachment-plane truth is first-class and included in hashing, replay, and
  footprint analysis.
- Shared-prefix / braid semantics should reuse content without collapsing
  distinct worldlines into one mutable lane.
- git-warp owns substrate mechanics, not higher-layer governance meaning.

---

## Relationship To Existing Notes

This note supersedes the older, weaker reading of:

- `docs/design/observer-strand-boundary.md`

and constrains future work described in:

- `docs/design/strand-intent-ticks.md`

Those notes remain useful historical context, but their use of `WarpGraph` as a
lower-level session façade should be treated as transitional rather than
canonical.
