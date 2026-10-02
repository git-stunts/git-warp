# Content and CAS

Use this page when graph data includes larger content payloads, encrypted
content, or content-addressed storage behavior that matters operationally.

`git-warp` stores graph history in Git. Content payloads can be routed through
`@git-stunts/git-cas` so the graph carries stable content-addressed pointers
instead of forcing every payload into ordinary inline patch data.

## What CAS owns

CAS is the content storage boundary. It can own:

- chunked content blobs;
- content-addressed tree OIDs;
- CAS payload pointers from graph/index storage;
- encrypted content manifests;
- persistent seek or index cache payloads where configured.

The graph model still owns causal history, refs, patches, checkpoints, reads,
and replay semantics. Do not treat CAS as a second graph database.

## Content attachments

Content attachments are useful when a node or edge needs associated bytes that
should not be modeled as scalar properties. The graph stores the causal fact
that content is attached; blob storage stores the bytes.

The unreleased source API supports Runtime/Lane staging, node and edge attachment intents, metadata observations, and stream reads through supported package exports. These operations are exercised against an installed source-built tarball; this is not a claim that the published `v19.1.0` package contains the restored API. The eager `getContent` and `getEdgeContent` facades are retired. Application bytes are `Uint8Array`; host streams, filesystem details and `Buffer` stay at adapters.

## Bytes, references and structural ownership

| Payload | Meaning | Mutation and retention |
| --- | --- | --- |
| Node/edge property | Inline graph data; a string containing an identifier remains ordinary data | Follows property and owner lifecycle; nested binary writes have the inline budget below |
| Managed byte attachment | An opaque immutable asset staged by this Runtime and associated with an existing node or edge | Attach replaces, clear removes the current association; publication/history determine retention |
| External or live graph reference | Names separately governed state; a live reference requires a captured resolution coordinate | Does not own descendants, grant mutation authority, or establish recursive retention; reference networks may contain cycles |
| Finite structural attachment | An owned graph occurrence admitted with complete finite, acyclic containment and distinct lineage | Protected descendants require one injective preserved image; implicit delete/detach/whole-subtree replacement/copy is refused by the intended contract |

