---
id: TS_wave-09-gods-and-monsters
blocks: []
blocked_by:
  - TS_wave-08-strand-index-big
feature: runtime-boundaries
---

# Wave 9: gods and monsters (historical tranche; the original batch was 13 files, 10987 LOC)

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
| 8 | VisibleStateComparison.ts | 172 | Already below the ceiling; remaining comparison shape cleanup belongs to boundary/model owners |
| 9 | VisibleStateTransferPlannerV5.js | 692 | Transfer planning (ceiling!) |
| 10 | AuditVerifierService.ts | 136 | Already split; no remaining big-file work |
| 11 | StreamingBitmapIndexBuilder.ts | 277 | Already below the ceiling; streaming residue closed in `0057` |
| 12 | IncrementalIndexUpdater.ts | 495 | Split already landed; remaining boundary/model cleanup lives elsewhere |
| 13 | WarpRuntime.js | 1234 | THE god — dies last |

**SSTS focus:** This wave carried the largest conversion monsters. Several former
gods are now already below the 500 LOC ceiling or materially split, so the
remaining work has narrowed to the true survivors and to smaller residue owners.
StrandService.js is dead code once StrandController migrates to
StrandCoordinator. The old runtime host class died across the runtime-kill
chain, which closed in cycle `0084`.
