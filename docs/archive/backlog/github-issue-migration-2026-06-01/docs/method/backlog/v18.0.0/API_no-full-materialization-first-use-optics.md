---
id: API_no-full-materialization-first-use-optics
blocked_by: []
blocks:
  - API_optics-public-api-closeout
  - PERF_bounded-memory-large-graph-product-gate
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

The large-graph product gate is also a v18 blocker. This card is the narrower
first-use Optics gate: it stops the most visible public setup path from hiding
full residency before the broader bounded-memory platform is finished.

## Done Looks Like

- `prepareOpticBasis()` no longer performs full graph materialization on the
  documented first-use path.
- Basis setup either verifies an existing bounded checkpoint-tail or read basis
  and succeeds, or fails closed with `E_OPTIC_NO_BOUNDED_BASIS`.
- If this card lands before the streaming basis builder, setup fails closed when
  no bounded basis exists rather than falling back to materialization.
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
- Release notes describe this gate as one prerequisite for the v18
  bounded-memory claim, not as the entire large-graph product gate.

## Non-Goals

- Implementing `WarpMemoryPool` or a complete memory-budget runtime.
- Building the full streaming read-basis/index substrate.
- Cursorizing every public read and sync path.
- Replacing content-reference lookup with bounded fact indexes.
- Adding `worldline.capabilities()`, query `.budget()`, query `.explain()`, or
  operator doctor mode.
- Rejecting every legacy full-residency API at runtime.

Those are covered by `PERF_bounded-memory-large-graph-product-gate`, which is
also a v18 blocker.

## Starting Points

- [WarpWorldline.ts](../../../../src/domain/WarpWorldline.ts)
- [v18 coordinate Optic public-path tests](../../../../test/conformance/v18CoordinateOpticPublicPath.test.ts)
- [API reference](../../../API_REFERENCE.md)
- [Readings and Optics](../../../READINGS_AND_OPTICS.md)
- [README](../../../../README.md)
