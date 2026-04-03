# WorldlineSource → subclass hierarchy

**Effort:** M

## Problem

`WorldlineSource` is a `kind: 'live'|'coordinate'|'strand'` discriminated
union dispatched via tag switching in 3 files (Worldline.js,
QueryController.js, Observer.js). Each has its own clone function. This
is the exact P3/P7 anti-pattern the NormalizedSelector → subclass
hierarchy already solved in PR #74.

## Fix

Three subclasses: `LiveSource`, `CoordinateSource`, `StrandSource`.
Each implements `clone()` (pure data — polymorphic). Materialize dispatch
stays in the service layer (uses `instanceof` instead of string tag).

Creation sites (`{ kind: 'live' }` literals) become `new LiveSource()`.

## Notes

Research complete (agent explored in PR #75 session). Ready to execute.
