---
cycle: 0265
task_id: API_optics-public-api-closeout
status: Planned
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-26
release_home: v18.0.0
backlog:
  - docs/method/backlog/v18.0.0/API_optics-public-api-closeout.md
---

# v18 Optics Public API Closeout

## Pull

Optics are part of the public-facing v18 value proposition. The current
Worldline-first branch exposes `events.optic()`, but the first-use product
story is not complete enough for release:

- the public path can fail with `E_OPTIC_NO_BOUNDED_BASIS` unless a
  checkpoint-tail indexed basis exists;
- the docs show a clean `events.optic().node(...).prop(...).read()` example
  without teaching how the required basis is created or verified;
- the package surface does not yet make an explicit decision about whether
  optic handles and read-result nouns are exported public types or intentionally
  opaque chain-return values;
- consumer-facing tests prove the chain exists, but they do not prove a full
  public success path from `openWarpWorldline(...)`.

That is an honest foundation, not a release-complete public API.

## Hill

Before `v18.0.0` is tagged or published, a first-use application developer can
follow public docs to:

1. open a worldline;
2. create or verify the bounded evidence required by foundation optics;
3. run successful node and node-property optic reads through the public
   Worldline-first API;
4. understand and recover from `E_OPTIC_NO_BOUNDED_BASIS`; and
5. consume the intended public TypeScript surface without importing internal
   paths.

## Feature Overview And Objectives

### Problem Statement

The current API makes Optics visible before the release has made Optics
operable for the first-use path. Because Optics are part of the v18 public
promise, release would overstate user value unless the happy path, failure
path, docs, and package contract are closed.

### Target Users

- Application developers adopting `openWarpWorldline(...)` for the first time.
- Tooling authors building query, inspection, or replay tools on top of
  bounded optic reads.
- Maintainers debugging why an optic read fails against a graph without the
  required checkpoint-tail basis.

### Success Metrics

| Metric | Target |
| --- | --- |
| Public success-path tests | At least one `openWarpWorldline(...).optic()` node read and one property read succeed against real bounded evidence. |
| Materialization fallback | Optic success and failure tests prove `_materializeGraph()` is not called. |
| Consumer type coverage | Consumer type test exercises the documented optic chain without internal imports. |

## Scope Definition

### In Scope

- Public success-path tests for node and node-property optic reads through
  `openWarpWorldline(...)`.
- A documented setup path for the checkpoint-tail indexed basis required by
  foundation optics.
- Recovery docs for `E_OPTIC_NO_BOUNDED_BASIS`.
- A package-surface decision for optic handles and read-result nouns.
- API-reference and migration-guide updates that distinguish foundation optics
  from general read surfaces.
- A release blocker guard that prevents tag/publish work until this gate is
  green.

### Out Of Scope

- Native Continuum witnesshood.
- Echo scheduler parity.
- Full observer-plan or reading-envelope parity.
- End-to-end graph streaming reads and writes.
- Broad graph query replacement by optics.
- Full retirement of legacy content/property storage.

## Detailed User Stories

| ID | User Story |
| --- | --- |
| US-001 | As an application developer, I want to run `events.optic().node(id).read()` successfully so that Optics are not merely an error surface. |
| US-002 | As an application developer, I want to run `events.optic().node(id).prop(key).read()` successfully so that I can read a bounded property value without materializing the graph. |
| US-003 | As a tooling author, I want optic failures to explain missing bounded evidence so that I can offer the right repair action. |
| US-004 | As a TypeScript consumer, I want the documented optic chain to type-check from package exports so that I do not import from `src/domain/**`. |
| US-005 | As a maintainer, I want release blockers to name Optics explicitly so that v18 is not tagged while the public value proposition is incomplete. |

## Acceptance Criteria

| Story | Acceptance Criteria |
| --- | --- |
| US-001 | Given a graph with a checkpoint-tail indexed basis, when a user opens it with `openWarpWorldline(...)` and calls `events.optic().node(id).read()`, then the read returns a `NodeOpticReadResult`-compatible value and does not call full materialization. |
| US-002 | Given the same public setup, when a user calls `events.optic().node(id).prop(key).read()`, then the read returns a `NodePropertyOpticReadResult`-compatible value and does not call full materialization. |
| US-003 | Given no checkpoint-tail indexed basis, when a user calls `events.optic()`, then the error remains `E_OPTIC_NO_BOUNDED_BASIS` and the docs name the required recovery path. |
| US-004 | Given a package consumer TypeScript project, when the documented optic chain is compiled, then it succeeds without internal path imports; negative checks reject unsupported internal assumptions. |
| US-005 | Given release docs and BEARING, when maintainers inspect v18 status, then release operation is blocked by `API_optics-public-api-closeout` until the tests and docs above are complete. |

## Detailed Test Plan

### Test Scenarios

| ID | Layer | Scenario | Expected Result |
| --- | --- | --- | --- |
| TS-001 | Unit or conformance | Open a public worldline over a graph with indexed checkpoint evidence and read node liveness through `events.optic()`. | Success result; no materialization fallback. |
| TS-002 | Unit or conformance | Read a node property through `events.optic().node(id).prop(key).read()`. | Success result; tail evidence included where applicable. |
| TS-003 | Unit | Open a worldline without bounded optic evidence and call `events.optic()`. | `E_OPTIC_NO_BOUNDED_BASIS` with recovery context. |
| TS-004 | Type check | Compile the public optic chain from root package imports. | No TypeScript errors and no internal imports. |
| TS-005 | Docs guard | Check API reference, migration guide, and readings guide for basis setup plus failure recovery. | Docs contain setup and recovery, not just the clean chain. |

### Happy Path Testing

1. Create or restore a graph fixture with checkpoint-tail indexed evidence.
2. Open the graph through `openWarpWorldline(...)`.
3. Run `events.optic().node(id).read()`.
4. Run `events.optic().node(id).prop(key).read()`.
5. Assert the expected result values and read identity evidence.
6. Install a materialization fallback trap and assert it is unused.

### Negative And Edge Case Testing

| Case | Expected Behavior |
| --- | --- |
| Missing checkpoint-tail basis | Fail with `E_OPTIC_NO_BOUNDED_BASIS`; no materialization fallback. |
| Unsupported historical selector | Fail closed with `E_OPTIC_NO_BOUNDED_BASIS`; no silent live retargeting. |
| Missing node | Return an explicit optic result describing non-liveness or absence, not a thrown internal error. |
| Missing property | Return the documented absent-value shape, not raw `undefined` ambiguity. |
| Tail budget exceeded | Fail with `E_OPTIC_TAIL_BUDGET_EXCEEDED` and documented recovery. |

### Non-Functional Testing

| Area | Requirement |
| --- | --- |
| Performance | Public success-path tests must prove optic reads do not call full materialization. |
| Load | Tail scanning remains bounded by the existing checkpoint-tail budget. |
| Security | Optic docs must not imply bypass of observer/aperture boundaries. |
| Accessibility | Documentation must include copy-pasteable setup and recovery examples with clear error names. |

## Release Gate

`v18.0.0` must not be tagged until this design is implemented and the
corresponding backlog item is checked off in `docs/BEARING.md`.
