# Retained graph manifests and ordinals

> **Status:** Internal in the unreleased v21.0.0 line ([#815](https://github.com/git-stunts/git-warp/issues/815), [#816](https://github.com/git-stunts/git-warp/issues/816)). No public API exposes these types yet. This page is the contract for their consumers, such as the Roaring selection plane ([#816](https://github.com/git-stunts/git-warp/issues/816)) and recursive graph references ([#819](https://github.com/git-stunts/git-warp/issues/819)).

A retained graph manifest is the cone basis seen as the one retained representation of a graph at a writer frontier. It adds no second persisted format. The selection plane is one more record family of the same record trie (layout 5, see [Selection shards](#selection-shards)), not a second root.

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

Only a crafted or corrupt commit carries such a dot. Every patch builder in this library mints only its own chain's dots (`DotMint`). Sync joins remote patches in memory and writes no commits. A forked lane's writer ref starts at the parent writer's commit, and the cone feed refuses that history with `E_SYNC_PATCH_HISTORY`. The cone feed checks each commit's writer, but not the dot writers inside its ops, so it folds a crafted commit unchanged. This contract does not refuse such adds at fold time; [#1132](https://github.com/git-stunts/git-warp/issues/1132) tracks that refusal.

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
| Address page | `floor(counter / 256)`: the cone dot page of that writer and kind |

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

## Selection shards

The liveness selection plane ([#816](https://github.com/git-stunts/git-warp/issues/816), slice S1) keeps, for each OR-Set, the set of live ordinals as Roaring bitmaps in the `selection` record family of the record trie. The fold keeps it current; no reader uses it yet (#816 S4).

**Geometry.** Selection geometry v1 cuts each 2^32 ordinal segment of ordinal geometry v1 into chunks of 65,536 local ordinals: one Roaring container each. A 256-counter dot page lies inside exactly one chunk.

| Fact | Value |
| --- | --- |
| Chunk | `floor(local / 65536)` inside the ordinal's segment; the offset is `local mod 65536` |
| Shard | One record per OR-Set, writer, segment and chunk. Its members are segment-local ordinals stored as one portable Roaring bitmap |
| Live dot | An add tagged an element with the dot, and no remove of that element named it. A dot that two adds tagged is live while one of them is; resolution then refuses it with `E_RETAINED_ADDRESS_DUPLICATE` |
| Shard exists | When its chunk has at least one dot with an owner. Its members are the live dots and can be empty, because the record trie never removes a record. An absent shard is an empty set |
| Directory | One per OR-Set: the chunks that have a shard, sorted by writer, segment and chunk, 256 to a page, densely packed. A reader opens page 0, 1, 2 and on until one is absent |

Owners only grow, so the set of shards, their members and the directory pages are a function of the folded patches: every fold order writes the same bytes. A remove folded before its add makes no shard; when the add comes, the shard appears, empty, exactly as after add then remove.

**What a fold writes.** A patch rewrites only the shards of the chunks whose dot pages it changes. A patch that changes no dot page, for example one that only sets properties, writes no selection record. The directory changes only when a chunk gets its first shard: the pages from the new entry's position to the end are rewritten. At 4,096 writers, the first dot of a writer that sorts first rewrites all 17 directory pages. The fold session never holds more than 4,096 staged records, shards and directory pages included: it writes them through as soon as it holds that many, also between two records of one patch.

**Page limits.**

| Unit | Bound |
| --- | --- |
| Shard bytes | 8,208 at most: one container, and its key is the chunk index |
| Shard members | 65,536 at most |
| Directory page | 1 to 256 chunks, in ascending order, all of the page's OR-Set; every page but the last is full |

The codec inspects a stored shard against these bounds before the Roaring library reads it, run-optimizes a bitmap before it serializes it, and disposes every bitmap it creates. A shard holds its members as plain integers, so no WASM memory outlives a codec call. `npm run test:selection-memory` folds two generated histories under a 384 MiB container limit and reports the peak staged records and the peak RSS.

**Refusals.**

| Code | When |
| --- | --- |
| `E_CONE_RECORD_CORRUPT` (`ConeRecordError`), `context.decodeCode` `E_ROARING_SHARD_TOO_LARGE` or `E_ROARING_SHARD_MALFORMED` | A stored shard has more than 8,208 bytes, is not portable Roaring, has more than one container (fault `chunk-containers`), or has the container of another chunk (fault `chunk-key`) |
| `E_CONE_RECORD_CORRUPT` (`ConeRecordError`) | The directory lists a chunk whose shard is absent, or its pages are not densely packed in ascending order. The fold refuses when it next adds a chunk to that directory |
| `E_CONE_RECORD_INVALID` (`ConeRecordError`) | A shard's offsets do not ascend inside the chunk, or name counter 0; a directory page lists no chunk, more than 256, or chunks out of order |
| `E_RETAINED_GEOMETRY_UNSUPPORTED` | A shard or directory page to encode is of a selection geometry other than v1 |

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
| `E_RETAINED_ORDINAL_INVALID` | An ordinal kind, or the kind of an `IdentifierDictionary` lookup, is not `node` or `edge` (the lookup reads nothing); a segment or pin lacks a valid part; or an ordinal lies outside the page asked |
| `E_RETAINED_GEOMETRY_UNSUPPORTED` | The ordinal geometry is not v1, or the selection geometry of a shard to encode is not v1: the only ones the record trie stores |
| `E_RETAINED_GEOMETRY_INVALID` | A geometry has an invalid shape |
| `E_RETAINED_PAGE_INVALID` | An address page is not a cone dot page |
| `E_RETAINED_MANIFEST_INVALID` | A manifest or commitment lacks a valid part |
| `E_MISSING_OBJECT` (`PersistenceError`) | The record-trie root or a record is absent from the repository |
| `E_CRDT_INVALID_MINT_ID` (`CrdtError`) | The ordinal's writer id is not a mint id, for example an empty string |
| `E_INVALID_WRITER_ID` (`WarpError`) | The ordinal's writer id is not a valid writer chain name, for example one with a `/` |
| `E_CRDT_INVALID_COUNTER` (`CrdtError`) | The ordinal's counter is not a positive safe integer |
| `E_CONE_RECORD_CORRUPT` (`ConeRecordError`) | The basis tree's `records` entry is not a tree, the records root or a trie directory below it is not a tree, or a stored record or page does not decode or does not match its trie path. Opening the manifest refuses the first case; the others refuse at the first read. The `cone/retained` ring is read through the same check, so one such entry refuses `retained(lane)` as a whole |
| `E_CONE_RECORD_INVALID` (`ConeRecordError`) | The identifier of an `edge` lookup is not an encoded edge key |
| `E_CONE_LAYOUT_UNSUPPORTED` (`ConeRecordError`) | The basis head or a retained entry uses an older record-trie layout, layout 4 included |
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

- A **layout-5** cone head opens as a schema-1 manifest. A layout-5 head is what this release writes.
- A head or retained entry of an older layout (1 to 4) refuses with `E_CONE_LAYOUT_UNSUPPORTED`. Layout 4 has no selection shards (#816), so a selection over it would read every chunk as empty. Nothing rebuilds such a head automatically. Delete the clone-local cone refs of the lane: `refs/warp/<graph>/cone/head`, the strand refs under `refs/warp/<graph>/cone/strands/`, and `refs/warp/<graph>/cone/retained`, whose layout-4 entries also refuse. git-warp then folds the lane again from the writer chains, as [operations](../operations/README.md) describes for a damaged cone head. No release wrote layout 4: the cone record store is not in v20.0.0, so only repositories that ran pre-release v21 code have layout-4 heads.
- The layout marker is part of the schema-1 commitment, so a manifest of a layout-5 basis has another commitment than the layout-4 manifest at the same frontier. A pin made under layout 4 refuses with `E_RETAINED_MANIFEST_MISMATCH`. Pin it again; ordinals do not change.
- Manifests and bases are derived, clone-local state. To recover, rebuild from the writer chains. The commitment at the same frontier is unchanged, so pins still resolve.
- Schema 2 will add #1044 slice 1's canonical basis commitment to the preimage. Schema-1 pins then fail with `E_RETAINED_MANIFEST_MISMATCH`. Pin them again; ordinals do not change, so no data is lost.
- Schema 1 cannot detect a records root that is not the fold of its frontier, for example a stale graft or a store defect. A pin resolves under that root without refusal. Structural corruption still refuses (`E_CONE_RECORD_CORRUPT`, `E_MISSING_OBJECT`). Detection arrives with schema 2, which commits to #1044 slice 1's basis commitment over record digests.
- Retention of manifests through git-cas pages, bundles and `publications.commit` belongs to #1044 slice 2. Until then, the basis head and the `cone/retained` ref keep a manifest reachable. A retained checkpoint and the live head of one basis are the same manifest.
