---
id: TS_wave-04-state-query
blocks: []
blocked_by:
  - TS_wave-01-codec
---

# Wave 4: state/ + query/ remaining (10 files, 3767 LOC)

State serialization, checkpoint handling, and query subsystem.
Depends on codec wave for typed boundary types.

| # | File | LOC | Notes |
|---|------|-----|-------|
| 1 | StateHashService.js | 48 | State hash computation |
| 2 | StateSerializerV5.js | 175 | V5 state serialization |
| 3 | AdjacencyNeighborProvider.js | 179 | In-memory neighbor lookup |
| 4 | CheckpointSerializerV5.js | 293 | Checkpoint encode/decode |
| 5 | QueryBuilder.js | 315 | Query accumulator (already split, needs .ts) |
| 6 | StateDiff.js | 372 | State diffing |
| 7 | Observer.js | 493 | Observer projection |
| 8 | StateReaderV5.js | 598 | State reader (over ceiling!) |
| 9 | CheckpointService.js | 651 | Checkpoint lifecycle (over ceiling!) |
| 10 | LogicalTraversal.js | 643 | Deprecated facade (over ceiling!) |

**SSTS focus:** P5 (serializers own encoding, not consumers), P6 (single source of truth — StateReaderV5 vs StateDiff overlap). Three files need splitting.
