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

A graph-local ordinal is one dot `(kind, writer, counter)` of the node or edge OR-Set. It is a key into one address page: the dot page of that writer and kind. It is not an element identity.

**Guarantee.** These hold for any two manifests *M* and *M′* of one lane, where *M′*'s frontier includes *M*'s frontier (*M′* = *M* is allowed), and the two exceptions below do not apply:

1. At one writer frontier, every basis gives an ordinal the same resolution, whatever fold or arrival order built it.
2. If the ordinal resolves under *M* to element *e*, it resolves to *e* under *M′*. This includes the case where *e* was removed later (see "One element, several ordinals").
3. If the ordinal refuses under *M* with `E_RETAINED_ADDRESS_MISSING`, it can resolve under *M′*, once its writer's chain reaches that counter. A refusal is not permanent. A success is.

A selection plane can key to ordinals on this basis.

**Exception 1: a reused counter (the [#1022](https://github.com/git-stunts/git-warp/issues/1022) duplicate-dot class).** A writer chain written before [#1013](https://github.com/git-stunts/git-warp/issues/1013) could reset its counter, so a later patch of the same writer can add a second element under a dot already used. Under the first manifest, the ordinal resolves to the first element. Under every successor that folds the second add, it refuses with `E_RETAINED_ADDRESS_DUPLICATE`, and `IdentifierDictionary` returns that ordinal for both identifiers. New writers cannot produce this. Lane writers mint above the allocation floor ([#1021](https://github.com/git-stunts/git-warp/issues/1021), `openDotMint`). Strand chains mint above the high-water of their own patches and queued intents (`dotMintAfterPatches`).

**Exception 2: another writer's dot.** The fold does not check that an add's dot belongs to the writer of the patch that carries it. If a folded patch of writer *X* adds an element under a dot of writer *Y*:

- *Y*'s ordinal can resolve to an element *Y*'s chain never added;
- it can refuse with `E_RETAINED_ADDRESS_DUPLICATE` when *Y* also added an element under that dot;
- it can change from resolved to `E_RETAINED_ADDRESS_DUPLICATE` at a successor in which *Y* mints that counter;
- when *Y* is not folded, `IdentifierDictionary` can return *Y*'s ordinal, and the same manifest refuses it with `E_RETAINED_WRITER_NOT_FOLDED`.

Only a crafted or corrupt commit carries such a dot. Every patch builder in this library mints only its own chain's dots (`DotMint`). Sync joins remote patches in memory and writes no commits. A forked lane's writer ref starts at the parent writer's commit, and the cone feed refuses that history with `E_SYNC_PATCH_HISTORY`. The cone feed checks each commit's writer, but not the dot writers inside its ops, so it folds a crafted commit unchanged. This contract does not refuse such adds at fold time.

Each exception gives a typed refusal or a resolution that does not change for that frontier. No exception makes a resolution depend on fold order.

A pin (`ManifestOrdinal`) is an ordinal bound to one manifest commitment. A schema-1 commitment names one lane's writer frontier, and so one logical state. It does not name a records root. Two bases at one frontier have one commitment even when their roots differ, as a live clone and a rebuild do. So a pin resolves under either of them.

- A selection plane keys to ordinals. Its keys stay valid across successor manifests, as stated above.
- A reference that must name one logical state keys to a pin.

### One element, several ordinals

- An element has one ordinal for each add that tagged it. A re-add, or a concurrent add by another writer, gives the same element a further ordinal. `IdentifierDictionary.ordinalsOf` returns all of them, live or removed, ordered by writer and then by counter.
- Resolution reports which element an add tagged. It does not report liveness. An ordinal whose element was removed still resolves to that element. To select live elements, a plane must intersect with liveness from the element's record. A resolution alone is not enough.
- `addresses()` on a page lists every ordinal that has an owner, removed or not. It skips only claims whose dot was named by a remove and never by an add.
- `E_RETAINED_ADDRESS_DUPLICATE` means that more than one element was added under one dot. This can be legitimate old history (exception 1), a foreign dot (exception 2), or corruption. It is not proof of corruption.

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
| Page bytes, items and depth | Each page is decoded on its own under the shared CBOR ceilings: 5 MiB, depth 32, 1,000,000 items and container entries. The dot-page wire depth is at most 4. The ceilings apply at decode: the Git store reads a page blob in full first. A bounded read belongs to #1044 slice 2 |
| Resolution | One record per ordinal. In the Git store that is the records root tree, one tree per trie directory on the record's path (the family directory included), and one blob |
| Identifier lookup | One element record |
| Opening a manifest | The basis bundle only; no record |
| Manifest width | The writer frontier, one blob under the same CBOR ceiling |

## Refusals

Every refusal is a typed `WarpError`. The codes this contract owns are `RetainedGraphError` codes. The rows marked with another class come from the layers below.

| Code | When |
| --- | --- |
| `E_RETAINED_WRITER_NOT_FOLDED` | The ordinal's writer chain is not in the manifest's frontier. Nothing is read |
| `E_RETAINED_ADDRESS_MISSING` | No element was added under the ordinal. This includes a counter past the writer's folded prefix: the frontier has no counter high-water, so such a counter pins and then reads one empty page |
| `E_RETAINED_ADDRESS_DUPLICATE` | More than one element was added under one dot |
| `E_RETAINED_ADDRESS_KIND_MISMATCH` | The ordinal and its page or record are of different kinds |
| `E_RETAINED_MANIFEST_MISMATCH` | A pin was resolved against another manifest. Nothing is read |
| `E_RETAINED_ORDINAL_OUT_OF_RANGE` | A counter, segment or local ordinal lies outside the geometry |
| `E_RETAINED_ORDINAL_INVALID` | An ordinal kind is not `node` or `edge`, a segment or pin lacks a valid part, or an ordinal lies outside the page asked |
| `E_RETAINED_GEOMETRY_UNSUPPORTED` | The geometry is not v1, the only one layout 4 stores |
| `E_RETAINED_GEOMETRY_INVALID` | A geometry has an invalid shape |
| `E_RETAINED_PAGE_INVALID` | An address page is not a cone dot page |
| `E_RETAINED_MANIFEST_INVALID` | A manifest or commitment lacks a valid part |
| `E_MISSING_OBJECT` (`PersistenceError`) | The record-trie root or a record is absent from the repository |
| `E_CRDT_INVALID_MINT_ID` (`CrdtError`) | The ordinal's writer id is not a mint id, for example an empty string |
| `E_INVALID_WRITER_ID` (`WarpError`) | The ordinal's writer id is not a valid writer chain name, for example one with a `/` |
| `E_CRDT_INVALID_COUNTER` (`CrdtError`) | The ordinal's counter is not a positive safe integer |
| `E_CONE_RECORD_CORRUPT` (`ConeRecordError`) | The basis tree's `records` entry is not a tree, the records root is not a tree, or a stored record or page does not decode or does not match its trie path. Opening the manifest refuses the first case. The `cone/retained` ring is read through the same check, so one such entry refuses `retained(lane)` as a whole |
| `E_CONE_RECORD_INVALID` (`ConeRecordError`) | A kind outside `node` and `edge` reached a record lookup |
| `E_CONE_LAYOUT_UNSUPPORTED` (`ConeRecordError`) | The basis head or a retained entry uses an older record-trie layout |
| `E_CBOR_DECODE_BOUNDS` (`MessageCodecError`) | The basis frontier blob does not decode |
| `E_CONE_STORE_UNAVAILABLE` (`ConeStoreUnavailableError`) | The store could not be reached. This is not corruption, so the caller may retry |

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

- Existing **layout-4** cone heads open as schema-1 manifests without migration. A head or retained entry of an older layout (1 to 3) refuses with `E_CONE_LAYOUT_UNSUPPORTED`. Rebuild it from the writer chains. A layout-4 head is what this release writes.
- Manifests and bases are derived, clone-local state. To recover, rebuild from the writer chains. The commitment at the same frontier is unchanged, so pins still resolve.
- Schema 2 will add #1044 slice 1's canonical basis commitment to the preimage. Schema-1 pins then fail with `E_RETAINED_MANIFEST_MISMATCH`. Pin them again; ordinals do not change, so no data is lost.
- Schema 1 cannot detect a records root that is not the fold of its frontier, for example a stale graft or a store defect. A pin resolves under that root without refusal. Structural corruption still refuses (`E_CONE_RECORD_CORRUPT`, `E_MISSING_OBJECT`). Detection arrives with schema 2, which commits to #1044 slice 1's basis commitment over record digests.
- Retention of manifests through git-cas pages, bundles and `publications.commit` belongs to #1044 slice 2. Until then, the basis head and the `cone/retained` ref keep a manifest reachable. A retained checkpoint and the live head of one basis are the same manifest.
