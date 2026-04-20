---
id: PROTO_observer-plan-reading-envelopes
blocked_by: []
blocks: []
---

# Observer plans and reading envelopes

## Why

git-warp still presents the observer path as:

- resolve a source selector
- materialize a detached snapshot
- wrap it in `Observer`
- filter it

That is still too snapshot-first. The runtime should expose observer
plans, observer instances, and emitted reading envelopes instead of
teaching that "the graph" was observed directly.

## What it should look like

- authored `ObserverSpec` / `ObserverPlan`
- runtime observer instance
- emitted reading envelope with source, payload, witness/shell
  reference, budget metadata, and plurality/residual where relevant
- `observer(...)` becomes a convenience over the fuller plan surface,
  not the entire model

## Done looks like

- `Observer.ts` is no longer merely a filtered materialized-state view
- `QueryController.observer(...)` stops hiding the
  source-plan-reading split behind snapshot helpers
- one-shot reads and reusable observer instances share one
  reading-envelope family

## Starting points

- `src/domain/services/query/Observer.ts`
- `src/domain/services/controllers/QueryController.ts`
- `src/domain/types/WorldlineSelector.ts`
- `src/domain/types/StrandSelector.ts`
