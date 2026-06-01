---
id: PERF_end-to-end-graph-streaming
feature: materialization-query-index
blocked_by:
  - PROTO_bounded-support-rules-for-query-surfaces
  - PROTO_causal-indexes-for-sliced-queries
  - PROTO_support-scoped-fragment-materialization
blocks: []
---

# End-To-End Graph Streaming Reads And Writes

## Release Home

Primary release home: `v20.0.0`.

This card is superseded for normal public-path bounded-memory release work by
`PERF_bounded-memory-large-graph-product-gate` in `v18.0.0`. It remains the
later runway for broader slice-first runtime realization after the v18 gate is
met.

`v19.0.0` defines observer, support, index, and cost contracts that are broader
than the v18 public-path gate. `v20.0.0` is where those contracts become
ordinary runtime behavior for deeper traversal, migration, playback, and large
result surfaces beyond the v18 release conformance.

`v21.0.0` extends the same discipline into witnessed suffix admission, braid
collapse, local-site merge, and distributed/plural semantics.

## Problem

The repo has useful stream primitives and stream-capable ports, but the
runtime still contains many full-state and full-patch materialization
assumptions.

Examples of the current risk:

- content byte reads can stream only after a materialized read locates the
  content object id;
- materialization still loads patch collections into memory in important
  paths;
- query and observer surfaces can expose stream-shaped results while still
  depending on cached full state;
- buffered blob, tree, and patch APIs can hide full residency behind friendly
  method names.

That means the project must not claim end-to-end graph streaming until the
runtime proves it from storage boundary through public API.

## Desired End State

Broader slice-first runtime work can operate without assuming the whole graph
or the whole patch set fits in memory. Normal public-path reads, writes,
content lookup, and sync are v18 gate work.

The target includes:

- patch input consumed as `AsyncIterable` or an equivalent stream noun;
- reducer paths that can consume streamed patch facts under a support rule;
- read APIs that return stream, page, or cursor surfaces when result size is
  not bounded by the API contract;
- traversal APIs that do not require prebuilding the full result set;
- graph write APIs that can ingest streamed operation facts for imports,
  migrations, generated contract application, and large transformations;
- blob and attachment reads/writes that are truly streaming end to end when
  the adapter claims streaming support;
- global operators that can page, spill, sort externally, or run multiple
  streaming passes instead of requiring full graph residency;
- memory witness tests that fail when a blessed streaming path falls back to
  `collect()`, full-state clone, or full graph materialization.

## Non-Goals

- Do not duplicate the v18 bounded-memory public-path gate.
- Do not pretend every graph question is local or bounded.
- Do not ban global questions; make their residency strategy explicit.
- Do not call an API streaming when it only streams the final array after
  whole-state materialization.
- Do not require distributed braid/admission streaming in `v20.0.0`; that
  follow-through belongs in `v21.0.0`.

## Acceptance Criteria

- V18 bounded-memory public-path conformance exists and this item builds on it
  rather than replacing it.
- At least one large graph result path exposes a stream, page, or cursor API
  and proves it does not materialize the result set first.
- Materialization can consume streamed patch input for at least one support
  rule without first collecting all patch facts.
- Migration or import can write streamed operation facts without requiring a
  complete in-memory rewrite plan for the final graph history.
- Attachment streaming support is adapter-honest: buffered fallbacks are
  named as bounded or legacy behavior, not silently presented as streaming.
- Public docs and API docs distinguish local, global, streamed, paged,
  indexed, degraded, and full-materialization fallback paths.

## Test Plan

- Add constrained-memory witnesses for blessed streaming read paths.
- Add large-fixture tests for stream/page/cursor result surfaces.
- Add regression tests that fail if a streaming path calls `collect()` on an
  unbounded stream.
- Add adapter parity tests for blob and attachment streaming, including
  buffered fallback disclosure.
- Add materialization tests that feed patch facts as an async iterable and
  verify the reducer path does not pre-collect the input.
- Add docs shape tests that distinguish the v18 bounded public-path gate from
  the broader v20 slice-first runtime work.
