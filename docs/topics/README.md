# Topics

Use these pages when you know what `git-warp` is and want the right page for a
specific task.

## Current release: v20.0.0

`v20.0.0` preserves the Runtime/Lane application grammar while
restoring node and edge byte attachments and introducing node-wide LWW property
clears alongside observed-remove membership. Upgrade readers and writers together,
retain historical interpreter identity, and regenerate derived checkpoints:
[v20 upgrade guidance](../migrations/v19/README.md#upgrade-v19-to-v20) describes the
boundary. Existing Git history is not rewritten by that interpretation upgrade.

The Entity surface and its admission inventory remain unofficial previews.
Membership compaction preserves evidence, and property reclamation does not bound
total metadata. See [Property reclamation](property-reclamation.md),
[Membership compaction](membership-compaction.md), [Content and CAS](content-and-cas.md),
[Operations](../operations/) and the root [CHANGELOG](../../CHANGELOG.md).
The named v19.1.0 performance witness below is historical evidence.

## Start here

- [Getting started](getting-started.md): install the package, open a Runtime and
  Lane, write an Intent, observe a bounded value, and keep its Receipt.
- [v19 public vocabulary checkpoint](api/): follow the accepted Runtime, Lane,
  Intent, Observer, Observation, Reading, and Receipt contract.
- [Generated v19 public vocabulary](vocabulary.generated.md): use the canonical
  noun summaries lowered from the Wesley/GraphQL registry.
- [Querying](querying.md): choose between worldlines, observers, optic reads,
  query builders, and strand sources.

## Read and observe

- [Optic reads](optic-reads.md): ask bounded questions of causal history.
- [Observers](observers.md): expose a filtered read surface through an aperture.
- [Entity admission inventory](entity-admission-inventory.md): stream every
  retained entity birth at one exact Lane basis and certify completeness.
- [Strands](strands.md): keep speculative work durable and separate from live
  truth.

## Substrate and boundaries

- [CRDT construction](crdt-construction.md): validate membership and register
  identities, preserve legacy checkpoint ordering, and keep encoding at boundaries.
- [Git substrate](git-substrate.md): understand WARP refs, patch commits,
  checkpoints, replay, and provenance.
- [Git performance](git-perf.md): understand the measured persistent Git
  session design, bounded-memory policy, and rejected native backends.
- [v19.1.0 release witness](v19-1-performance-architecture-witness.md): trace
  Corpus 19C0FFEE from route-key bytes through trie splits, bounded write waves,
  compound retention, hosted performance, compatibility, and publication.
- [Content and CAS](content-and-cas.md): handle content attachments,
  content-addressed storage, and encrypted CAS payloads.
- [Structural attachment ownership](structural-attachments.md): distinguish
  finite owned descendants from opaque bytes and external/live references.
- [WARP state-cache materialization](cas-first-memoized-materialization.md):
  skip redundant live materialization replay through coordinate-addressed
  state-cache snapshots backed by `git-cas`.
- [Continuum boundary](continuum-boundary.md): understand what git-warp owns
  locally and what Continuum owns as boundary vocabulary.

## Operate

- [CLI](cli.md): inspect, validate, debug, and time-travel a live repository.
- [Sync](sync.md): move WARP refs between clones and inspect sync status.
- [Source-backed reference](reference.md): generated API, CLI, entrypoint, and
  error inventories with source citations.
- [Troubleshooting](troubleshooting.md): start from symptoms and choose the next
  diagnostic check.
- [Operations](../operations/): run checkpoint, GC, index, audit, trust, and
  maintenance workflows.

## Root artifacts

- [README](../../README.md): product landing page.
- [Architecture](../../ARCHITECTURE.md): system map, ports, adapters, and
  admission architecture.
- [Changelog](../../CHANGELOG.md): release history.
