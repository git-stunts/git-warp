# 0057 Retro — Index Builder On Git-CAS

## Outcome

Hill met.

## What changed

- Added `StreamingIndexStoragePort` as the honest stronger seam for
  streaming index rebuilds.
- Added `CasIndexStorageAdapter` so the rebuild path has one concrete
  git-cas-backed storage adapter instead of a hand-wavy mix of raw blob writes
  plus optional payload indirection.
- Changed `StreamingBitmapIndexBuilder` so flushes write through streaming blob
  storage and finalize no longer reads flushed shard chunks back in just to
  merge them.
- Kept bitmap shard chunks as chunk-suffixed tree entries and taught
  `BitmapIndexReader` to resolve chunked shard variants lazily.
- Updated the `v17` release ledger so the item is described as a
  streaming/git-cas substrate cut rather than a stale file-size/god slice.

## Playback

- Witness:
  - `npm exec vitest run test/unit/domain/services/StreamingBitmapIndexBuilder.test.ts test/unit/domain/services/StreamingBitmapIndexBuilder.chunked.test.ts test/unit/domain/services/BitmapIndexReader.chunked.test.ts test/unit/domain/services/IndexRebuildService.test.ts test/unit/domain/services/IndexRebuildService.streaming.test.ts test/unit/domain/services/logging.integration.test.ts test/unit/infrastructure/CasIndexStorageAdapter.test.ts test/unit/scripts/index-builder-on-git-cas-shape.test.ts`
  - `npm exec vitest run test/unit/domain/services/BitmapIndexReader.test.ts test/unit/domain/services/IndexRebuildService.deep.test.ts test/unit/domain/services/IndexStalenessChecker.test.ts test/unit/infrastructure/CborIndexStoreAdapter.test.ts test/unit/ports/GraphPersistencePort.test.ts`
  - `npm run typecheck`
  - `git diff --check`
- Agent answers:
  - Yes: the old in-memory fault line was explicit in `_loadAndMergeAllChunks()` and the whole-blob storage contract.
  - Yes: repo truth now points at `StreamingIndexStoragePort` / `CasIndexStorageAdapter` as the stronger seam.
  - Yes: finalize no longer performs chunk readback/merge; it emits chunked shard entries and the reader unions them on demand.
- Human answers:
  - Yes: “already uses a storage port” is now clearly insufficient because streaming rebuilds require a stronger storage contract than `IndexStoragePort`.
  - Yes: “git-cas somewhere” is no longer enough; the witness shows both git-cas-backed content writes and bounded finalize behavior.

## Drift

Acceptable additive drift.

The design’s original green sketch talked about a bounded streaming or
spillable merge plan. The implementation landed a better answer to the same
memory law: do not collapse flushed chunks back into one shard blob at all.
Instead, keep chunked shard entries and teach the reader to consume them.

Residual truth remains:

- `BitmapAccumulator` still carries the global SHA→ID map for the duration of
  the build.
- `BitmapIndexReader` still builds a full ID→SHA cache when reverse expansion is
  needed.

Those are real scale edges, but they are already within the scope of the
existing `CORE_streaming-memory-audit` trunk rather than new undocumented drift
from this cycle.

## What we learned

- Trying to “stream a merge” while preserving a single final shard blob was the
  wrong question. The more honest move was to stop demanding that single final
  blob.
- The repo already had most of the CAS substrate (`BlobStoragePort`,
  `storeStream`, payload pointers). What was missing was the explicit index
  storage seam that let the builder depend on those capabilities directly.

## Backlog follow-through

- No new bad-code item filed; the remaining global mapping/cache residency
  concern is already covered by `CORE_streaming-memory-audit`.
- No new cool-ideas item filed.
