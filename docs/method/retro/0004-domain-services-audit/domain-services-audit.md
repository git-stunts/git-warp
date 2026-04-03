# Cycle 0004 Retro — domain/services/ audit

## Outcome

**Hill met.** 10 cohesive groups identified from import graph
analysis. 10 backlog items written, one per proposed subdirectory.
No circular dependencies between groups. Dependency direction is
clean (all arrows point downward).

## What went well

- Import graph analysis made clusters obvious — naming patterns
  already hinted at the structure, and dependency analysis confirmed
  it.
- The DAG cluster is fully self-contained (zero cross-imports).
  Strongest candidate for early extraction.
- The codec cluster has only one outbound import (KeyCodec constant).
  Second-strongest candidate.

## What surprised us

- The "shared kernel" is larger than expected (~24 files). JoinReducer
  is imported by 8 of 10 clusters — it is the gravitational center of
  the codebase.
- Several files are cluster-adjacent but not clearly in one group:
  Worldline, TemporalQuery, TranslationCost (query-ish),
  VisibleState* + CoordinateFactExport (strand/comparison-ish).
  These stay in root for now.

## Drift check

No drift. Design-only cycle — no code changes to drift from.

## New debt

None introduced.

## Cool ideas

- The VisibleState* files (3 files, ~1,990 LOC) could form a
  `comparison/` subdirectory alongside strand/. Deferred because
  ComparisonController already lives in controllers/ and the
  boundary isn't as clean.
- JoinReducer's centrality suggests it might benefit from its own
  subdirectory (`reduce/`) if it ever gets decomposed.

## Backlog maintenance

10 new items added to `up-next/` under the CC legend:
- CC_extract-services-controllers
- CC_extract-services-codec
- CC_extract-services-index
- CC_extract-services-state
- CC_extract-services-sync
- CC_extract-services-dag
- CC_extract-services-provenance
- CC_extract-services-query
- CC_extract-services-strand
- CC_extract-services-audit
