---
id: SPEC_dag-pathfinding-untested
blocked_by: []
blocks: []
feature: testing-quality
---

# DagPathFinding.js (705 LOC) has zero tests and 5 functions >50 LOC

**Effort:** M

## Issue

DagPathFinding implements shortestPath, weightedShortestPath,
aStarSearch, bidirectionalAStar, _expandForward, _expandBackward.
Functions range 53-91 LOC. Zero dedicated tests. These are graph
algorithms with subtle correctness requirements (termination,
optimality).

## Fix

Create unit tests with small known-answer graphs. Test each algorithm
variant, empty graph edge cases, disconnected graphs, negative weights.
