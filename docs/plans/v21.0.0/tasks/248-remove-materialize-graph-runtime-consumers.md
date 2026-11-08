---
id: "#248"
issue: "#248"
slug: "248-remove-materialize-graph-runtime-consumers"
title: "Migrate remaining runtime and controller consumers off _materializeGraph()"
type: "Feature"
wave: 3
workstream: "W3"
status: "blocked"
prerequisites: ["#817", "#228", "#1052-3b"]
unlocks: ["#814"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Feature

```text
Execute task #248 (#248: Migrate remaining runtime and controller consumers off _materializeGraph()) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#817, #228, #1052-3b) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (RuntimeHost, DetachedGraphFactory, RuntimeHostProduct, QueryController, ComparisonController, and MaterializeController.) and exclude out-of-scope work (Final deletion of WarpStateCborCodec full-state methods (#814).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Issue #248 is a required v21.0.0 card that removes internal runtime and controller calls to _materializeGraph() once #1052's cone reads and #817's streamed causal reduction are in place.

## 2. Problem Description

RuntimeHost, DetachedGraphFactory, RuntimeHostProduct, and QueryController still call _materializeGraph() as an internal escape hatch.

## 2b. Proposed Solution

Route remaining query, comparison, BTR, and controller operations through cone records (#1052) and streamed retained roots (#817) so no production caller invokes _materializeGraph().

## 2c. Alternatives considered and rejected

- Rename _materializeGraph() to another helper that still builds a full WarpState: rejected by #248 and #814.

## 2d. Acceptance Criteria

- [ ] Zero production callers invoke _materializeGraph().
- [ ] All controller and runtime operations pass with whole-state materialization traps armed.

## 2e. Test Plan

Golden: Run all query, comparison, and BTR integration suites with a throwing trap on _materializeGraph().

Edges: Detached historical reads, empty graph comparisons, and BTR boundary transitions.

Known failure modes: Any accidental fallback to whole-state materialization throws immediately in tests.

Fuzz and stress: Controller operation mix under a fixed Docker heap cap.

## 3. Prerequisites

- [ ] `#817`
- [ ] `#228`
- [ ] `#1052-3b`

## 4. Scope

In: RuntimeHost, DetachedGraphFactory, RuntimeHostProduct, QueryController, ComparisonController, and MaterializeController.

Out: Final deletion of WarpStateCborCodec full-state methods (#814).

## 5. Why now

Wave 3 prerequisite before #814's full-state contract ratchet can turn green.

## 6. Risks

Preserve operator migration/export paths behind explicit bounded or migration-only seams.

## 7. Definition of Done

100% coverage on touched controller paths and #248 closes.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#248](https://github.com/git-stunts/git-warp/issues/248)
- Directly unlocks: `#814`
