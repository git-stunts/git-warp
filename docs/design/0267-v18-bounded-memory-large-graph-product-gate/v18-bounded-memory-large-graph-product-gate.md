---
cycle: 0267
task_id: PERF_bounded-memory-large-graph-product-gate
status: Planned
github_issue_url: https://github.com/git-stunts/git-warp/issues/549
sponsors:
  human: James
  agent: Codex
started_at: 2026-06-01
release_home: v18.0.0
backlog:
  - docs/archive/backlog/github-issue-migration-2026-06-01/docs/method/backlog/v18.0.0/PERF_bounded-memory-large-graph-product-gate.md
  - docs/archive/backlog/github-issue-migration-2026-06-01/docs/method/backlog/v18.0.0/API_no-full-materialization-first-use-optics.md
issues:
  - https://github.com/git-stunts/git-warp/issues/549
  - https://github.com/git-stunts/git-warp/issues/546
---

# v18 Bounded-Memory Large-Graph Product Gate

## Method Contract

| Field | Value |
| --- | --- |
| Sponsor human | Product architect and release operator |
| Sponsor agent | Runtime substrate implementer |
| Hill | Before `v18.0.0` can ship, git-warp normal public reads, writes, content lookup, and sync operate under an explicit git-warp memory budget against a graph larger than that budget. |
| Agent playback question | Can conformance prove a graph larger than the configured pool exercises blessed public APIs without full graph state, full indexes, full patch arrays, or full result arrays entering memory? |
| Human playback question | Can a production user trust that v18 will not assume their graph fits in memory during ordinary public API use? |
| Accessibility posture | Operator errors, docs, and reports must state the exact unsafe path and recovery action in plain text. No visual-only performance dashboard can be required to understand memory safety. |
| Localization posture | Budget names, cost labels, and error codes use stable ASCII identifiers. Explanatory prose avoids idioms and keeps units explicit. |
| Agent inspectability posture | Memory budget enforcement, capability reporting, and unsafe-path rejections must be queryable and testable. Agents should not infer large-graph safety from streaming-looking return types. |
| Non-goals | Native Continuum witnesshood, Echo scheduler parity, distributed braid semantics, and making every global graph question cheap. |

## Product Law

From this release gate forward:

```text
git-warp must not assume the full graph, full indexes, full patch history,
full snapshots, or full result sets fit in memory.
```

This is a v18 release blocker. The no-full-materialization Optics gate removes
the most visible first-use violation. This gate makes the invariant true across
normal public API use.

## Evidence Sources

| Source | Current risk |
| --- | --- |
| `src/domain/WarpWorldline.ts` | `prepareOpticBasis()` currently materializes before checkpoint creation. |
| `src/domain/WarpGraph.ts` | Public compatibility surface still exposes full-state and full-result helpers. |
| query/read model tests | QueryRunner has stream shape, but providers can still be backed by cached full state. |
| sync controller tests | Sync can avoid explicit materialization in some paths, but public responses still carry patch arrays. |
| content attachment tests | Byte reads can stream after lookup, but lookup still depends on graph state. |
| checkpoint/materialized view services | View and index construction can still derive from complete `WarpState`. |
| `docs/API_REFERENCE.md` | Docs still include first-use-looking examples for full-result APIs. |
| GitHub issue #136 and archived `PERF_out-of-core-materialization.md` | Existing debt note identifies out-of-core materialization as unresolved. |
| GitHub issue #565 and archived `PERF_end-to-end-graph-streaming.md` | Later-lane streaming note now becomes v18 scope because v18 is blocked by this gate. |

## Scope

This gate covers ordinary public API use:

- opening worldlines and lower-level graph capability bags;
- committing patches;
- exact node, edge, property, and content-reference reads;
- coordinate Optics;
- live reads and observer reads that are documented as first-use;
- query and traversal surfaces documented for product use;
- content byte reads and writes;
- sync and import/export paths exposed as normal public APIs;
- migration and operator paths when they claim bounded behavior.

Compatibility APIs may remain public only if their cost is explicit and they
are rejected or gated in bounded mode.

## Out Of Scope

- Native Continuum witnesses.
- Echo scheduler parity.
- Distributed braid collapse semantics.
- Making broad analytical questions cheap.
- Hiding global questions. Global operations may exist, but they need explicit
  bounded, streaming, external-sort, cursor, offline, or diagnostic contracts.

## Architecture Overview

The old product truth was:

```text
patch history -> full WarpState -> reads and writes
```

The v18 product truth must become:

