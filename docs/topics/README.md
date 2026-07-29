# Topics

Use these pages when you know what `git-warp` is and want the right page for a
specific task.

## Current release

`v19.0.2` is the current release. It ships the Runtime, Lane, Intent, Observer,
Observation, Reading, and Receipt application vocabulary, bounded retained
reads, and the safe one-shot v18-to-v19 substrate migration with per-commit
progress and durable completion evidence. Do not use the v19.0.0 migrator on an
authoritative repository. Operator workflows live outside the topic shelf in
[Operations](../operations/). The full breaking-change, migration, and
performance narrative lives in the root [CHANGELOG](../../CHANGELOG.md).

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
- [Strands](strands.md): keep speculative work durable and separate from live
  truth.

## Substrate and boundaries

- [Git substrate](git-substrate.md): understand WARP refs, patch commits,
  checkpoints, replay, and provenance.
- [Git performance](git-perf.md): understand the measured persistent Git
  session design, bounded-memory policy, and rejected native backends.
- [Content and CAS](content-and-cas.md): handle content attachments,
  content-addressed storage, and encrypted CAS payloads.
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
