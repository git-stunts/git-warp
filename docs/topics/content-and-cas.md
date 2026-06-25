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
