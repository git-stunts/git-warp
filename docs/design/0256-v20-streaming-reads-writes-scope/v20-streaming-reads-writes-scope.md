# V20 Streaming Reads And Writes Scope

## Hill

Keep end-to-end graph streaming reads and writes in the v20 runtime-realization
lane, and define what v19 must prove before that claim becomes executable.

## Context

The repo already has stream-shaped utilities and stream-capable lower-level
ideas, but it does not fully support graph reads and writes without
materializing broad state in memory. V18 release notes now say this explicitly.

The next risk is planning drift: calling a later branch "streaming" because
one surface returns an async iterator while the runtime still materializes the
whole graph or patch set underneath.

## User Stories

- As a large-graph user, I can tell whether an API is truly bounded, paged,
  streamed, or merely stream-shaped after full materialization.
- As a v19 implementer, I know which support and index contracts v20 depends
  on.
- As a reviewer, I can reject premature streaming claims with a concrete
  standard.

## Acceptance Criteria

- The v20 backlog keeps end-to-end graph streaming as a runtime-realization
  goal.
- V19 prerequisites include bounded support rules, causal indexes, and
  support-scoped fragments.
- Public docs distinguish content-byte streaming from graph-level streaming.
- Any future streaming claim names the storage boundary, reducer path, read
  path, and public API surface it covers.

## Test Plan

- Inspect `docs/method/backlog/v20.0.0/PERF_end-to-end-graph-streaming.md`.
- Add or preserve docs-shape tests that forbid v18 streaming overclaims.
- For implementation slices, require memory witnesses and anti-collect
  regressions before accepting a streaming label.
