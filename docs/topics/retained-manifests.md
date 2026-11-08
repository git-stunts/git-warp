# Retained graph manifests and ordinals

> **Status:** Internal in the unreleased v21.0.0 line ([#815](https://github.com/git-stunts/git-warp/issues/815)). No public API exposes these types yet. This page is the contract for their consumers, such as the Roaring selection plane ([#816](https://github.com/git-stunts/git-warp/issues/816)) and recursive graph references ([#819](https://github.com/git-stunts/git-warp/issues/819)).

A retained graph manifest is the cone basis seen as the one retained representation of a graph at a writer frontier. It adds no second persisted format. The basis tree, the layout-4 record trie and the record codecs do not change.

```text
RetainedGraphManifest
  schema 1
  layout      record-trie layout marker of the store
  geometry    ordinal geometry v1
  basis       record-trie root + writer frontier
  commitment  BLAKE3 over schema, layout, geometry and frontier
```

## Ordinals and pins

A graph-local ordinal is one dot `(kind, writer, counter)` of the node or edge OR-Set. A writer mints its counters in its own chain order, so an ordinal depends only on that chain, never on fold or arrival order. An ordinal is stable across every manifest.

A pin (`ManifestOrdinal`) is an ordinal bound to one manifest commitment. Only a manifest with that commitment resolves it.

- A selection plane keys to ordinals. It stays valid across successor manifests.
- A reference that must name one basis keys to a pin.

## Geometry v1

| Fact | Value |
| --- | --- |
| Segment | `floor(counter / 2^32)`; the local ordinal is `counter mod 2^32`, a 32-bit integer |
| Segment 0 | Holds 2^32 − 1 ordinals: counters start at 1, so local 0 of segment 0 is never used |
| Segment index | At most `floor(MAX_SAFE_INTEGER / 2^32)` = 2,097,151 |
| Fan-out | Segments exist per writer and per kind. A whole-graph selection is the union over every writer × kind × segment |
| Density | Node and edge ordinals share one writer's counter sequence (one counter per operation), so each kind's segment has gaps |
| Address page | `floor(counter / 256)`: the layout-4 cone dot page of that writer and kind |

A writer that exhausts a segment continues in the next segment. No global limit gets wider.

## Page limits

| Unit | Bound |
| --- | --- |
| Address page | One cone dot page: one writer, one kind, at most 256 counters |
| Page bytes, items and depth | Each page is decoded on its own under the shared CBOR ceilings: 5 MiB, depth 32, 1,000,000 items and container entries. The dot-page wire depth is at most 4 |
| Resolution | One record per ordinal. In the Git store that is the records root tree, one tree per trie directory on the record's path (the family directory included), and one blob |
| Identifier lookup | One element record |
| Opening a manifest | The basis bundle only; no record |
| Manifest width | The writer frontier, one blob under the same CBOR ceiling |

## Refusals

Every refusal is a typed `RetainedGraphError`, except where noted.

| Code | When |
| --- | --- |
| `E_RETAINED_WRITER_NOT_FOLDED` | The ordinal's writer chain is not in the manifest's frontier. Nothing is read |
| `E_RETAINED_ADDRESS_MISSING` | No element was added under the ordinal. This includes a counter past the writer's folded prefix: the frontier has no counter high-water, so such a counter pins and then reads one empty page |
| `E_RETAINED_ADDRESS_DUPLICATE` | More than one element was added under one dot |
| `E_RETAINED_ADDRESS_KIND_MISMATCH` | The ordinal and its page or record are of different kinds |
| `E_RETAINED_MANIFEST_MISMATCH` | A pin was resolved against another manifest. Nothing is read |
| `E_RETAINED_ORDINAL_OUT_OF_RANGE` | A counter, segment or local ordinal lies outside the geometry |
| `E_RETAINED_ORDINAL_INVALID` | An ordinal or segment breaks its invariants, or lies outside the page asked |
| `E_RETAINED_GEOMETRY_UNSUPPORTED` | The geometry is not v1, the only one layout 4 stores |
| `E_RETAINED_GEOMETRY_INVALID` | A geometry has an invalid shape |
| `E_RETAINED_PAGE_INVALID` | An address page is not a cone dot page |
| `E_RETAINED_MANIFEST_INVALID` | A manifest or commitment lacks a valid part |
| `E_MISSING_OBJECT` (`PersistenceError`) | The record-trie root or a record is absent from the repository |

## Schema-1 commitment

The commitment is BLAKE3 over these fields, in order. Each field is written as its UTF-8 byte length in decimal, a colon, and its UTF-8 bytes:

1. `git-warp retained graph manifest`
2. `schema 1`
3. the record-trie layout marker
4. `ordinal geometry v1: segment 4294967296, page 256`
5. `frontier N`, where N is the number of writers
6. for each writer, in writer-id order: the writer id, the patch sha, and the Lamport clock in decimal

The record-trie root is not committed. In a CRDT the frontier fixes the logical state, and ordinals derive only from writer chains. The root is a physical artifact of fold order: adjacency pages keep arrival order until #1044 slice 1. So a live clone and a rebuild at the same frontier share one commitment, and a pin survives recovery.

The manifest commitment is not the basis commitment that [#1044](https://github.com/git-stunts/git-warp/issues/1044) slice 1 owns. That one is a digest over record digests.

## Upgrade and recovery

- Existing cone heads open as schema-1 manifests without migration.
- Manifests and bases are derived, clone-local state. To recover, rebuild from the writer chains. The commitment at the same frontier is unchanged, so pins still resolve.
- Schema 2 will add #1044 slice 1's canonical basis commitment to the preimage. Schema-1 pins then fail with `E_RETAINED_MANIFEST_MISMATCH`. Pin them again; ordinals do not change, so no data is lost.
- Retention of manifests through git-cas pages, bundles and `publications.commit` belongs to #1044 slice 2. Until then, the basis head and the `cone/retained` ref keep a manifest reachable. A retained checkpoint and the live head of one basis are the same manifest.
