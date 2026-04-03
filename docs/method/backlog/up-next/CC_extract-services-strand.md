# Extract strand/ from domain/services/

Move the 2 strand files into `src/domain/services/strand/`.

## Files

- StrandService.js (2049)
- ConflictAnalyzerService.js (2582)

Note: StrandController.js (182) and ComparisonController.js (1198)
stay in controllers/.

## Why

Branch-and-compare subsystem. Both are god objects with existing
bad-code/ backlog items. Grouping them clarifies the decomposition
target — future cycles that break these down will work within
strand/.

## Scope

Move files, update imports. No behavioral changes.

## Caveat

Both files are decomposition targets. Moving them first establishes
the namespace; breaking them down is separate backlog work.

## Source

Cycle 0004 analysis.
