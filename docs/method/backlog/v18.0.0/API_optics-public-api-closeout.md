---
id: API_optics-public-api-closeout
blocked_by: []
blocks:
  - RELEASE_v18-public-release-blockers
feature: graph-model-substrate
---

# Optics public API closeout

## Design

[0265 v18 Optics public API closeout](../../../design/0265-v18-optics-public-api-closeout/v18-optics-public-api-closeout.md)

## Why

Optics are part of the public-facing v18 value proposition. The current
Worldline-first API exposes `events.optic()`, but the release is not honest
until that path has a pinned coordinate, documented success setup, public
tests, recovery guidance, and package-surface contract.

Shipping with only an exposed narrow handle and a common
`E_OPTIC_NO_BOUNDED_BASIS` failure path would make Optics feel like a promise
that users cannot exercise. Shipping a setup path that requires first-use
application developers to reopen the deprecated graph-first API would also
undercut the v18 Worldline-first story.

The design now carries a 20-slice PRD and test plan for closing this release
gate. The default product targets are a Worldline-first basis setup path such
as `worldline.prepareOpticBasis()` and a pinned coordinate capture path such as
`worldline.coordinate()`, followed by coherent public node and property optic
reads through `coordinate.optic()`.

## Done Looks Like

- A Worldline-first public basis setup path exists, is documented, and does not
  require first-use users to open `openWarpGraph(...)`.
- A Worldline-first public coordinate capture path exists and pins the causal
  position used by downstream optic reads.
- `openWarpWorldline(...).coordinate().optic().node(id).read()` succeeds in a
  public-path fixture with real checkpoint-tail indexed evidence.
- `openWarpWorldline(...).coordinate().optic().node(id).prop(key).read()`
  succeeds in the same public-path fixture.
- Reads from one coordinate stay coherent when the live worldline advances
  between awaited reads.
- Success and failure tests prove optic reads do not fall back to whole-graph
  materialization.
- Docs show how the bounded checkpoint-tail basis is created or verified before
  the first coordinate optic read.
- Docs explain `E_OPTIC_NO_BOUNDED_BASIS`, `E_OPTIC_TAIL_BUDGET_EXCEEDED`, and
  recovery actions.
- Consumer type tests prove the intended public coordinate optic chain works
  without importing internal paths.
- The package-surface decision is explicit: coordinate, optic, and result nouns
  are either exported public types or intentionally opaque chain-return values.
- `docs/BEARING.md` tracks slices 133 through 152 until the PRD, tests, docs,
  and release gate evidence are complete.

## Release Rule

`v18.0.0` is blocked until this card is complete. Tagging and registry publish
work must wait behind this gate.
