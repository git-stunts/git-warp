# Entity admission inventory

> **Status:** v19.2 design and conformance target. This capability is the
> storage-neutral read inverse of the unofficial `entity.add` preview. It does
> not make the Entity surface stable.

Git WARP can admit an entity and its complete initial property envelope in one
causal patch. The write receipt distinguishes the graph subject from the
causal occurrence that admitted it. Until v19.2, a later process can read a
known subject but cannot prove that it rediscovered every retained entity
birth at one exact Lane basis.

An entity admission inventory closes that read-side gap:

```text
one exact Lane basis
  -> every retained entity.add admission exactly once
  -> occurrence-preserving streamed Readings
  -> terminal completeness certificate
```

The inventory enumerates admissions, not visible nodes. Two admissions of the
same supplied subject therefore remain two records. Later mutation or removal
does not erase the retained birth from the inventory.

## Public shape

The first public selector is deliberately the entire Lane:

```typescript
import { Runtime } from '@git-stunts/git-warp';
import {
  createEntityAdmissionInventoryObserver,
  requireEntityAdmissionInventoryCertificate,
} from '@git-stunts/git-warp/advanced';

const runtime = await Runtime.open({ at: '.', writer: 'reader' });
const lane = await runtime.lane('captures');
const observer = createEntityAdmissionInventoryObserver('all-captures');
const observation = lane.observe(observer);

for await (const reading of observation) {
  console.log(reading.value.occurrence.id);
  console.log(reading.value.representation.subject);
  console.log(reading.value.initialProperties);
}

const receipt = await observation.receipt;
const certificate = requireEntityAdmissionInventoryCertificate(receipt);
console.log(certificate.admissionCount, certificate.streamDigest);
```

Each Reading carries:

- an opaque occurrence reference;
- a separate representation-subject reference;
- the complete initial properties from that admission;
- the recorded allocation origin;
- a deterministic ordering key explicitly labelled non-causal; and
- opaque support bound to the exact captured basis.

The terminal certificate binds the Lane, captured basis, Lane selector,
admission count, deterministic stream digest, and aggregate evidence. It is
available only from a completed inventory receipt. Early cancellation,
missing retained support, corrupt patches, or an unavailable basis cannot
produce one.

Its public schema is `warp/entity-admission-inventory@1`. The storage-neutral
token deliberately omits Git, ref, patch, and CAS vocabulary even though the
current runtime implementation reads retained Git WARP patch history.

The CLI uses the same Observer rather than introducing an unrelated scan
command:

```bash
git warp observe \
  --lane captures \
  --observer all-captures \
  --reading '{"kind":"entity-admissions"}' \
  --jsonl
```

The final JSON line is the Observation Receipt with its inventory certificate.

## Structural scope before namespace scope

The v19.2 selector is the entire dedicated Lane. Property predicates are not
allowed to define inventory completeness: selecting only entities that contain
`think.capture.v1` would silently omit the malformed admissions an authority
audit needs to discover.

Namespace selection is also deferred. Auto-allocation has an immutable
namespace, but a caller-supplied subject does not. Parsing a prefix from an
arbitrary subject would turn an application naming convention into substrate
truth. Records therefore disclose one of three honest allocation origins when
that origin was explicitly retained:

```text
allocated(namespace)
supplied-subject
legacy-unrecorded
```

`legacy-unrecorded` remains a wire-compatible origin for explicitly translated
or classified data. The inventory does not infer it from an unmarked v19.1
patch: those retained bytes cannot distinguish `entity.add` from an advanced
manual `node.add` plus property sequence. A future namespace selector may cover
only admissions whose recorded allocation origin proves a namespace.

## Persisted intent boundaries

A v19.1 entity patch and an advanced manual graph patch can have the same
retained footprint:

```text
NodeAdd(subject)
PropSet(subject, key A)
...

reads  = empty
writes = exactly subject
```

The operation shape therefore cannot prove which public intent produced it.

Atomic intent arrays make operation shape alone insufficient. These two
requests can otherwise lower to the same operations:

```typescript
await lane.write([
  intent.entity.add({ subject: 'capture:1', properties: { body: 'hello' } }),
]);

await lane.write([
  intent.node.add({ subject: 'capture:1' }),
  intent.property.set({ subject: 'capture:1', key: 'body', value: 'hello' }),
]);
```

