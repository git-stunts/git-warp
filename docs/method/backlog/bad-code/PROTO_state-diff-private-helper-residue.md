# PROTO_state-diff-private-helper-residue

## What stinks

`src/domain/services/state/StateDiff.js` still has a handful of uncovered lines in private helper code:

- comparator branches in `compareField()` / `compareProps()`
- low-level deep-equality edge cases in `arraysEqual()` / `deepEqualObjects()`
- the `afterReg === undefined` early return in `classifyPropUpdate()`

The remaining misses are not in the exported `diffStates()` contract so much as in the internal helper shapes around it. Some are hard to drive deterministically through the public API, and at least one (`afterReg === undefined` inside `classifyPropUpdate`) appears structurally unreachable because earlier classification exits first.

## Why it matters

- Coverage work drifts toward sort-implementation quirks and private-helper gymnastics.
- The file mixes public behavioral coverage with internal helper residue, making the remaining gap look more severe than it is.

## Suggested direction

- Extract the deep-equality/comparator helpers into a tiny testable utility module, or
- accept the unreachable/private-helper residue and document it instead of forcing contrived public scenarios.

## Evidence

- After the cycle 0010 state-diff tranche, `StateDiff.js` still only misses private helper branches while public node, edge, property, determinism, empty-diff, array/object, and edge-property behavior are covered.
