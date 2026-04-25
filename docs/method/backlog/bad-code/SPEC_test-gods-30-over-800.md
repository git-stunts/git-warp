---
blocked_by: []
blocks: []
id: DX_test-gods-30-over-800
feature: merge-strands-worldlines
release_home: v17.0.0
---

# 30 test files over 800 LOC — test gods

30 test files exceed 800 LOC (the test file limit). The largest is
StrandService.test.ts at 2,858 lines. These should be split by
describe-block into focused test files. The shared test fixtures
(mockPorts, mockHost, patchFactories) make splitting easier because
setup boilerplate can be imported instead of duplicated.

Top 5:
- StrandService.test.ts (2858)
- WarpGraph.test.ts (2198)
- ConflictAnalyzerService.test.ts (2020)
- CommitDagTraversalService.test.ts (1444)
- WarpGraph.strands.test.ts (1434)
