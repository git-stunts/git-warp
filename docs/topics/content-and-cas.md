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

Use the public content read surfaces when the caller needs content OIDs,
metadata, byte payloads, or streams. Keep `Buffer`, filesystem details, and
host-specific stream types inside adapters.

## Declared-size staging contract

When staging an asset with `expectedSize`, the declaration must be a
non-negative safe integer. The storage adapter checks the plaintext stream
before forwarding each chunk to CAS. A chunk that would exceed the declaration
is rejected before CAS receives it, producer iteration closes, and staging
cannot return a successful asset. EOF before the declared length also rejects
staging. The returned storage receipt is checked independently.

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
Legacy patch, audit, trust, strand, intent, replay, provenance, index, and migration artifacts use a 64 MiB refusal boundary; checkpoint optic shard reads retain their stricter 16 MiB boundary.
This is a defensive decoding limit, not an attachment-size limit or a claim that legacy formats have become streaming.
Artifacts exceeding the applicable ceiling fail with `E_BYTE_COLLECTION_LIMIT` instead of allocating the full payload; they require a streaming or partitioned format before they can be decoded through that path.

The bounded accumulator copies a chunk before advancing its producer, preserving bytes when the producer reuses a buffer.
Its geometric buffer growth bounds accumulator memory by a constant multiple of the requested ceiling and does not retain one object per incoming chunk.
The ceiling excludes memory already allocated by the producer and objects allocated by a subsequent decoder.
ReadableStream adaptation cancels unfinished consumption and releases its reader lock on completion, cancellation, and failure.

## Remaining attachment delivery gates

Issue #818 still requires retirement of eager attachment reads, inline binary write limits, a generated multi-GiB stream witness and an eager negative control under the same Docker memory budget.
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
