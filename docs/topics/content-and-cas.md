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

Internal attachment reads expose metadata, opaque handles, and streams.
The eager `getContent` and `getEdgeContent` methods have been removed from core,
graph, app, and query facades. Supported Runtime/Lane attachment operations are
tracked in #901. Keep `Buffer`, filesystem details, and host-specific streams
inside adapters.

## Declared-size staging contract

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

This internal safety change does not restore node/edge attachment operations
through Runtime/Lane. Their public capability and packed-consumer evidence are
tracked in #901 and #902; byte assets do not establish recursive graph ownership.

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

## Attachment evidence and remaining delivery gates

The checked-in `npm run test:attachment-memory` runner stages and drains plain and framed-encrypted 2 GiB node attachments through Git-backed storage, verifies the byte count and SHA-256, and requires an eager control to be OOM-killed under the same 384 MiB Docker memory limit and 96 MiB JavaScript heap.
The runner uses COPY-based images with no host repository mounts and writes ignored evidence to `.ratchet/attachment-memory/`.
This witness covers framed encryption and node attachments; it does not establish whole-object encryption memory bounds or supported package API reachability.
Issues #646 and #737 are already closed; their storage-plane and semantic-port outcomes remain compatibility constraints, not proof that the remaining eager readers are safe.
Issue #901 then restores supported Runtime/Lane attach, replace, clear, and stream reads, with atomic staging, retention and a packed consumer witness.
These are sequential independently mergeable PRs; no intermediate mainline may expose incomplete public attachment operations.

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
- [Operations](../operations/)
- [Troubleshooting](troubleshooting.md)
