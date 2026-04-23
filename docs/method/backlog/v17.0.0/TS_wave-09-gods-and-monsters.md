---
id: TS_wave-09-gods-and-monsters
blocks:
  - API_kill-warpruntime
blocked_by:
  - TS_wave-08-strand-index-big
feature: runtime-boundaries
---

# Wave 9: gods and monsters (13 files, 10987 LOC)

The final wave. Every file here is a god or near-god. Each one
needed splitting during conversion. This was the hardest wave.

| # | File | LOC | Notes |
|---|------|-----|-------|
| 1 | VisibleStateScopeV1.js | 490 | Scope filtering |
| 2 | PatchController.js | 531 | Patch lifecycle (ceiling!) |
| 3 | SyncController.js | 684 | Sync delegation (ceiling!) |
| 4 | BitmapIndexReader.js | 604 | Bitmap read (ceiling!) |
| 5 | ConflictCandidateCollector.js | 649 | Conflict collection (ceiling!) |
| 6 | StrandDescriptorStore.js | 643 | Strand CRUD (ceiling!) |
| 7 | StrandService.js | 992 | DEAD — delete after StrandController migrates |
| 8 | VisibleStateComparisonV5.js | 808 | State comparison (god!) |
| 9 | VisibleStateTransferPlannerV5.js | 692 | Transfer planning (ceiling!) |
| 10 | AuditVerifierService.js | 824 | Audit verification (god!) |
| 11 | StreamingBitmapIndexBuilder.js | 835 | Full bitmap build (god!) |
| 12 | IncrementalIndexUpdater.ts | 495 | Split already landed; remaining boundary/model cleanup lives elsewhere |
| 13 | WarpRuntime.js | 1234 | THE god — dies last |

**SSTS focus:** This wave carried the largest conversion monsters. Some are now
below the 500 LOC ceiling or already split, but the remaining survivors still
need the same sharp treatment. StrandService.js is dead code once
StrandController migrates to StrandCoordinator — just delete it. WarpRuntime.js
dies in API_kill-warpruntime after all consumers migrate.
