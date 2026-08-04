# Readings & Optics

_The reference pattern for modelling data in a WARP graph. Written after the
Think census. Kept short on purpose. Every rule here has a body count._

---

## 0. Read this first

`git-warp` is a **provenance graph**. Its capabilities — `patchesFor(id)`,
`materializeSlice(id)`, checkpoints that bound replay, index construction from
patch footprints alone — are all defined over **fine-grained, addressable
facts**. Every one of them evaporates the moment you hand it a coarse mutable
container.

The Think census (see §12) is what that evaporation looks like measured: 274
patches touching **4 nodes**, **0 edges**, cones indistinguishable from _no
history_, one 8.57 MiB decoded object against a 5 MiB ceiling, a store that
could not be compacted and could not be repaired. The substrate did nothing
wrong. It faithfully recorded what the application wrote. What the application
wrote was **a read model, stored inside the event log, in place of facts**.

The rules in this document exist to make that mistake unrepresentable — or at
least unmistakable — in every future WARP application. Read the rules first;
the worked example is at the bottom.

---

## 1. The two-line contract

> **1.** The log records **facts**. The state is a **fold** over them.
> **2.** Facts are **immutable**, **addressable**, and **minimal**.

Everything else in this document is a consequence.

---

## 2. What is a fact?

A fact is a statement about the world that will be true forever regardless of
what happens next. `"James wrote 'probe write two' at 2026-08-01T05:13:00Z"` is
a fact. `"There are 65 memories on page 111"` is not — it is a snapshot of a
derived count, and the very next capture invalidates it.

**A fact is what an outside observer, replaying your log, could reconstruct
without consulting your read model.**

If you have to look at your own state to know what to write next, you are
writing state, not facts.

---

## 3. What is an entity?

An entity is anything a user, an operator, or a downstream computation ever
wants to ask a _targeted_ question about. If someone might ever ask
`patchesFor("entry:...")`, `slice("entry:...")`, or "when did this happen and
what changed it?" — it is an entity.

**The test:** if `patchesFor(id)` on a good store must return a non-empty,
history-bearing cone, then `id` is an entity and it must be a node.

The four IDs in the Think census that looked like entities but resolved to
`patchesFor(...) → []` were, in the substrate's honest opinion, _not
entities_. They were property keys of container nodes. The substrate was
telling the truth. Nobody was listening.

---

## 4. Rule: entity occurrence per patch, one patch per fact

Every captured fact is admitted by one `NodeAdd` occurrence. That patch:

- carries the entity's non-empty initial payload as properties,
- declares an empty graph-read set,
- declares **exactly one** subject write.

The subject and the occurrence are different identities. A subject may be a
semantic id supplied by the application, in which case several admissions can
legitimately name it. When the fact has no independent semantic key, git-warp
allocates an opaque subject from the same writer-local dot used by `NodeAdd`.
In both forms, the receipt carries the distinct substrate occurrence.

This is the _single-subject capture_ shape. Its recorded footprint (§8)
describes exactly the operands encoded by the patch. It does not prove that
application code made no prior graph read before choosing the subject or
payload; such a dependency is absent from the patch unless the caller declares
it. An allocated subject has a singleton cone until another patch names it; a
reused semantic subject has one cone containing its several occurrences.
Neither case changes the declared patch shape.

The corresponding lint (which the substrate should enforce, see §11):

```text
REJECT any capture patch whose read set is non-empty,
       whose write set is not exactly one subject,
       or whose initial payload is empty.
```

Do not infer semantic-subject uniqueness from this shape. Dots identify CRDT
operations; occurrence coordinates identify admissions; neither turns the
subject into a distributed uniqueness constraint.

---

## 5. Rule: containers are edges, not properties

The single most dangerous shape in a WARP store is a node whose property is a
collection of other things:

```text
NODE bucket:2026-08-01
  entries: [ {...}, {...}, {...}, ... ]  // ← sin
```

Every append rewrites the collection. Every rewrite is a `PropSet` of the
whole value. Growth is quadratic in appends. The container's cone is every
patch that ever touched it. This is the four-node sin, in its purest form.

The correction is not "smaller collections" or "more container nodes." The
correction is:

