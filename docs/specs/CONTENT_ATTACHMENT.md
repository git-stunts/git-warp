# Content Attachment Specification

> **Spec Version:** 1 (implemented)
> **Status:** Implemented (v11.5.0)
> **Paper References:** Paper I Section 2 (WARP definition, vertex/edge attachments, `Atom(p)`)

---

## 1. Introduction

This document describes **content attachment**: content-addressed blobs attached
to WARP graph nodes and edges as first-class payloads.

Earlier git-warp releases represented content through flat property
compatibility keys. Current graph-model code projects visible content into
runtime-backed `ContentAttachmentRecord` and `ContentAttachmentPayload` objects,
then emits `GraphContentAttachmentSetOp` operations in the graph-operation
algebra. Legacy `_content*` keys remain only as compatibility and migration
input, not as the public substrate contract.

Content attachment bridges this gap by giving nodes the ability to carry `Atom(p)` payloads: content-addressed blobs stored in the Git object store and referenced by SHA from the graph.

### Motivation

Consumers of git-warp (e.g., git-mind) need to attach rich content to graph
nodes and edges: ADR bodies, spec documents, configuration files, narrative
text, and other opaque payloads. Without a substrate-level primitive, each
consumer must:

- Invent its own convention for referencing external blobs
- Manage CAS storage independently
- Re-derive time-travel, multi-writer merge, and observer scoping for content
- Risk inconsistency between the content store and the graph state

All of these are already solved by git-warp's graph substrate. Content
attachment extends the same deterministic visibility, merge, and traversal
guarantees to blob payloads.

### Relationship to the Paper

Paper I defines a WARP graph as `(S, α, β)` where:

- `S` is a finite directed multigraph (the skeleton)
- `α : V_S → WARP` assigns an **attachment** to every vertex
- `β : E_S → WARP` assigns an **attachment** to every edge
- `Atom(p)` for `p ∈ P` represents atomic payloads — "the stuff we are not going to model internally (bytestrings, floats, external object IDs, ...)"

This proposal implements the depth-0 case of attachments: nodes carry `Atom(p)` payloads where `p` is a content-addressed blob in the Git object store. The full recursive case (attachments that are themselves WARP graphs) is a future concern; this proposal establishes the correct foundation.

---

## 2. Scope

### In scope

- Runtime-backed content attachment records for nodes and edges
- API for writing a blob and attaching its content storage reference
- API for reading attached node and edge content
- CRDT semantics for content references
- Time-travel compatibility through `materialize({ ceiling })`
- Deterministic projection from legacy `_content*` compatibility records

### Out of scope

- Full removal of every legacy `_content*` compatibility reader
- MIME type policy, storage policy, and size thresholds beyond stored metadata
- CLI commands for content manipulation (consumer concerns)
- Editor integration, conflict resolution UX (consumer concerns)
- Nested WARP attachments (future work)

---

## 3. Design

### 3.1 Primary Runtime Model

The primary runtime model is a typed content attachment record:

```text
ContentAttachmentRecord
  owner: NodeRecord | EdgeRecord
  payload: ContentAttachmentPayload
    oid: ContentAttachmentOid
    mime: ContentAttachmentMime | null
    size: ContentAttachmentSize | null
```

Materialized state is projected through `ContentAttachmentProjection`. Public
content reads (`getContent*` and `getEdgeContent*`) consume that projection
instead of branching on raw property maps. Graph-model exports use
`GraphContentAttachmentSetOp` for visible content and exclude content
compatibility keys from generic node and edge property operations.

### 3.2 Storage Model

Content bytes are stored through the configured `BlobStoragePort`. The default
Git-backed path stores payloads in content-addressed CAS trees and keeps older
raw Git blob payloads readable through a compatibility path. Runtime content
records carry the storage reference as `ContentAttachmentOid`; callers should
not derive behavior from the legacy storage key names.

### 3.3 Legacy Storage Compatibility

Legacy state may still contain the well-known compatibility keys
`_content`, `_content.mime`, and `_content.size`. Those keys are migration
source facts and compatibility read inputs. They are centralized in
`LegacyContentPropertyKeys` / `KeyCodec` and projected into
`ContentAttachmentRecord` before public content reads or graph-operation
algebra exports observe them.

The compatibility mapping is:

| Compatibility key | Typed field |
|---|---|
| `_content` | `ContentAttachmentPayload.oid` |
| `_content.mime` | `ContentAttachmentPayload.mime` |
| `_content.size` | `ContentAttachmentPayload.size` |

Metadata is accepted only when it belongs to the same content write lineage as
the content reference. Manual compatibility rewrites do not inherit stale MIME
or size metadata from an older content payload.

### 3.4 Final API

Dedicated methods encapsulate blob storage and typed content projection.

#### Write API (PatchBuilderV2 / PatchSession)

```javascript
const patch = await graph.createPatch();
patch.addNode('adr:0007');
await patch.attachContent('adr:0007', '# ADR 0007\n\nDecision text...', {
  mime: 'text/markdown',
});
await patch.commit();

// Edge content
await patch.attachEdgeContent('a', 'b', 'rel', 'edge payload', {
  mime: 'text/plain',
});
```

Both methods are async (they call `writeBlob()` internally) and return the builder for chaining.

#### Read API (WarpGraph)

