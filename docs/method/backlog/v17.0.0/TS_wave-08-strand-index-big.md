---
id: TS_wave-08-strand-index-big
blocks: []
blocked_by:
  - TS_wave-05-controllers
  - TS_wave-07-index-small
---

# Wave 8: big strand + big index files (10 files, 5756 LOC)

The heavyweight conversion wave. Every file here is 300+ LOC.
Several exceed 500 and need splitting during conversion.

| # | File | LOC | Notes |
|---|------|-----|-------|
| 1 | StrandMaterializer.js | 215 | Strand → state replay |
| 2 | ConflictTraceAssembler.js | 267 | Conflict trace construction |
| 3 | LogicalBitmapIndexBuilder.js | 317 | Logical index from bitmap |
| 4 | ConflictAnalysisRequest.js | 366 | Conflict analysis params |
| 5 | IndexRebuildService.js | 416 | Full index rebuild |
| 6 | ConflictFrameLoader.js | 448 | Load conflict frames |
| 7 | StrandIntentService.js | 456 | Intent queue management |
| 8 | StrandPatchService.js | 484 | Strand patch commit |
| 9 | MaterializedViewService.js | 501 | View build orchestrator (ceiling!) |
| 10 | LogicalIndexReader.js | 603 | Index shard reader (ceiling!) |

**SSTS focus:** P1 (ConflictAnalysisRequest → class with validation), P5 (LogicalIndexReader serde stays in adapter). MaterializedViewService and LogicalIndexReader need splitting.
