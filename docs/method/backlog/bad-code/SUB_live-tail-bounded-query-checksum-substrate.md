---
id: SUB_live-tail-bounded-query-checksum-substrate
blocked_by:
  - SUB_querybuilder-match-full-scan
blocks: []
feature: observer-admission-runtime
release_home: v18.0.0
---

# Live-tail bounded query/checksum substrate is missing

**Effort:** L

## Problem

0110 proved that `graph.query()` cannot honestly answer live
bounded-residency reads on the concrete large graph fixture without a
deeper substrate.

The fixture at `/Users/james/.think/codex` has a schema `4` checkpoint
with index shards, but the checkpoint frontier is stale relative to the
current writer ref. That means an index-backed read can honestly answer a
checkpoint-scoped coordinate, but not live `graph.query()` unless the
tail after the checkpoint is also accounted for.

The current default graph query path still goes:

```txt
QueryController.defaultQueryReadModelProvider()
  -> LiveQueryReadModelProvider.openQueryReadModel()
  -> _ensureFreshState()
  -> _materializeGraph()
```

That re-enters full-state residency before the query executes.

## Why It Matters

v17 narrowed its large-graph claim to TypeScript migration plus
streaming/bounded-query groundwork because this substrate does not exist
yet.

Without a live-tail source, implementations are tempted to lie by:

- returning the checkpoint `stateHash` for a live query;
- inventing a query-scope hash;
- wrapping full materialization in `AsyncIterable`;
- making exact-id tests pass only for empty graphs.

Those are all sludge.

## Required Direction

Build an honest live-tail bounded query/checksum substrate that can sit
behind the default `graph.query()` provider.

It must account for:

- checkpoint index shards;
- writer tail patches after the checkpoint frontier;
- exact-id/id-only miss and hit reads;
- deterministic live read identity or explicit public contract change
  if full live `stateHash` cannot be provided cheaply;
- stale checkpoint detection.

## Acceptance

- `graph.query().match(id).select(['id']).run()` does not call
  `_materializeGraph()` for exact-id hit/miss cases when a checkpoint
  index plus tail source can answer the question.
- The returned `stateHash` or replacement identity is honest and
  documented.
- The large graph fixture can run the exact-id bounded query probe
  without full materialization.
- The solution does not rewrite `RuntimeHost`, storage, materialization,
  or the query language in one slice.
- No fake streaming, fake hash, `RuntimeFacade`, `GraphPort`,
  `QueryRuntimeManager`, or helper landfill.

## Evidence

- `docs/design/0109-large-graph-bounded-residency-validation.md`
- `docs/design/0110-graph-query-bounded-read-model-provider.md`
- `test/conformance/graphQueryBoundedProvider.test.ts`
- `src/domain/services/controllers/QueryController.ts`
- `src/domain/services/query/LiveQueryReadModelProvider.ts`
- `src/domain/services/query/QueryReadModelProvider.ts`
