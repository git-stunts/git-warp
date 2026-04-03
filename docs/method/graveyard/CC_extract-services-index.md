# Extract index/ from domain/services/

Move the 13 bitmap index files into `src/domain/services/index/`.

## Files

- BitmapIndexBuilder.js (240)
- BitmapIndexReader.js (604)
- BitmapNeighborProvider.js (247)
- IncrementalIndexUpdater.js (956)
- IndexRebuildService.js (397)
- IndexStalenessChecker.js (203)
- LogicalBitmapIndexBuilder.js (329)
- LogicalIndexBuildService.js (108)
- LogicalIndexReader.js (433)
- PropertyIndexBuilder.js (79)
- PropertyIndexReader.js (152)
- StreamingBitmapIndexBuilder.js (835)
- WarpStateIndexBuilder.js (168)

## Why

Largest cohesive cluster (13 files, 4,599 LOC). All about Roaring
bitmap indexes. Self-contained except for KeyCodec decode helpers.
MaterializedViewService orchestrates them but lives at a higher level.

## Scope

Move files, update imports. No behavioral changes.

## Source

Cycle 0004 analysis.