v19.2 therefore persists a bounded entity-admission boundary for each
`entity.add` lowered by a PatchBuilder:

```text
operation index
operation count
allocation origin
original allocation dot, for allocated subjects only
```

The boundary does not duplicate property values or application descriptors.
The referenced operations remain the canonical initial envelope. Patch
construction and hydration validate that every boundary starts at one
`NodeAdd`, covers one or more unique property writes to that subject, stays
inside the patch, and does not overlap another boundary.

The allocation dot witnesses how the representation subject was originally
minted. It is not required to equal the causal dot of every later admission:
Strand settlement lawfully re-admits the retained subject under a new target
dot. Replay preserves the original allocation witness so restart validation
can still prove the subject/namespace relationship. This witness remains
inside retained patch metadata; public inventory Readings expose the namespace
but do not expose dots.

Patches without this metadata are handled conservatively:

- an unmarked whole-patch entity footprint obstructs the inventory with
  `E_ENTITY_ADMISSION_INVENTORY_LEGACY_AMBIGUOUS`;
- other unmarked patches are not classified as entity admissions; and
- no operation-shape guess can earn a completeness certificate.

New v19.2 patches persist the metadata field even when its boundary list is
empty. That empty marker proves the writer classified the patch and found no
`entity.add`; it prevents a manual atomic `[node.add, property.set]` sequence
from being misclassified by its whole-patch shape. Only an absent field can
trigger the typed legacy-ambiguity obstruction.

Released v19.1 repositories remain readable and writable, but their unmarked
entity-shaped patches cannot support a complete admission inventory without an
explicit migration or classification step. The array overload is not yet in a
published release, so v19.2 can establish retained intent boundaries before
consumers rely on that surface.

## Basis and ordering

One Observation captures one opaque Tick before reading any retained patch.
Every writer frontier used by the inventory comes from that Tick. A write that
lands after basis F is absent from the complete F inventory and appears only
at a later basis.

Records use Git WARP's deterministic event linearization for repeatable stream
order. The public ordering descriptor says `deterministic-non-causal` because
linearization does not convert concurrent admissions into happened-before.
Application chronology must come from application law, not inventory order.

## Streaming and completeness

The implementation scans retained writer histories behind a semantic patch
journal port. It performs a bounded k-way merge over writer streams and emits
one Reading at a time. It does not materialize the graph, consult a projection,
or collect the full result set before delivery.

The stream digest is a rolling canonical digest. Its working memory is bounded
by one record plus one frontier entry per writer. Each record carries opaque
support for its retained patch; the certificate binds the final aggregate
support and exact basis without leaking patch identifiers, refs, vectors, or
storage paths.

Completeness is terminal. A consumer that calls the async iterator's `return()`
receives an obstructed Observation Receipt with `consumer_cancelled`; the
certificate lookup refuses that receipt. A failure after partial delivery is
still incomplete and cannot be mistaken for authoritative absence.

## Ownership

| Layer | Responsibility |
| --- | --- |
| Public Runtime API | Observer, streamed Readings, terminal certificate |
| Application adapter | Pin one Tick and issue opaque references/evidence |
| Domain | Validate entity boundaries and reconstruct retained admissions |
| Patch-journal port | Stream exact retained patch ranges |
| Storage adapter | Resolve Git/git-cas retention without exposing it publicly |
| Consumer | Validate application schema, identity, chronology, and meaning |

The inventory proves substrate coverage only. It does not claim that every
entity is a valid Think capture, that application identifiers are unique, or
that a later event semantically supersedes an earlier one.

## Release gates

The v19.2 capability is not complete until executable evidence proves:

1. an empty Lane certifies zero admissions;
2. equal payloads under distinct births remain distinct;
3. repeated admissions of one supplied subject remain distinct;
4. malformed application profiles are still emitted;
5. concurrent writers are covered exactly once;
6. F and F2 inventories respect their captured bases;
7. restart reproduces the same set, order, and digest;
8. cancellation and missing support cannot produce a certificate;
9. optional projections can be absent without affecting inventory; and
10. TypeScript and CLI surfaces expose the same semantics.

Entity admission inventory does not implement occurrence relation reading.
That separately answers the relation between selected occurrence references
and remains tracked by issue #854.
