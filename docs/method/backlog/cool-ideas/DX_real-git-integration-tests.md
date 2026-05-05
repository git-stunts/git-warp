---
id: DX_real-git-integration-tests
blocked_by: []
blocks: []
feature: api-capabilities
---

# Add integration test suite against real Git repositories

**Audit ref:** SR01-G3

The test suite runs 6,332 unit tests using `InMemoryGraphAdapter`.
There are no integration tests that exercise the full path through
`GitGraphAdapter` to a real Git repository. The BATS CLI tests
partially cover this, but they test the CLI layer, not the SDK.

## Proposal

Add a small integration test suite (10-20 tests) that:
1. Creates a real temporary Git repo.
2. Opens it with `openWarpGraph()` and `GitGraphAdapter`.
3. Writes patches, materializes, queries.
4. Verifies Git objects exist on disk.
5. Tests multi-writer scenarios with real refs.

This validates the adapter layer end-to-end.