The [structural ownership contract](structural-attachments.md) defines the last two distinctions from pinned Paper I/II sources and test-only reference witnesses. The source attachment API handles opaque bytes; storing graph identifiers in properties or assets does not implement that ownership contract. Reference encoding [#819](https://github.com/git-stunts/git-warp/issues/819), bounded traversal [#820](https://github.com/git-stunts/git-warp/issues/820), and retention/doctor enforcement [#821](https://github.com/git-stunts/git-warp/issues/821) remain separate implementation work. Byte lifecycle tests and convergent CRDT patches do not establish Paper II DPOI or tick guarantees.

## Declared-size staging contract

`Lane.stageContent(source, { mime, size })` accepts text, `Uint8Array`, `ReadableStream<Uint8Array>` or `AsyncIterable<Uint8Array>`. Both metadata fields are optional; `size` declares the expected plaintext byte count. The immutable result exposes `id`, `mime` and the measured `size`, without retaining the input bytes.

Staging is owned by the Runtime and works on worldline and strand lanes. Closing the Runtime waits for active staging to finish and refuses new staging work. A staging or producer failure publishes no graph patch. The returned value records staging provenance; copied metadata cannot substitute for that value. It does not establish durable retention or constitute a node/edge attachment by itself.

## Attachment writes

Stage through `lane.stageContent(...)`, then pass that exact staged value to `intent.node.attachContent({ subject, content })` or `intent.edge.attachContent({ from, to, label, content })` from `@git-stunts/git-warp/advanced`. Submit the resulting intents through `lane.write(...)`. The [runnable lifecycle example](../../examples/attachments.mjs) creates both owners and attaches the same immutable asset in one ordered array write.

Attaching again replaces that owner's attachment. `intent.node.clearContent({ subject })`
and `intent.edge.clearContent({ from, to, label })` remove the current association;
historical attachment facts remain part of causal history. Check the write receipt:
an absent owner produces an obstruction, and a failure in one array member publishes
none of the array. A staged value from another Runtime is refused, even if it uses
the same repository. Staging that becomes unavailable before publication also fails
without advancing the graph's publication ref.

Worldline owner checks use a captured, bounded journal observation, not an implicit
full graph materialization. They share its refusal limits with node removal:
1,024 writers, 10,000 patches, 50,000 operations and membership/text bounds.
Long histories or high incident-edge fanout can exceed that profile; an obstruction
is not evidence that the requested owner is absent. The packed-consumer witness exercises both owner types through the installed artifact.

## Stream observations

Use `createNodeContentObserver({ subject })` or `createEdgeContentObserver({ from, to, label })` from `@git-stunts/git-warp/advanced`, then consume `await lane.observe(observer).one()`. The [same runnable example](../../examples/attachments.mjs) checks node metadata and reads both owners by iterating `reading.value.open()`. Forward chunks to a consumer-owned asynchronous destination; the example's text collector is only for its tiny known payloads, not large assets.

A reading contains a frozen owner, opaque content identity, `mime` and `size`. The metadata fields may be `null`: absent or legacy metadata without the winning content's causal lineage is not combined with that asset. A missing attachment association emits a `null` reading value. A captured reading opens its original bytes after later replacement, clearing or owner removal. It requires the originating Runtime to remain open and the retained history/storage to remain available.

Content observations capture writer heads once and replay those immutable histories,
retaining only the selected owner's membership and content registers. This is a
bounded full-history scan, not an indexed checkpoint-tail lookup. Its refusal profile
is 1,024 writers, 10,000 patches, 50,000 operations, 50,000 retained text entries and
8 Mi UTF-16 text units; artifact decoding also has the existing 64 MiB bound.
An exceeded profile or unavailable history yields an obstructed observation,
not a claim of absent content. Strands use their pinned parent and overlay heads.

An unused reading or unused `open()` iterable holds no activity lease. Consumption
acquires a lease; Runtime close waits for active consumption to finish. Breaking
iteration forwards cancellation to storage and releases the lease, including when
storage throws. Starting consumption after close is refused. Cancel a stream you
stop consuming before awaiting Runtime close; close does not forcibly abort it.

## Concurrency, failure and retention

Each `lane.write([...])` is one admitted patch and one receipt: the whole ordered array publishes, or none of its graph edits does. Separate writes remain separate admissions. Staging may leave unreferenced storage objects after failure, but it cannot publish a prefix of an attachment write. Validate the receipt's outcome rather than treating a resolved write promise as unconditional success.

Concurrent writers may propose different assets for the same owner. Causal materialization selects the winning content register deterministically and takes MIME and size from that winning content's lineage; it does not combine metadata from a losing asset. This is CRDT conflict resolution, not the structural reference scheduler. Separate observations capture their heads separately, so observing a node and edge in separate calls does not promise one cross-owner snapshot while writers continue changing them.

A missing write owner is an obstruction and preserves the other array members' prior values. A missing observation association emits `null` only when the bounded history establishes that absence. Unavailable/truncated history or an exceeded observation budget obstructs the observation. Missing payload storage can instead fail when an already captured attachment is opened; metadata alone does not prove current byte availability. Invalid or copied staging metadata, foreign Runtime provenance, producer failure and declared-size mismatch are failures, not admitted writes.

Durable attachment publication retains its asset with owner metadata; staging alone does not. Clearing, replacing, or removing an owner does not rewrite historical facts or promise immediate physical collection. The installed-package witnesses retain a fork/checkpoint, close, run Git collection in their disposable repository, and reopen both current and historical assets. That is evidence for retained-history roots, not permission to prune arbitrary repositories or a promise that an attachment stays available after its Runtime or required storage/history is gone. No recursive ownership retention follows from a byte asset.

## Run the installed-package example

The reusable [example](../../examples/attachments.mjs) is the consumer recipe owned by [#902](https://github.com/git-stunts/git-warp/issues/902). It imports only the root package, the advanced subpath and Node builtins. It asserts node and edge attach/replace/clear, metadata, captured historical bytes, early stream termination and reopening. Its CLI accepts a disposable Git repository and closes the Runtime in `finally`.

Run its existing acceptance harness from a source checkout:

```bash
bash scripts/run-in-docker.sh bash scripts/smoke-packed-artifact.sh
```

The COPY-only gate builds and installs the actual npm tarball into a fresh consumer outside the source checkout, checks supported import syntax, typechecks the example under NodeNext and Bundler resolution, and executes it with the packed fixtures. No private implementation import or host repository mount is needed. This validates the source-built artifact; installing a released version with the same numeric source metadata is not a substitute.

| Established behavior | Executable evidence |
| --- | --- |
| Both owners attach, replace, clear, expose metadata and preserve captured bytes | [Reusable lifecycle example](../../examples/attachments.mjs) |
| Generated 64 MiB streaming, producer failure, early termination, close refusal and retained reopen | [Packed public lifecycle fixture](../../test/fixtures/packed-content.mjs) |
| Concurrent writers converge with matching winning MIME/size, foreign/copied values and missing owners refuse without partial writes, size/cancellation failures preserve refs, missing bytes fail, retained snapshot survives reopen | [Packed consumer fixture](../../test/fixtures/packed-content-consumer.mjs) |
| Observation obstruction and unexpected failure propagation; active-stream lease cleanup and cancellation | [Runtime content observation tests](../../test/unit/application/RuntimeContentObservation.test.ts), [reading tests](../../test/unit/application/RuntimeContentReading.test.ts) |
| Bounded projection, causal metadata compatibility and node/edge removal parity | [Projection tests](../../test/unit/domain/services/ContentReadProjection.test.ts), [removal parity tests](../../test/unit/domain/services/ContentReadRemovalParity.test.ts) |

The 64 MiB generated payload is a streaming witness, not an attachment-size ceiling. The eager artifact decoding limits below govern different inputs.

## Storage size validation

When staging an asset with `expectedSize`, the declaration must be a
non-negative safe integer. The storage adapter checks the plaintext stream
before forwarding each chunk to CAS. A chunk that would exceed the declaration
is rejected before CAS receives it, producer iteration closes, and staging
cannot return a successful asset. EOF before the declared length also rejects
staging. The returned storage receipt is checked independently for unencrypted assets.
Encrypted CAS receipts describe stored ciphertext size; WARP records the fully
consumed plaintext count instead. Storage cannot return success before input EOF.

An absent declaration retains streaming storage behavior without imposing an
arbitrary attachment-size cap. This boundary does not collect the asset and
cannot prevent a producer from allocating an oversized chunk before yielding
it. Producer allocation limits and bounded convenience collectors are separate
requirements of issue #818.

The size check alone does not establish an attachment or its retention. The restored public capability and installed-package evidence are supplied by [#901](https://github.com/git-stunts/git-warp/issues/901) and [#902](https://github.com/git-stunts/git-warp/issues/902); byte assets do not establish recursive graph ownership.

## Bounded artifact decoding

Internal eager decoders now pass an explicit byte ceiling to `collectAsyncIterable`.
Legacy patch, audit, trust, strand, intent, replay, provenance, index, raw graph blob, and migration artifacts use a 64 MiB refusal boundary; checkpoint optic shard reads retain their stricter 16 MiB boundary.
This is a defensive decoding limit, not an attachment-size limit or a claim that legacy formats have become streaming.
Artifacts exceeding the applicable ceiling fail with `E_BYTE_COLLECTION_LIMIT` instead of allocating the full payload; they require a streaming or partitioned format before they can be decoded through that path.

The bounded accumulator copies a chunk before advancing its producer, preserving bytes when the producer reuses a buffer.
Its geometric buffer growth bounds accumulator memory by a constant multiple of the requested ceiling and does not retain one object per incoming chunk.
The v18-to-v19 migration also refuses patch trees, raw Git command output, and eager Git object reads above 64 MiB; oversized batch objects are drained in bounded windows so later requests remain synchronized.
This is a refusal boundary for legacy migration, not a claim that large legacy byte payloads migrate by streaming.
The ceiling excludes memory already allocated by the producer and objects allocated by a subsequent decoder.
ReadableStream adaptation cancels unfinished consumption and releases its reader lock on completion, cancellation, and failure.

## Inline binary write budget

New intent and patch property writes permit at most 64 KiB of aggregate binary data per property value, counting every nested binary occurrence before copying its bytes into a defensive snapshot.
An oversized value fails with `E_INLINE_BINARY_LIMIT` and directs the caller to a streaming content asset.
The limit applies to node, edge and entity initial properties through their shared validation boundaries; it does not retroactively truncate historical property reads.
Strings and other nonbinary property data are outside this binary-specific budget.

## Transfer planning

Coordinate and strand transfer plans carry attachment handles, MIME metadata and declared size, never payload bytes.
Planning performs no attachment storage reads and cannot retain a collection of full assets in its operation list.
The canonical transfer fact already identifies content by handle and metadata, so this change preserves its digest inputs.
Consumers must open or retain the referenced assets when executing a plan; a plan is not a payload archive or proof of current storage availability.

## Storage memory evidence

The checked-in `npm run test:attachment-memory` runner stages and drains plain and framed-encrypted 2 GiB node attachments through Git-backed storage, verifies the byte count and SHA-256, and requires an eager control to be OOM-killed under the same 384 MiB Docker memory limit and 96 MiB JavaScript heap.
The runner uses COPY-based images with no host repository mounts and writes ignored evidence to `.ratchet/attachment-memory/`.
This witness covers framed encryption and node attachments; it does not establish whole-object encryption memory bounds or supported package API reachability.
Issues #646 and #737 are already closed; their storage-plane and semantic-port outcomes remain compatibility constraints, not proof that the remaining eager readers are safe.
The installed-package gate above separately establishes the restored Runtime/Lane consumer route. A storage-only memory witness does not substitute for that route, and the public 64 MiB witness does not prove every storage scheme or producer allocation is bounded.

## Encryption policy

Observer redaction is not encryption. Redaction changes what a selected read
path returns. It does not rewrite patch history, delete Git objects, or protect
raw objects from a local operator.

Use `CasContentEncryptionPolicy` when stored bytes need protection at rest:

```typescript
const casContentEncryption = CasContentEncryptionPolicy.fromResolvedVaultKey({
  encryptionKey: resolvedVaultKey,
  scheme: 'framed',
  frameBytes: 64 * 1024,
  vault: {
    vaultSlug: 'graphs/team/content',
    keyId: 'content-kek-2026-06',
    verification: 'verified',
    rotationEpoch: 3,
    encryptionCount: 512,
    encryptionCountLimit: 4294967295,
    privacyMode: true,
  },
});
```

The supported current schemes are:

| Scheme | Use when |
| --- | --- |
| `framed` | You want the normal streaming-friendly encrypted content path. |
| `whole` | Simplicity matters more than streaming behavior. |
| `convergent` | Deduplication matters and equality leakage is acceptable. |

Legacy git-cas encryption schemes must be migrated before current writes or
restores depend on them.

## Operational failures

Treat these as content/CAS problems, not query problems:

- missing CAS manifest;
- missing blob storage configuration for a CAS pointer;
- wrong vault passphrase;
- missing vault metadata;
- vault rotation limit reached;
- legacy encryption scheme encountered;
- unsupported encryption scheme;
- invalid frame size.

The right recovery depends on the failure. In general: restore or configure the
blob storage first, resolve and verify vault material before constructing the
graph adapter, and migrate legacy encrypted manifests before rewriting them.

## See also

- [Git substrate](git-substrate.md)
- [Observers](observers.md)
- [Structural attachment ownership](structural-attachments.md)
- [Attachment API migration](../migrations/v19/README.md#attachment-api-restoration-unreleased-source)
- [Operations](../operations/)
- [Troubleshooting](troubleshooting.md)
