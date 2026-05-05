---
id: PROTO_strand-collapse-implementation
feature: merge-strands-worldlines
blocks: []
blocked_by:
  - PROTO_strand-collapse-optic-for-causal-slicing
  - PROTO_local-site-object-for-neighborhoods
---

# Implement collapseBraid() per runtime spec

The strand runtime spec (strands-braids-runtime-spec.md §12) defines
collapse as:

```text
collapseBraid(braid: BraidView, policy: CollapsePolicy)
  -> DerivedLane | Plurality | ConflictArtifact | Obstruction
```

## Current state

- `braidStrand()` EXISTS — creates a braid view by composing read
  overlays from multiple strands over a common basis.
- `collapseBraid()` DOES NOT EXIST — no method that takes a braid
  view and derives a lane-level result under policy.
- `analyzeConflicts()` EXISTS — detects conflicts but does not
  perform admission or derivation.
- The braid-collapse-outcome-algebra.md defines the four lawful
  outcome types (Derived, Plural, Conflict, Obstruction).

## What needs building

1. **CollapsePolicy type** — defines the rules for cell-by-cell
   admission (commutation evidence, join existence, plurality
   tolerance, obstruction conditions).

2. **collapseBraid() method** — cell-by-cell collapse per §12:
   - Single-claim cells: carry forward
   - Joinable cells: derive joined result
   - Irreducible plurality: preserve as Plural
   - Conflict: emit ConflictArtifact
   - Legality failure: emit Obstruction

3. **Outcome types** — runtime-backed classes per Paper VII:
   - DerivedLane (lane-level result from collapse)
   - Plurality (preserved plural claims)
   - ConflictArtifact (surfaced conflict with witness)
   - Obstruction (blocked with reason)

4. **Observer collapse vs canonical collapse** — §13 distinction:
   - Observer collapse = projection fact (what the observer sees)
   - Canonical collapse = admission fact (what becomes shared truth)
   - Never conflate them in the implementation.

5. **admitLane()** — separate from collapse. A derived lane is not
   canonical merely because it exists. Admission is the governance
   step that blesses it.

## Alignment with Paper VII

Paper VII §3 (Braid Admission) is the theoretical frame. The runtime
spec §12 is the implementation contract. Both agree:

- A braid is NOT a merge
- Collapse does NOT mean "pick a winner"
- Irreducible plurality is a lawful outcome
- The witness must explain WHY the outcome is lawful

## Graft dependency

Graft requested strand collapse work. This item provides the
runtime implementation that Graft (and Echo, Continuum) can consume.

## Release home

Likely release home: `v21`, with possible seam work earlier.

The old `v17.x or v18.0.0` target is stale. After `0037`, this is clearly on
the plural/distributed side of the ladder:

- `v19` should establish honest observer/admission seams
- `v20` should make slice-first runtime execution real
- `v21` should carry braid-collapse and common-basis plurality semantics