```javascript
const buffer = await graph.getContent('adr:0007');   // Uint8Array | null
const oid    = await graph.getContentOid('adr:0007'); // string | null
const meta   = await graph.getContentMeta('adr:0007');

// Edge content
const edgeBuf = await graph.getEdgeContent('a', 'b', 'rel');
const edgeOid = await graph.getEdgeContentOid('a', 'b', 'rel');
const edgeMeta = await graph.getEdgeContentMeta('a', 'b', 'rel');
```

`getContent()` returns raw `Uint8Array` bytes. Consumers wanting text should decode with `new TextDecoder().decode(buffer)`.
If a projected content attachment points at a missing blob OID, `getContent()`
throws instead of silently returning empty bytes. `getEdgeContent()` has the
same byte-decoding and missing-blob semantics for edge content references.
`getContentMeta()` / `getEdgeContentMeta()` return `{ oid, mime, size }` when
metadata exists, or `null` when no attachment exists. Historical attachments
created before metadata support, or later manual compatibility rewrites that
bypass the attachment helpers, may still surface `mime: null` / `size: null`.

#### Compatibility Constant

```javascript
import { CONTENT_PROPERTY_KEY } from '@git-stunts/git-warp';
// CONTENT_PROPERTY_KEY === '_content'
```

The constant remains exported for migration code and compatibility tests. New
domain logic should prefer typed content attachment records.

---

## 4. CRDT Semantics

Content attachment inherits the same LWW visibility semantics as the
compatibility content reference that feeds the typed projection:

- **LWW (Last-Writer-Wins):** If two writers attach different content to the
  same node or edge concurrently, the one with the higher Lamport timestamp
  wins. Ties are broken by writer ID, then patch SHA.
- **Tombstones:** If a writer removes a node, its content attachment is removed with it (OR-Set semantics on nodes).
- **No content-level merge:** Content blobs are opaque atoms. There is no attempt to merge conflicting blob contents — the SHA is the unit of conflict resolution, not the bytes.

This matches the paper's model: `Atom(p)` values are opaque. The graph's CRDT semantics operate on the references, not the payloads.

---

## 5. Time-Travel

Content attachment participates in time-travel automatically:

```javascript
graph.materialize({ ceiling: tick });
const content = await graph.getContent('adr:0007');
// Returns content as of the given tick
```

The typed content projection at tick `N` resolves to the content storage OID
visible at that tick. Current storage uses CAS trees for attachment payloads,
so historical content is retrievable as long as the Git objects have not been
garbage-collected.

---

## 6. Durability / Git GC

Content storage trees can be unreachable unless an application commit or
checkpoint commit anchors them. Without anchoring, `git gc --prune=now` would
delete them.

**Solution:** patch commits embed content storage OIDs in the patch commit tree alongside the encoded patch:

```text
patch               → encoded patch storage tree
_content_<oid>      → compatibility content storage tree anchor
```

The tree-entry name is a storage compatibility anchor, not the runtime content
model. It makes content storage reachable via the writer ref chain
(`refs/warp/<graph>/writers/<id>` → commit → tree → content tree). GC
protection is automatic. Sync replicates content along with patches.

**Checkpoint anchoring:** checkpoint creation scans compatibility content
references that still back current state and embeds the referenced storage OIDs
in the checkpoint tree. This ensures content survives GC even if patch commits
are ever pruned (e.g., by future compaction or writer-chain truncation). The
invariant is: **content storage referenced by live state is always reachable
from at least one ref** — either the writer ref (patch commit tree) or the
checkpoint ref (checkpoint commit tree).

Current content OIDs are CAS trees. Checkpoint anchoring also preserves legacy raw Git blob content by writing those anchors as blob tree entries instead of tree entries.

Integration tests verify both anchoring paths with `git gc --prune=now`.

---

## 7. Implementation Notes

Content attachment stores payloads through the configured `BlobStoragePort`.
The default integration path uses Git CAS trees and falls back to raw Git blobs
only for older stored payloads.

`ContentAttachmentProjection` is the compatibility boundary from legacy
content keys to typed content records. `GraphOpAlgebraProjection` emits
`GraphContentAttachmentSetOp` for visible content and filters content
compatibility keys out of generic property operations.

Edge attachments are included in v1 (not deferred).

---

## 8. Future Work

- **Nested WARP attachments:** The paper allows `α(v)` to be a full WARP graph, not just an atom. This would mean a node's attachment is itself a graph with nodes, edges, and their own attachments. This is a significant extension beyond content blobs and is out of scope.
- **Content integrity verification:** Optionally verify blob SHA on read to detect corruption.
- **Final compatibility removal:** Once migration fixtures prove all stored
  legacy content references can be upgraded, remove the remaining `_content*`
  compatibility readers and tree-entry naming from the storage plane.

---

## 9. Summary

| Aspect | Decision |
|---|---|
| Where content is stored | `BlobStoragePort` / Git CAS content storage |
| How content is represented | `ContentAttachmentRecord` + `ContentAttachmentPayload` |
| Compatibility input | `_content`, `_content.mime`, `_content.size` |
| Graph algebra | `GraphContentAttachmentSetOp`, not generic property ops |
| CRDT model | Existing LWW visibility semantics |
| Time-travel | Automatic via `materialize({ ceiling })` |
| New dependency | None (uses existing BlobPort on GitGraphAdapter) |
| API shape | Dedicated methods over typed content projection |
| GC protection | Content OIDs embedded in patch/checkpoint trees |
| Edge attachments | Included in v1 |
| Nested WARP attachments | Future work |
| Paper alignment | Implements `Atom(p)` for vertex and edge attachments |
