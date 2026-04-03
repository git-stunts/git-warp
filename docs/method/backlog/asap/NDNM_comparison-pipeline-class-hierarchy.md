# Comparison pipeline: proper class hierarchy

**Effort:** L

## Problem

ComparisonController's comparison pipeline uses `unknown` params,
validator functions, and string-switched dispatch that should be
class hierarchies with constructors.

Partially addressed in this PR:
- NormalizedSelector → LiveSelector, CoordinateSelector, StrandSelector,
  StrandBaseSelector subclasses (each implements resolve())
- OpOutcomeResult → OpApplied, OpSuperseded, OpRedundant subclasses
- ResolvedComparisonSide class
- ComparisonSideResolver eliminated (selectors resolve themselves)

Still needed:
- LamportCeiling value object (validates non-negative int in constructor)
- StrandId value object (validates non-empty string in constructor)
- WriterId value object (same pattern)
- Remove all `normalizeX(unknown)` validator functions — these become
  constructors
- Remove all `assertX(unknown)` guard functions — same
- Replace `Record<string, unknown>` options bags with typed classes
