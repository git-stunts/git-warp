# Content Attachment Specification

> **Spec Version:** 1 (implemented)
> **Status:** Implemented (v11.5.0)
> **Paper References:** Paper I Section 2 (WARP definition, vertex/edge attachments, `Atom(p)`)

---

## 1. Introduction

This document proposes **content attachment** — the ability to attach content-addressed blobs to WARP graph nodes (and optionally edges) as first-class payloads.

Currently, git-warp models nodes and edges with flat key-value properties. Properties are powerful for structured metadata but are not designed for large or opaque payloads (documents, images, binary data). There is no first-class concept corresponding to the paper's **attachment** — the `α(v)` and `β(e)` mappings that assign a payload to every vertex and edge.

Content attachment bridges this gap by giving nodes the ability to carry `Atom(p)` payloads: content-addressed blobs stored in the Git object store and referenced by SHA from the graph.

### Motivation

Consumers of git-warp (e.g., git-mind) need to attach rich content to graph nodes — ADR bodies, spec documents, configuration files, narrative text. Without a substrate-level primitive, each consumer must:

- Invent its own property convention for referencing external blobs
- Manage CAS storage independently
- Re-derive time-travel, multi-writer merge, and observer scoping for content
- Risk inconsistency between the content store and the graph state

All of these are already solved by git-warp for properties. Content attachment extends the same guarantees to blob payloads.

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

- Installing `git-cas` (or equivalent CAS-over-git primitive) as a dependency
- API for writing a blob and attaching its CAS key to a node
- API for reading attached content from a node
- CRDT semantics for content references (same as property semantics)
- Time-travel compatibility (content references participate in `materialize({ ceiling })`)

### Out of scope

- MIME type handling, storage policies, size thresholds (consumer concerns)
- CLI commands for content manipulation (consumer concerns)
- Editor integration, conflict resolution UX (consumer concerns)
- Nested WARP attachments (future work)

---

## 3. Design

### 3.1 Storage Model

Content blobs are stored as **Git objects** in the repository's object store. Git's object store is already a content-addressed store — every blob is identified by its SHA. No additional storage layer is required beyond what Git provides natively.

`git-cas` provides a clean API for writing arbitrary blobs to the Git object store and retrieving them by SHA, without involving the index or working tree.

### 3.2 Graph Representation

A content attachment is represented as a **node property** with a well-known key. When a blob is attached to a node, its CAS SHA is stored as the property value:

```text
node: "adr:0007"
property: "_content" = "a1b2c3d4e5f6..."  (git blob SHA)
```

This approach:

- Requires zero changes to the CRDT model (content SHAs are just property values)
- Gets time-travel for free (`materialize({ ceiling })` handles property history)
- Gets multi-writer merge for free (LWW on the `_content` property)
- Gets observer scoping for free (property visibility follows node visibility)

The `_content` key prefix convention (underscore) signals a system-level property, distinguishing it from user-defined properties.

### 3.3 Final API

The hybrid approach was implemented: dedicated methods that encapsulate CAS details, while the `_content` property remains directly accessible for advanced use.

#### Write API (PatchBuilderV2 / PatchSession)

```javascript
const patch = await graph.createPatch();
patch.addNode('adr:0007');
await patch.attachContent('adr:0007', '# ADR 0007\n\nDecision text...');
await patch.commit();

// Edge content
await patch.attachEdgeContent('a', 'b', 'rel', 'edge payload');
```

Both methods are async (they call `writeBlob()` internally) and return the builder for chaining.

#### Read API (WarpGraph)

```javascript
const buffer = await graph.getContent('adr:0007');   // Buffer | null
const oid    = await graph.getContentOid('adr:0007'); // string | null

// Edge content
const edgeBuf = await graph.getEdgeContent('a', 'b', 'rel');
const edgeOid = await graph.getEdgeContentOid('a', 'b', 'rel');
```

`getContent()` returns a raw `Buffer`. Consumers wanting text call `.toString('utf8')`.

#### Constant

```javascript
import { CONTENT_PROPERTY_KEY } from '@git-stunts/git-warp';
// CONTENT_PROPERTY_KEY === '_content'
```

### 3.4 Content Metadata

Optionally, additional system properties can store content metadata alongside the CAS reference:

| Property | Purpose | Example |
|---|---|---|
| `_content` | CAS blob SHA (required) | `"a1b2c3d4..."` |
| `_content.size` | Byte length | `4096` |
| `_content.mime` | MIME type hint | `"text/markdown"` |
| `_content.encoding` | Content encoding | `"utf-8"` |

Whether git-warp stores metadata or leaves it to consumers is an implementation decision. A minimal v1 could store only the SHA and let consumers handle metadata.

---

## 4. CRDT Semantics

Content attachment inherits existing property CRDT semantics:

- **LWW (Last-Writer-Wins):** If two writers attach different content to the same node concurrently, the one with the higher Lamport timestamp wins. Ties broken by writer ID, then patch SHA.
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

The `_content` property at tick `N` points to whatever blob SHA was current at that tick. The blob itself is immutable in the Git object store (content-addressed), so historical content is always retrievable as long as the Git objects haven't been garbage-collected.

---

## 6. Durability / Git GC

Content blobs created by `git hash-object -w` are loose objects. Without anchoring, `git gc --prune=now` would delete them.

**Solution:** `PatchBuilderV2.commit()` embeds content blob OIDs in the patch commit tree alongside the CBOR patch blob:

```text
patch.cbor          → CBOR-encoded patch blob
_content_<oid>      → content blob, keyed by its hex OID (self-documenting, unique by construction)
```

This makes content blobs reachable via the writer ref chain (`refs/warp/<graph>/writers/<id>` → commit → tree → blob). GC protection is automatic. Sync replicates content along with patches. Zero new refs, zero new Git commands.

**Checkpoint anchoring:** `CheckpointService.createV5()` also scans `state.prop` for `_content` values and embeds the referenced blob OIDs in the checkpoint tree. This ensures content survives GC even if patch commits are ever pruned (e.g., by future compaction or writer-chain truncation). The invariant is: **content blobs referenced by live state are always reachable from at least one ref** — either the writer ref (patch commit tree) or the checkpoint ref (checkpoint commit tree).

Integration tests verify both anchoring paths with `git gc --prune=now`.

---

## 7. Implementation Notes

No external `git-cas` dependency was needed. The existing `BlobPort` on `GitGraphAdapter` (`writeBlob` via `git hash-object -w`, `readBlob` via `git cat-file blob`) provides all required CAS operations.

Edge attachments are included in v1 (not deferred).

---

## 8. Future Work

- **Nested WARP attachments:** The paper allows `α(v)` to be a full WARP graph, not just an atom. This would mean a node's attachment is itself a graph with nodes, edges, and their own attachments. This is a significant extension beyond content blobs and is out of scope.
- **Content integrity verification:** Optionally verify blob SHA on read to detect corruption.

---

## 9. Summary

| Aspect | Decision |
|---|---|
| Where content is stored | Git object store (content-addressed blobs) |
| How content is referenced | `_content` property on nodes/edges (CAS SHA) |
| CRDT model | Existing LWW property semantics, no change |
| Time-travel | Automatic via `materialize({ ceiling })` |
| New dependency | None (uses existing BlobPort on GitGraphAdapter) |
| API shape | Hybrid: dedicated methods + direct property access |
| GC protection | Blob OIDs embedded in patch commit tree |
| Edge attachments | Included in v1 |
| Nested WARP attachments | Future work |
| Paper alignment | Implements `Atom(p)` for vertex and edge attachments |
