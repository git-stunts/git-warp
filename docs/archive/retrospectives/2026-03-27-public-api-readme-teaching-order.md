# Retrospective: Public API README Teaching Order

**Date:** 2026-03-27
**Legend:** Observer Geometry
**Cycle:** `OG-010`
**Design:** `docs/design/public-api-design-thinking.md`, `docs/design/public-api-stratification.md`

## What Landed

- Added `test/unit/scripts/public-api-readme-shape.test.js` as an executable
  doctrine spec for public README teaching order and cost signaling.
- Updated `README.md` so the Quick Start now demonstrates pinned reads through
  `worldline().observer(...)` before showing raw query power.
- Added a `Core Primitives` section that introduces `WarpRuntime`,
  `Worldline`, `Observer`, `WarpState`, and speculative lanes before the README
  reaches lower-level inspection/query sections.
- Added an explicit `Read Model` section that states whole-state enumeration
  and direct materialization are inspection or advanced substrate operations,
  not normal product hot paths.
- Reframed the `Querying` chapter so application-facing read examples appear
  before inspection helpers and the inspection helpers are labeled honestly.

## Design Alignment Audit

- `aligned` — the README now teaches read discipline before raw graph power.
- `aligned` — pinned read handles through `worldline().observer(...)` are now
  the first read path shown in Quick Start.
- `aligned` — inspection helpers are explicitly labeled as inspection APIs,
  not the default product read model.
- `aligned` — cost signaling is now stated in direct language that both humans
  and agents can consume without inferring hidden doctrine.
- `aligned` — the slice added tests-as-spec for the most important README
  affordance rules instead of relying on prose review alone.
- `partially aligned` — the public API stratification is now taught in the
  README, but the cycle has not yet finished reshaping the broader API surface
  or all surrounding docs to match the same teaching order.

## Drift

There was no semantic drift inside the README slice itself.

One scope boundary remains explicit:

- this slice changed the README contract and added a dedicated doc-spec test
- it did not yet refactor the code surface or every public document to use the
  same stratification vocabulary

## Why The Adjustment Happened

- deliberate tradeoff: the current slice was scoped to README teaching order
  and executable documentation policy so the IBM cycle could start producing
  enforceable public-surface improvements immediately

## Resolution

- accepted as the correct slice boundary
- follow-on IBM slices should continue into broader public API shaping and the
  remaining docs corpus rather than treating the README rewrite as sufficient

## Verification

- `npx vitest run test/unit/scripts/public-api-readme-shape.test.js test/unit/scripts/read-api-doc-consistency.test.js`
- `node scripts/lint-markdown-code-samples.js README.md`
