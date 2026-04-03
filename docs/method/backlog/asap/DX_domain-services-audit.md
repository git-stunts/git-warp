# Audit domain/services/ and recommend refactoring

83 files and 36,603 LOC in a single flat directory. Controllers,
codecs, index builders, traversal engines, state serializers, sync
protocol, GC, health checks, reducers — all siblings with no internal
structure. This is 54% of the entire codebase.

## Hill

We understand what cohesive groups exist inside `domain/services/`,
what the dependency edges between them are, and what subdirectory
structure would reflect real boundaries.

## Deliverable

Backlog items — one per recommended refactoring. Each item names the
files that move, where they go, and why. No code changes in this
cycle.

## Playback questions

- Can we name every cohesive group without hesitation?
- Does the proposed structure reduce the cognitive cost of finding a
  file?
- Are there circular dependencies between proposed groups that would
  block a clean split?
- Does the proposed structure respect hexagonal layering (no
  dependency direction violations)?
