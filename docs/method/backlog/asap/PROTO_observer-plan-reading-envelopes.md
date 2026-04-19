# Observer plans and reading envelopes

Refines:

- `docs/design/worldline-observer-api-phasing.md`
- `docs/design/observer-optics-and-effect-architecture.tex`

## Why

git-warp already says the right thing in theory, but the shipped
surface is still too snapshot-first:

- resolve a source selector
- materialize a detached snapshot
- wrap it in `Observer`
- filter by `match/expose/redact`

That is not the final observer boundary. An observer is not just a
filtered snapshot; it is a lawful read-side object with projection,
basis, state, update law, and emission law. The runtime should return
reading envelopes, not pretend "the graph" was read directly.

## What it should look like

- A bounded **ObserverSpec** / **ObserverPlan** exists as the authored
  read-side object.
- The plan names at least:
  - aperture / projection
  - basis
  - observer state schema
  - update law
  - emission law
  - budget
  - rights / exposure posture
- The runtime distinguishes:
  - plan/spec
  - observer instance
  - emitted reading envelope
- `observer(...)` becomes a convenience for a degenerate, mostly
  stateless observer plan. It is not the whole model.
- A reading envelope carries:
  - source coordinate / frontier
  - reading payload
  - witness or shell reference
  - budget metadata
  - plurality / obstruction / residual when relevant
- No read API should need to imply a universal materialized graph
  object as the thing being observed.

## Done looks like

- `Observer.ts` is no longer documented or implemented as merely a
  filtered view over a materialized runtime state.
- `QueryController.observer(...)` does not hide the source-plan-reading
  split behind a snapshot helper.
- one-shot reads and reusable observer instances share the same
  reading-envelope family
- the observer API can speak honestly about state-close but
  provenance-far readings instead of flattening all success to one
  snapshot hash

## Starting points

- `src/domain/services/query/Observer.ts`
- `src/domain/services/controllers/QueryController.ts`
- `src/domain/types/WorldlineSelector.ts`
- `src/domain/types/StrandSelector.ts`
- `docs/invariants/state-provenance-separation.md`

## Non-goals

- Do not ship arbitrary user callbacks into the substrate.
- Do not remove low-level snapshot helpers that remain useful as
  implementation detail or test scaffolding.
- Do not block on the full public noun migration away from
  `WarpRuntime` in the first slice.