```text
patch history -> bounded patch streams -> sharded facts/read bases
  -> bounded reads, writes, content lookup, and sync
```

`WarpState` can remain as a diagnostic or offline consumer. It cannot remain
the hidden source substrate for normal public APIs.

## Required Subsystems

### 1. Memory Budget Contract

Add `WarpMemoryPool`, `MemoryBudget`, or equivalent runtime nouns.

Required behavior:

- configured maximum bytes or capacity units;
- leases for decoded patch batches, shard cache entries, result windows, and
  temporary buffers;
- deterministic budget errors;
- metrics for allocated, leased, released, evicted, and rejected work;
- scoped budgets for operation kinds such as read, write, sync, index build,
  content lookup, and diagnostic full residency;
- test hooks that can set tiny budgets without relying on V8 heap behavior.

The memory pool does not need to control every byte allocated by JavaScript. It
must control git-warp-owned buffers, decoded batches, shard caches, and result
accumulation.

### 2. Patch Stream Substrate

Patch history must be consumable as bounded streams.

Required behavior:

- scan writer refs without collecting all commits first;
- decode patch facts in bounded windows;
- release decoded batches after consumption;
- support checkpoint-frontier plus live-tail reads;
- surface stream errors with enough evidence to resume or diagnose;
- preserve deterministic replay order where replay order matters;
- expose test hooks that fail on unbounded collection.

### 3. Streaming Read-Basis And Index Builder

The basis used by Optics and exact reads must be built from patch streams or
sharded facts, not from complete `WarpState`.

Required basis facts:

- node liveness by node id;
- edge liveness and endpoints by edge id and node adjacency;
- node and edge properties by key;
- content references by entity and slot;
- observed dots or equivalent causal support;
- provenance needed for read identity;
- checkpoint frontier and live-tail frontier;
- tail scan evidence and budget evidence.

The builder may run in multiple passes if each pass is bounded and observable.

### 4. Sharded Fact Indexes

Introduce persisted or cache-backed shards for targeted reads and writes.

Required shards:

- node liveness;
- edge endpoints;
- edge labels and adjacency;
- node properties;
- edge properties;
- content references;
- causal dots/frontiers;
- provenance/read identity;
- checkpoint-tail membership.

Shard keys should be stable and derive from domain identity, not process-local
object addresses. Shard reads must be targeted for exact reads and explainable
for prefix or glob reads.

### 5. Fact Resolvers For Writes

Existing-entity writes must stop consulting full cached state.

Required resolvers:

- node exists or tombstoned;
- edge exists or tombstoned;
- edge endpoints for edge property writes;
- content slot exists and current reference;
- property current value and causal support where required;
- writer-frontier and observed-dot evidence.

Patch builders should receive targeted resolver ports, not `_cachedState`.

### 6. Public Read Contracts

Public reads must be classified by result and provider cost.

Required contracts:

- exact reads are bounded when backed by targeted shards;
- prefix, glob, traversal, and broad query reads are stream, page, or cursor;
- array-returning helpers require explicit limits or diagnostic/offline labels;
- naked `toArray()` on arbitrary graph data is rejected;
- query `.budget()` or equivalent enforces memory and row limits;
- query `.explain()` or equivalent describes exact-id, index, tail-scan,
  missing-index, rejected-full-scan, or diagnostic path.

### 7. Content Lookup And Streaming

Content byte streaming is not sufficient. The lookup that discovers the content
object id must also be bounded.

Required behavior:

- bounded content-reference lookup through facts or basis;
- byte streaming through adapter ports;
- bounded metadata reads for MIME type, byte count, digest, and content slots;
- clear diagnostic label for legacy lookup through materialized graph state;
- tests where content is attached on a graph larger than the memory pool.

### 8. Sync Cursors

Sync must not accumulate unbounded patch arrays before returning.

Required behavior:

- cursor or batch protocol at the public boundary;
- resumable suffix scan;
- bounded patch decode and apply windows;
- explicit `materializeAfterSync` compatibility behavior labeled diagnostic or
  legacy;
- tests proving sync over a large suffix respects memory budget.

### 9. Capability Reporting

Public handles must be able to report what is actually safe.

Potential shape:

```typescript
const caps = await worldline.capabilities();

caps.reads.nodeExact;       // bounded
caps.reads.nodePrefix;      // bounded | cursor | unavailable
caps.reads.contentStream;   // bounded-lookup-streaming-bytes | unavailable
caps.writes.removeNode;     // targeted-facts | unavailable
caps.sync.receive;          // cursor | legacy-array
```

