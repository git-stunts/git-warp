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
until that path has a documented success setup, public tests, recovery guidance,
and package-surface contract.

Shipping with only an exposed narrow handle and a common
`E_OPTIC_NO_BOUNDED_BASIS` failure path would make Optics feel like a promise
that users cannot exercise.

## Done Looks Like

- `openWarpWorldline(...).optic().node(id).read()` succeeds in a public-path
  fixture with real checkpoint-tail indexed evidence.
- `openWarpWorldline(...).optic().node(id).prop(key).read()` succeeds in the
  same public-path fixture.
- Success and failure tests prove optic reads do not fall back to whole-graph
  materialization.
- Docs show how the bounded checkpoint-tail basis is created or verified before
  the first optic read.
- Docs explain `E_OPTIC_NO_BOUNDED_BASIS`, `E_OPTIC_TAIL_BUDGET_EXCEEDED`, and
  recovery actions.
- Consumer type tests prove the intended public optic chain works without
  importing internal paths.
- The package-surface decision is explicit: optic/result nouns are either
  exported public types or intentionally opaque chain-return values.

## Release Rule

`v18.0.0` is blocked until this card is complete. Tagging and registry publish
work must wait behind this gate.
