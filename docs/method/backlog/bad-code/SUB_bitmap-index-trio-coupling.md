---
id: SUB_bitmap-index-trio-coupling
blocked_by: []
blocks: []
feature: materialization-query-index
release_home: v20.0.0
---

# BitmapIndexBuilder/Reader/Streaming always change together (22x in 3 months)

**Effort:** M

## Issue

BitmapIndexBuilder, BitmapIndexReader, and StreamingBitmapIndexBuilder
change together 19-22 times in 3 months. This is the highest
change-coupling cluster in the codebase outside the PatchBuilderV2
chain. It suggests shared concepts (shard format, JSON encoding,
checksum logic) that aren't extracted.

## Fix

Extract shared shard format constants, encoding helpers, and checksum
utilities to a BitmapIndexFormat module. Each builder/reader imports
from the shared module instead of duplicating format knowledge.
