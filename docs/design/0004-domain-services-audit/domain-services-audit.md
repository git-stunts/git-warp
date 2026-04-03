# Audit domain/services/ and recommend refactoring

83 files and 36,603 LOC in a single flat directory. Controllers,
codecs, index builders, traversal engines, state serializers, sync
protocol, GC, health checks, reducers — all siblings with no internal
structure. This is 54% of the entire codebase.

## Sponsor human

James

## Sponsor agent

Claude

## Hill

We understand what cohesive groups exist inside `domain/services/`,
what the dependency edges between them are, and what subdirectory
structure would reflect real boundaries.

## Playback questions

### Agent

- Can we name every cohesive group without hesitation?
- Are there circular dependencies between proposed groups that would
  block a clean split?
- Does each proposed group have a clear single responsibility?

### Human

- Does the proposed structure reduce the cognitive cost of finding a
  file?
- Does `ls` on any proposed subdirectory tell a coherent story?
- Does the proposed structure respect hexagonal layering (no
  dependency direction violations)?

## Accessibility / assistive reading posture

Not applicable — deliverable is documentation only.

## Localization / directionality posture

Not applicable — deliverable is documentation only.

## Agent inspectability / explainability posture

The audit methodology is visible: import graph extraction, LOC
measurement, cluster identification. All data derived from `grep`
and `wc` on committed source files.

## Non-goals

- No code changes in this cycle.
- No test changes.
- No file moves.
- Not designing the migration strategy (that is per-backlog-item
  scope).

## Deliverable

Backlog items — one per recommended refactoring. Each item names the
files that move, where they go, and why.
