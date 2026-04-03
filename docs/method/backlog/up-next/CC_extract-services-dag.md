# Extract dag/ from domain/services/

Move the 4 DAG traversal files into `src/domain/services/dag/`.

## Files

- CommitDagTraversalService.js (166)
- DagPathFinding.js (705)
- DagTopology.js (237)
- DagTraversal.js (224)

## Why

Fully self-contained — zero imports from other services. Pure graph
algorithms over raw Git commit DAGs. Could nearly be its own package.

## Scope

Move files, update imports (CommitDagTraversalService is the main
consumer-facing entry). No behavioral changes.

## Source

Cycle 0004 analysis.