```text
NODE bucket:2026-08-01                    // created once
NODE entry:<opaque-allocated-subject>      // created once, per capture
EDGE bucket:2026-08-01 → entry:<opaque>    // added once, per capture
```

Each edge is an **immutable fact whose cone is Θ(1)**. Enumeration of a
bucket's contents is a bounded scan of edges-from-bucket. The bucket is never
`PropSet`. If it were, that would be the sin returning at smaller scale.

**Id-arrays-in-properties are the sin in miniature.** Detecting them is easy:
the census (§12) will show `edges: 0` and one hot property containing every id
ever added.

---

## 6. Rule: order is a substrate fold, not an application clock

Do not store `next` / `prev` / `previousKindId` pointers as **authoritative**
ordering. Do not invent an application tuple to replace them. git-warp already
owns the distinct ordering questions:

- a dot is unique operation identity, not a timestamp;
- a version vector answers causal partial-order questions, and concurrent
  vectors are incomparable;
- an `EventId` supplies the canonical deterministic linearization
  `lamport → writerId → patchSha → opIndex` within one worldline; a reading
  spanning independent worldlines orders the worldline before the `EventId`.

Retrieval optics fold admitted occurrences in that substrate order. A field
such as `capturedAt` may remain application payload for human chronology and
time-window filtering, but it establishes neither identity, causality,
admission order, nor correctness.

Prev-pointers as denormalized _hints_ are permissible; prev-pointers as the
source of truth for order are not, for two reasons:

1. Writing entry N with a pointer to entry N−1 is a **read-then-write of
   different nodes**. The syntactic footprint (§8) will not see the
   dependency, so the substrate cannot reason about it. Any code that trusts
   the pointer is trusting something the provenance graph does not know
   about.
2. Order-by-link is O(chain-length) to reconstruct and O(everything) to
   repair if a link goes bad. An optic over canonical occurrence coordinates
   repairs itself from retained substrate evidence.

If you must denormalize a prev-pointer for a hot query, do it — and write
down, out loud, that no consumer may treat it as authoritative. Kindly assume
your future self will forget.

---

## 7. Rule: derived data lives anywhere except where facts live

Caches, indexes, projections, materialized views, precomputed aggregates,
"the read model" — all fine. They can live in a sidecar file, in a checkpoint
manifest, in a commit trailer, in memory, in a spreadsheet on the operator's
desk. They **cannot** live inside the patch log.

The test is simple: **if I delete this thing, can I regenerate it from the
log?** If yes, it is derived, and it is safe. If no, it is a fact — write it
into the log properly as an entity (§4) rather than smuggling it in as an
overwritten property.

