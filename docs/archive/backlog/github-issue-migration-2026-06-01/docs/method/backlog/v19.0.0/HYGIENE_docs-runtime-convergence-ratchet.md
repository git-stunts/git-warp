---
id: HYGIENE_docs-runtime-convergence-ratchet
blocked_by: []
blocks: []
feature: observer-admission-runtime
---

# Docs/runtime convergence ratchet

## Why

`git-warp`'s public doctrine is often ahead of the runtime.

That is better than the reverse, but it still creates a real maintenance
problem:

- docs teach stronger nouns
- code still behaves in older ways
- contributors have to guess whether the docs are aspiration, current truth, or
  near-future target

The repo needs a ratchet that stops this gap from quietly growing.

## What it should look like

- doctrine-heavy notes and public API docs make their status clearer
- implementation-carrying backlog items link back to the exact docs they are
  meant to reconcile
- major public noun/semantic promises gain an explicit runtime-alignment check
  before being treated as settled
- the repo has one practical rule for when docs are allowed to run ahead and
  what evidence must exist when they do

## Done looks like

- one packet or guardrail defines the allowed docs-ahead posture
- the current WARP drift items link into that ratchet instead of relying on
  memory
- future doctrine cuts are less likely to get a full release ahead of the
  runtime again

## Starting points

- `docs/audits/WARP_DRIFT.md`
- `docs/README.md`
- `docs/API_REFERENCE.md`
- `docs/CONCEPTUAL_OVERVIEW.md`
