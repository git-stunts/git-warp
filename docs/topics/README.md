# Topics

Use these pages when you know what `git-warp` is and want the right page for a
specific task.

## Current release

`v18.1.0` focuses the public docs around the shipped v18 read model: worldlines,
coordinates, reified optics, observers, bounded support, strands, Git substrate,
sync, CLI, operations, and troubleshooting. The full release narrative lives in
the root [CHANGELOG](../../CHANGELOG.md).

## Start here

- [Getting started](getting-started.md): install the package, open a worldline,
  write a patch, read it back, and sync WARP refs.
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
- [Continuum boundary](continuum-boundary.md): understand what git-warp owns
  locally and what Continuum owns as boundary vocabulary.

## Operate

- [CLI](cli.md): inspect, validate, debug, and time-travel a live repository.
- [Sync](sync.md): move WARP refs between clones and inspect sync status.
- [Operations](operations.md): run checkpoint, GC, index, audit, trust, and
  maintenance workflows.
- [Troubleshooting](troubleshooting.md): start from symptoms and choose the next
  diagnostic check.

## Root artifacts

- [README](../../README.md): product landing page.
- [Architecture](../../ARCHITECTURE.md): system map, ports, adapters, and
  admission architecture.
- [Changelog](../../CHANGELOG.md): release history.
