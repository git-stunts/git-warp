# Topics

Use these pages when you know what `git-warp` is and want the right page for a
specific task.

## Current release

`v18.2.1` keeps the public docs focused around the shipped v18 read model and
corrects the WARP state-cache materialization topic: live materialization can
reuse coordinate-addressed snapshots, while diff and receipt reads remain
replay-backed. Operator workflows live outside the topic shelf in
[Operations](../operations/). The full release narrative lives in the root
[CHANGELOG](../../CHANGELOG.md).

## Start here

- [Getting started](getting-started.md): install the package, open a worldline,
  write a patch, read it back, and sync WARP refs.
- [v19 public API reflection](api/): understand the planned root API shift to
  intents, readings, timelines, ticks, and receipts.
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
