---
id: API_no-full-materialization-first-use-optics
blocked_by: []
blocks:
  - API_optics-public-api-closeout
  - RELEASE_v18-public-release-blockers
feature: graph-model-substrate
---

# No full materialization in first-use Optics

## Why

V18 may ship a Worldline and Optics product pivot only if the public first-use
path is honest about its cost. The current
`openWarpWorldline(...).prepareOpticBasis()` implementation calls
`graph.materialize()` and then `graph.createCheckpoint()` before returning a
basis receipt. That makes the setup path full-residency even though the Optics
story says bounded reads reject unbounded bases instead of falling back to a
whole-graph fold.

The large-graph product gate is real, but it is separate. V18 does not need to
deliver the whole bounded-memory platform unless it claims arbitrary graph size
under bounded memory. V18 does need to avoid teaching newcomers that a
bounded-looking Optics path is safe when setup still materializes the full
graph.

## Done Looks Like

- `prepareOpticBasis()` no longer performs full graph materialization on the
  documented first-use path.
- Basis setup either verifies an existing bounded checkpoint-tail or read basis
  and succeeds, or fails closed with `E_OPTIC_NO_BOUNDED_BASIS`.
- If v18 does not stream-build a basis yet, the docs say so directly and avoid
  claiming bounded large-graph safety for basis construction.
- Tripwire tests cover documented first-use Optics setup and fail if it calls
  `materialize()`, `_materializeGraph()`, full snapshot creation, full
  node/edge array construction, or observer snapshot cloning.
- Public docs classify exposed APIs as `bounded`, `streaming`, `cursor`,
  `transitional`, `diagnostic`, `offline`, or `legacy`.
- First-use docs use only `bounded`, `streaming`, or `cursor` APIs. Transitional
  surfaces may be mentioned as migration context, but not as the recommended
  first-use path.
- Materialize-first APIs remain compatible, but they are labeled diagnostic,
  offline, legacy, or transitional and kept out of first-use application
  examples.
- Release notes keep the v18 claim narrow: graph-model convergence plus
  Worldline/Optics honesty, not arbitrary graph size under bounded memory.

## Non-Goals

- Implementing `WarpMemoryPool` or a complete memory-budget runtime.
- Building the full streaming read-basis/index substrate.
- Cursorizing every public read and sync path.
- Replacing content-reference lookup with bounded fact indexes.
- Adding `worldline.capabilities()`, query `.budget()`, query `.explain()`, or
  operator doctor mode.
- Rejecting every legacy full-residency API at runtime.

Those are required before a later release can claim arbitrary graph size under
bounded memory, but they are not all v18 gates unless v18 makes that claim.

## Starting Points

- [WarpWorldline.ts](../../../../src/domain/WarpWorldline.ts)
- [v18 coordinate Optic public-path tests](../../../../test/conformance/v18CoordinateOpticPublicPath.test.ts)
- [API reference](../../../API_REFERENCE.md)
- [Readings and Optics](../../../READINGS_AND_OPTICS.md)
- [README](../../../../README.md)
