---
title: "Move the index builder onto a truly git-cas-backed, bounded-residency path"
cycle: "0057-index-builder-on-git-cas"
---

# Index Builder On Git-CAS

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

`INFRA_index-builder-on-git-cas` is still the honest next `v17` substrate
slice, but the old backlog note is stale in one important way:

- `StreamingBitmapIndexBuilder.ts` is no longer an `835` LOC god
- plain CBOR shards already replaced the old envelope/checksum layer
- the builder already depends on a storage port

The real remaining problem is sharper:

1. the storage path is not yet an obviously singular `git-cas` pipeline
2. the finalize / merge path still quietly assumes shard chunks can be merged in
   memory
3. `IndexStoragePort` only exposes whole-blob reads, which blocks a fully
   streaming merge path even when the backing blob store can stream

So this cycle exists to codify the real seam and set the red bar correctly:
`git-cas` backing plus bounded-residency merge behavior. One without the other
is not enough.

## Hill

A contributor can now answer, from repo truth alone, that the index rebuild path
must be both:

- `git-cas`-backed for content storage, and
- bounded-residency throughout flush, merge, and finalize

with no hidden “load all chunks into memory” step left behind.

## Playback questions

### Agent

- Can I point to the exact in-memory assumptions still present in the current
  builder path?
- Does the design make it explicit that whole-blob read APIs are themselves a
  blocker on true streaming merge?
- Are the acceptance criteria phrased in streaming terms rather than file-size
  or refactor terms?

### Human

- Is it clear why “already uses a storage port” is not sufficient?
- Is it clear why `git-cas` without bounded merge behavior is still an
  incomplete fix?

## Accessibility / assistive reading posture

Relevant. The cycle should be readable without reconstructing old builder
history. The design needs to point directly at the surviving memory assumptions.

## Localization / directionality posture

Not especially relevant. This is a substrate and storage-behavior cycle, not a
user-facing copy or layout slice.

## Agent inspectability / explainability posture

Relevant. The design should leave explicit anchors to:

- the current builder merge path
- the current storage ports
- the existing `git-cas`-capable adapter surfaces
- the streaming blocker in the read API

## Non-goals

- No package extraction work here
- No launch-prep publish work
- No fake “big file” kill accounting

## Core diagnosis

The current path already improved substantially, but it still falls short of
the actual law:

- `StreamingBitmapIndexBuilder` flushes on a memory threshold, but
  `_loadAndMergeAllChunks()` still accumulates a full merged shard map in memory
- `BitmapAccumulator` still holds full shard working sets and full meta mappings
  between flushes
- `IndexStoragePort` only exposes `readBlob(oid) -> Uint8Array`, so true
  streaming merge is impossible through that port even when the backing storage
  is `git-cas`
- the adapter story is split across `IndexStoragePort`,
  `CborIndexStoreAdapter`, `BlobStoragePort`, and CAS payload pointers, which is
  better than raw blobs but not yet the singular “this rebuild path is now a
  git-cas streaming pipeline” story

## Design

### 1. Treat streaming as a hard acceptance criterion

The success condition is not merely “use git-cas somewhere.”

It is:

- the concrete content path is `git-cas`-backed, and
- no rebuild / merge / finalize step assumes the full working set fits in RAM

### 2. Make the read-side streaming blocker explicit

If the builder still relies on a port that only exposes whole-blob reads, then
the merge path is not truly streaming regardless of the backing adapter.

That means this cycle may need to introduce or route through a streaming read
surface rather than continuing to build on `IndexStoragePort` alone.

### 3. Replace whole-shard merge accumulation with bounded merge behavior

The merge path must stop doing:

- load every chunk blob
- decode whole chunk records
- accumulate a full `Record<string, RoaringBitmapSubset>`
- write the final merged shard after everything is already resident

The truthful replacement is an incremental or spillable merge plan.

### 4. Keep the acceptance criteria substrate-focused

The red matrix should prove:

- builder writes through the `git-cas`-backed content adapter
- merge does not require all chunk blobs at once
- the builder remains memory-bounded under stressed multi-chunk shard merges

## Test plan

### RED

Add red coverage that fails until:

- the builder path proves it is using the `git-cas`-backed content adapter
- merge/finalize no longer rely on whole-shard in-memory accumulation
- the design and release docs stop treating this as a file-size/god problem

### GREEN

- cut the builder path onto the honest `git-cas` storage seam
- replace the current merge accumulation with a bounded streaming or spillable
  strategy
- update the release/tracking docs to describe the cycle in streaming terms

### Witness

- targeted streaming/index tests
- `npm run typecheck`
- `git diff --check`