The exact API can change, but capability truth must be queryable.

### 10. Operator Doctor

Add a doctor command or equivalent report:

```text
git warp doctor --memory-budget 64mb --large-graph
```

Required report sections:

- configured budget;
- available bases and indexes;
- unsafe public paths;
- missing shards;
- diagnostic/offline APIs that will be rejected in bounded mode;
- recommended repair or build steps.

### 11. Bounded Mode Rejection

When bounded mode is enabled, legacy full-residency APIs must fail unless the
caller explicitly opts into diagnostic or offline behavior.

Required behavior:

- `materialize()` rejected by default in bounded mode;
- `getStateSnapshot()`, unlimited `getNodes()`, and unlimited `getEdges()`
  rejected or limited;
- sync array responses rejected or capped;
- docs show how to opt into diagnostic full residency with intentionally
  explicit wording.

## Conformance Graph

The release gate needs a graph larger than the configured git-warp pool.

The fixture should include:

- many nodes across multiple prefixes;
- edges with labels and properties;
- content attachments;
- tombstones and conflicting writes;
- multiple writers;
- a live tail beyond a checkpoint or basis;
- sync suffixes large enough to require batching;
- exact reads, prefix reads, content lookup, writes, and sync operations.

The fixture does not need to exhaust physical RAM. It must exceed the git-warp
memory budget and fail if code collects unbounded data inside git-warp-owned
structures.

## Acceptance Criteria

- A memory budget contract exists and is used by blessed public paths.
- Large-graph-over-small-pool conformance passes.
- First-use Worldline and Optics paths pass without full materialization.
- Exact node and property reads use bounded resolvers or facts.
- Existing-entity writes use targeted fact resolvers.
- Content reference lookup is bounded before byte streaming.
- Sync uses cursor or batch boundaries instead of unbounded response arrays.
- Query or traversal surfaces enforce budgets and explain cost.
- Capability reporting exposes bounded, streaming, cursor, transitional,
  diagnostic, offline, and legacy truth.
- Bounded mode rejects full-residency legacy APIs unless diagnostic/offline
  intent is explicit.
- Public docs and release notes describe the bounded-memory product claim with
  no hidden exceptions for normal first-use APIs.

## Test Plan

- Unit tests for memory leases, releases, eviction, budget exhaustion, and
  metrics.
- Stream substrate tests that fail on batch collection above budget.
- Basis builder tests over synthetic patch streams.
- Shard resolver tests for node, edge, property, content, and provenance facts.
- Write-path tests proving no `_cachedState` dependency for existing-entity
  checks.
- Query budget and explain tests.
- Content lookup tests with byte streaming and bounded metadata lookup.
- Sync cursor tests over large suffixes.
- Bounded-mode rejection tests for legacy full-residency APIs.
- End-to-end conformance with graph size greater than configured pool.
- Docs guard tests for cost labels and first-use examples.

## Sequencing

1. Memory budget skeleton and metrics.
2. Materialization tripwires shared with the Optics honesty gate.
3. Patch stream substrate.
4. Streaming or sharded read-basis builder.
5. Sharded fact indexes.
6. Fact resolvers for writes.
7. Optics setup over bounded basis.
8. Exact bounded reads and cursorized broad reads.
9. Query budget and explain.
10. Bounded content-reference lookup.
11. Sync cursorization.
12. Capability reporting and operator doctor.
13. Bounded-mode legacy rejection.
14. Large-graph-over-small-pool conformance.
15. Public docs and release evidence.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Scope is large for v18. | Treat this as the release gate because the product target requires it; split into small slices, but do not publish until the gate passes. |
| Memory accounting cannot control V8. | Account for git-warp-owned buffers, batches, shards, and results; use conformance tripwires for logical full residency. |
| Existing APIs are array-shaped. | Require limits, cursor replacements, or diagnostic/offline labels. |
| Query providers look streaming but read from full state. | Capability reporting and explain output must include provider source, not just return type. |
| Content byte streaming hides full-state lookup. | Make content-reference lookup its own tested bounded resolver. |
| Sync compatibility depends on patch arrays. | Add cursor/batch protocol and keep array shape as legacy or diagnostic. |

## Playback Witness

The closeout witness must include:

- conformance command and output for graph larger than the configured pool;
- memory budget metrics captured during representative operations;
- source links for budget, patch stream, basis, resolver, content, and sync
  implementations;
- public API cost inventory;
- capability or doctor output;
- release docs showing the bounded-memory claim and its diagnostic exceptions.
