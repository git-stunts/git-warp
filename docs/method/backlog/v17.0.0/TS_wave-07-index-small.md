---
id: TS_wave-07-index-small
blocks: []
blocked_by: []
---

# Wave 7: index/ small files + services (10 files, 2803 LOC)

Smaller index files and remaining service files. These are the
leaf dependencies — converting them first tightens types for the
big index files in wave 8.

| # | File | LOC | Notes |
|---|------|-----|-------|
| 1 | PropertyIndexBuilder.js | 73 | Property shard builder |
| 2 | LogicalIndexBuildService.js | 158 | Index build orchestrator |
| 3 | PropertyIndexReader.js | 171 | Property shard reader |
| 4 | WarpStateIndexBuilder.js | 174 | State → index pipeline |
| 5 | IndexStalenessChecker.js | 229 | Detects stale indexes |
| 6 | BitmapIndexBuilder.js | 240 | Full bitmap index builder |
| 7 | HealthCheckService.js | 246 | Graph health checks |
| 8 | BitmapNeighborProvider.js | 251 | Bitmap → neighbor port |
| 9 | CoordinateFactExport.js | 253 | Coordinate fact exporter |
| 10 | HookInstaller.js | 399 | Git hooks setup |

**SSTS focus:** P1 (IndexStalenessChecker result as class), P5 (bitmap serde stays in adapter, not builder). PropertyIndexReader/Builder pair should share a typed PropertyShard domain object.