The commit trailer footprint discussion in Paper III is the same rule applied
recursively: a trailer footprint is a stored read-model too, redeemed only
because it stays _derived_, _adjacent_, _verifiable_, and _deletable_ — the
same design as git's own [changed-path Bloom
filters](https://devblogs.microsoft.com/devops/super-charging-the-git-commit-graph-iv-bloom-filters/).

---

## 8. The syntactic footprint honesty constraint

`PatchBuilder` derives each patch's `reads` / `writes` footprint from the
**operand ids literally mentioned in the patch's ops**. That footprint is a
complete description of the encoded operands. It is not necessarily a complete
description of semantic dependency: `PatchBuilder` cannot observe state that
application code read before constructing an intent or payload.

The capture constructor guarantees one declared subject write and an empty
declared read set. It does not prove that application code made no prior graph
read. If a caller loads graph state, computes a payload, and then submits
`entity.add`, the recorded footprint under-approximates that dependency just as
it would for any other patch. Subject allocation and occurrence ordering are
substrate operations rather than hidden graph reads, but they cannot attest to
how an application chose its payload. Treat recorded footprints as a lower
bound unless semantic reads are declared or a stronger capability supplies
evidence that there were none. The API should surface this distinction as a
value, not hide it in prose:

```text
type ConeExactness = "exact" | "under-approximate"
patchesFor(id): { patches: [...], exactness: ConeExactness }
```

Applications that need exact slicing must declare semantic reads explicitly or
use an API that tracks and attests their absence. Choosing the entity-capture
shape alone is not such an attestation.

---

## Provenance and diagnostics

_Deliberately unnumbered: `ProvenanceController` links here as
`docs/READINGS_AND_OPTICS.md#provenance-and-diagnostics`, and a numeric prefix
would change the slug. If you renumber this document, do not number this
heading._

### Enumeration is not provenance

Two operations answer two different questions. Conflating them is the fastest
way to make the word "cone" mean nothing.

| Question                               | Operation                                | Answers        |
| -------------------------------------- | ---------------------------------------- | -------------- |
| _Which entities belong to this group?_ | `edgesFrom(bucket)`, range scan over ids | **membership** |
| _Which patches produced this fact?_    | `patchesFor(id)`, `materializeSlice(id)` | **causation**  |

An edge from a bucket to an entry is an immutable membership fact whose own
cone is Θ(1). That does **not** make the bucket's graph descendants part of the
bucket's backward cone. `patchesFor(day)` returns the patches that produced the
day node — not every memory that happens to hang off it.

The rule: **never build an API that takes a container id and returns its
members' history under the name "slice."** Enumerate, then request provenance
per entity. If you find yourself wanting `slice(day)` to mean "traverse
descendants," you have two concepts sharing one word, and the next reader will
inherit the confusion rather than the distinction.

### Cone exactness is a value, not a footnote

§8 establishes that the entity-capture constructor constrains the recorded
shape but cannot establish semantic dependency completeness. An exactness
classification must come from evidence about the entire application operation,
not from the `entity.add` discriminator alone, and must travel with the answer:

```text
type ConeExactness = "exact" | "under-approximate"

patchesFor(id): { patches: [...], exactness: ConeExactness }
```

An `under-approximate` cone is still useful — it is a lower bound on truth, and
lower bounds are fine as long as nobody mistakes them for the truth. Without
evidence establishing semantic completeness, `under-approximate` is the honest
classification. A cone returned without its exactness label is an unlabelled
lower bound, which is how a diagnostic becomes a false guarantee.

Extend the same honesty to any reading built on top:

```text
ReadingEvidence { result, basis, aperture, derivation, exactness }
```

### When provenance reading is unavailable

Provenance requires a live index. The index is built from patch footprints
(§8), and materializations that resume from a state cache or a checkpoint
carrying no index cannot rebuild it for the patches they skipped. Those report
**degraded** rather than presenting an empty index as complete evidence.

| Condition                        | Code                    | Meaning                                                         |
| -------------------------------- | ----------------------- | --------------------------------------------------------------- |
| No reading basis open            | `E_NO_STATE`            | Open a worldline or a checkpoint-backed reading first.          |
| Index does not cover the history | `E_PROVENANCE_DEGRADED` | The answer would be silently incomplete, so no answer is given. |

Refusing is correct. The alternative — returning `[]` — is
indistinguishable from _"this entity has no history,"_ and that ambiguity is
exactly what let the Think census (§12) go unnoticed: four container ids
resolved to empty cones, and nothing anywhere said _"empty because absent"_
rather than _"empty because never recorded."_

**Corollary for callers:** treat an empty cone as a question, not an answer.
Ask whether the id is an entity at all (§3) before concluding it has no past.

---

## 9. Indexes are derived optics over entities

Once every entity is a node (§4), you can build any index you want as a
**pure function over the entity set**. The index does not need to be
stored — it can be materialized on demand, cached, thrown away, rebuilt.

Common shapes:

- **Occurrence-order scan.** Fold entity occurrences by git-warp's canonical
  event ordering and stop when the requested bound is satisfied. The subject
  remains identity, not an application-owned clock disguised as an id.
- **Temporal trie.** Group entries by `YYYY/MM/DD/HH` for human-time filtering.
  Derive it from optional application metadata such as `capturedAt`, never from
  causal identity. If materialized for
  performance, use **immutable bucket nodes plus `EdgeAdd` membership** —
  never `PropSet` a bucket. See §5.
- **Kind scan.** Enumerate all entities of a given kind. This is O(entities-of-that-kind)
  and it is only viable if you have budgeted for that scan. If a kind grows
  without bound, you need a real index; a kind scan is a poor-man's secondary
  index and it becomes the O(N) read reborn under a different name.
- **Content-addressed body.** For entities whose payload is a large blob
  (attachments, transcripts, embeddings), store the body as a content-addressed
  blob and keep only `{hash, capturedAt?, meta}` on the node. Identical bodies
  deduplicate for free. This also keeps entity patches small enough to stay
  well under any per-object decode ceiling regardless of future feature drift.

**Granularity is empirical.** Pick a bucket size that fits your write rate;
document the splitting rule; do not carve the granularity into the storage
contract. Today's hour-bucket is tomorrow's hot page.

---

## 10. Checkpoints, and the difference between a bounded tail and a bounded cone

A **checkpoint** bounds the _replay tail_: given a stable checkpoint at
coordinate C, materialization needs to replay only patches after C. Set a
default policy (`{ every: 64 }` is a reasonable start) and — critically —
**make sure the trigger fires on the actual read path your application uses**.
The Think outage in the census (§12) was not a missing policy; it was a
policy whose trigger (`_onMaterialized`) was never called by the
lane/bounded-reader path Think actually took. A checkpoint that never fires
is not a safety mechanism; it is decoration on the one-way door.

A checkpoint is not the same thing as a bounded cone. If your application has
a mutable global head/index node whose backward cone grows linearly with
history, then even with a fresh checkpoint every query still slices something
whose cone-in-principle is Θ(N). The tail is bounded; the geometry is not.
Design for **bounded cones by construction** (per-entity nodes, immutable
buckets, edges not property arrays); use checkpoints to bound replay of the
things that are legitimately global (aggregate summaries, cross-entity roll-ups).

Two shapes are asymptotically dangerous even in an otherwise clean model:

- A `total`/`headPage`/`current` node updated on every append. Its cone is
  the history of the store. Replace with either an immutable append record
  or an out-of-log ref.
- A `provenanceIndex.cbor` (or any serialized index) that lives as **one
  growing object**. It reintroduces the decode-ceiling cliff by another name.
  Chunk it, or store it as an actual graph of immutable segments (Datomic's
  shape).

---

## 11. Write-path affordances the substrate should provide

Documentation prevents the first sin. Affordances prevent the ten-thousandth.
The substrate should — over time — make the following properties directly
enforceable at write time:

- **Capture-shape lint.** Reject patches that claim to create an entity but
  read from other nodes or write to more than one id. (See §4.)
- **Substrate allocation and receipts.** Allocate subjects for facts without an
  independent semantic key from writer-local causal machinery, and return an
  opaque occurrence coordinate whose causal relation and deterministic order
  remain owned by git-warp.
- **Amplification lint.** Warn when a single patch's byte size exceeds a
  factor of its payload — e.g. a 15-byte capture producing a 33 KiB patch.
- **Hot-node lint.** Warn when a single node absorbs a disproportionate
  share of writes over a rolling window. In the Think census one node had
  49.6% of all writes; that is a signal, not noise.
- **Decode-boundary invariant.** Track the largest independently decoded
  object; alarm when it approaches the ceiling _before_ it hits.
- **`warp census`.** Ship the forensic harness (§12) as a first-class
  diagnostic command any application can run against its own store, with
  the properties in §12 reified as machine-checkable checks. An app that
  passes the census conforms to this document. An app that fails is
  reading the same paragraph that saved (or did not save) Think.

None of this replaces the rules in §§1–10. All of it makes the rules
noisy to violate.

---

## 12. Exhibit A: the Think census (preserved as a relic)

Full census of a real Think store, taken at the point Think became
unrecoverable. All numbers are what the store actually contained.

```text
patches                    : 274
distinct nodes written     : 4
op types                   : 272 PropSet, 2 NodeAdd
edges                      : 0
total patch bytes          : 6.48 MiB (~24 KiB avg patch)

writes per node:
  136x  read_model:v19:index:capture
   65x  read_model:v19:index:capture:page:00000111
   50x  read_model:v19:index:capture:page:00000110
   23x  read_model:v19:index:capture:page:00000112

single-capture pathology:
  input           : "probe write two" (15 bytes)
  emitted patch   : 33,624 bytes
  amplification   : ~2,200×

per-page growth (page 00000112, 23 appends):
  335 → 2,124 → ... → 33,624 bytes per append
  total          : 409.3 KiB
  shape          : Θ(appends²) because each append re-serialised
                   the whole page

recovery:
  materialized state : 16.4 MiB
  largest object     : 8,568,034 bytes decoded
  hard ceiling       : 5,242,880 bytes (MAX_CBOR_DECODE_BYTES)
  repair             : E_INTERNAL: CBOR decode rejected

read cost, same code, same optic:
  fresh store  (14  commits, replay 10 ) :    79 spawns, 1.7s
  light store  (72  commits, replay 10 ) :   232 spawns, 1.9s
  heavy store  (502 commits, replay 262) : 5,267 spawns, 25.7s

  --limit=1 costs 5,267 spawns.
  --limit=50 costs 5,267 spawns.
  Cost tracked history size, not query size.
```

The six failed promises the census made testable (and the properties every
application's own census should check):

1. **Cone ≪ universe.** The cone of any addressable id is a strict subset
   of the total patch set. _In Think: false. Cone of a page node was every
   patch that touched it. `patchesFor("entry:...")` returned `[]`._
2. **Cost ∝ query.** Read cost scales with what was asked for, not with
   what has ever been written. _In Think: false. `--limit=1 ≡ --limit=50`._
3. **Tail bounded.** The replay tail past the latest checkpoint is bounded
   by policy. _In Think: false. Checkpoint frozen for two days, 262
   unreplayed patches, +2 per write._
4. **Compaction feasible.** State can always be re-materialized. _In Think:
   false. One object exceeded the decode ceiling._
5. **Ops are facts.** Patches record what happened, not what the read model
   is. _In Think: false. 272 of 274 ops were `PropSet` overwrites of a
   read-model cache._
6. **Writes ∝ payload.** Patch bytes scale with the fact being recorded, not
   with the size of the accumulated container. _In Think: false. 15 bytes
   in, 33,624 bytes out._

Each of these is machine-checkable. Each of these is what `warp census`
should ship as a named test.

---

## 13. The short version, for posting above the desk

- **Entities are nodes.** One subject, one addressable entity; repeated
  admissions remain distinct occurrences.
- **Facts, not state.** Each capture is one `NodeAdd`. It declares no graph
  reads, declares one subject write, and returns one substrate occurrence.
- **Containers are edges.** Never put a growing collection in a property.
  `EdgeAdd(container → member)` per member. Never `PropSet` the container.
- **Order is a substrate fold.** Version vectors answer causality; canonical
  event order answers deterministic listing; application time stays metadata.
- **Derived lives outside.** Caches, indexes, projections — anywhere but the
  log. If you cannot regenerate it from the log, it is a fact; make it one.
- **Cones by construction.** Build bounded cones into the shape. Do not rely
  on checkpoints to hide unbounded ones.
- **Ceilings are covenants.** When a hard limit fires, it is telling the
  truth. Fix the shape; do not raise the ceiling.

---

## 14. Related reading

- **Paper III — Computational Holography & Provenance Payloads.**
  The design this document is the applied corollary of.
- **Greg Young — CQRS Documents.**
  The event/projection distinction, stated at length, fifteen years earlier.
  <https://cqrs.wordpress.com/wp-content/uploads/2010/11/cqrs_documents.pdf>
- **Datomic — Architecture.**
  The reference existence proof for "log justifies snapshot; snapshot serves
  reads; nobody replays anything except to rebuild trust."
  <https://docs.datomic.com/datomic-overview.html>
- **Jepsen — Datomic Pro 1.0.7075.**
  Independent read on the same shape.
  <https://jepsen.io/analyses/datomic-pro-1.0.7075>
- **Git — commit-graph and changed-path Bloom filters.**
  Derived-data-as-sidecar done well.
  <https://devblogs.microsoft.com/devops/super-charging-the-git-commit-graph-iv-bloom-filters/>
- **Whittaker et al. — Wat-Provenance.**
  Why syntactic cones over-approximate true causal explanation, and why
  application-level provenance is a distinct problem from storage-operand
  provenance.
  <https://dl.acm.org/doi/10.1145/3267809.3267839>

---

_This document exists because it did not exist when Think was written. Keep
it up to date. If a future application's census fails a property in §12, the
correction goes here first, and only then into code._
