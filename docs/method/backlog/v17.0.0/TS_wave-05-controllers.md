---
id: TS_wave-05-controllers
blocks: []
blocked_by:
  - TS_wave-04-state-query
---

# Wave 5: controllers/ + small strand files (10 files, 2823 LOC)

Remaining controllers and small strand support files.
Controllers still use _host bag — convert to .ts and prepare
for host-bag injection in a future pass.

| # | File | LOC | Notes |
|---|------|-----|-------|
| 1 | ConflictCandidate.js | 63 | Value object |
| 2 | OpRecord.js | 84 | Value object |
| 3 | strandTypes.js | 88 | Type definitions |
| 4 | ConflictAnalyzerService.js | 110 | Thin orchestrator |
| 5 | strandShared.js | 128 | Shared helpers |
| 6 | StrandController.js | 182 | Strand delegation layer |
| 7 | ProvenanceController.js | 247 | Provenance delegation |
| 8 | SubscriptionController.js | 252 | Subscribe/watch |
| 9 | ForkController.js | 294 | Fork + wormhole |
| 10 | CheckpointController.js | 434 | Checkpoint + GC |

**SSTS focus:** P1 (ConflictCandidate, OpRecord → classes with behavior), P3 (controllers own their methods, not defineProperty wiring). StrandController migrates to StrandCoordinator.
