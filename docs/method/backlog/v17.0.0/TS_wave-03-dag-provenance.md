---
id: TS_wave-03-dag-provenance
blocks: []
blocked_by: []
---

# Wave 3: dag/ + provenance/ + small services (10 files, 2884 LOC)

Commit graph traversal and provenance tracking. Self-contained
algorithms with clear port dependencies (CommitPort, BlobPort).

| # | File | LOC | Notes |
|---|------|-----|-------|
| 1 | Frontier.js | 126 | Frontier Map helpers |
| 2 | BisectService.js | 152 | Binary search on commit chains |
| 3 | CommitDagTraversalService.js | 170 | BFS/DFS on commit DAG |
| 4 | DagTraversal.js | 228 | Core DAG walk |
| 5 | DagTopology.js | 237 | Topological sort + ancestry |
| 6 | ProvenancePayload.js | 248 | Provenance record construction |
| 7 | ProvenanceIndex.js | 344 | Entity → patch SHA index |
| 8 | BoundaryTransitionRecord.js | 599 | BTR construction (over ceiling!) |
| 9 | DagPathFinding.js | 708 | A* + Dijkstra on DAG (over ceiling!) |
| 10 | GitLogParser.js | 243 | Parse git log output |

**SSTS focus:** P1 (ProvenanceIndex, BTR as classes with behavior), P2 (validate DAG inputs at boundary). BoundaryTransitionRecord and DagPathFinding need splitting to hit 500 LOC ceiling.
