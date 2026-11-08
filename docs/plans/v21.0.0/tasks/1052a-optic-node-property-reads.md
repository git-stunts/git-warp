---
id: "PR #1082"
issue: "#1052"
slug: "1052a-optic-node-property-reads"
title: "Observer-bound Optic reads Slice 3a: core nodes and properties"
type: "Feature"
wave: 0
workstream: "W1"
status: "ready-to-merge"
prerequisites: ["#1049 (merged)", "#1050 (merged)", "#1062 (merged)", "#1067 (merged)", "#1051 (merged)"]
unlocks: ["#1052-3b", "#1073"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Feature

```text
Execute task PR #1082 (#1052: Observer-bound Optic reads Slice 3a: core nodes and properties) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#1049 (merged), #1050 (merged), #1062 (merged), #1067 (merged), #1051 (merged)) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (ObservedWarp, Optic, OpticQuery, ConeReadExecutor for nodeExists and nodeProperty, six domain error classes, and unit/integration tests in PR #1082.) and exclude out-of-scope work (Edge properties, neighborhood reads, traversal, content streams, entity inventory, strand reads, plurality fields, and completed-read Coordinate retention (#1052-3b).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Goalpost #1048 replaces whole-state graph materialization with observer-bound Optic reads over the cone engine from #1062. Pull request #1082 in worktree ~/git/git-warp-w-1052 implements the first read slice for node existence and node properties.

## 2. Problem Description

Callers cannot read node existence or node properties through the new Warp surface without the legacy Lane.observe API.

## 2b. Proposed Solution

Add Warp.forObserver(observer), ObservedWarp, Optic(observedWarp), OpticQuery, and ConeReadExecutor support for nodeExists and nodeProperty with dedicated WarpError subclasses.

## 2c. Alternatives considered and rejected

- Wrap legacy Lane.observe receipts: rejected by the maintainer direct-cutover amendment on #1048.
- Retain every read immediately before #1080 is settled: rejected because each retained read costs 214 loose objects.

## 2d. Acceptance Criteria

- [ ] Warp.forObserver(observer) returns an ObservedWarp bound to the validated ObserverIdentity.
- [ ] Optic(observedWarp) checks WarpAccessPort before it evaluates any cone record.
- [ ] nodeExists and nodeProperty establish their own cone support without prior repair or checkpoint commands.
- [ ] All six new domain error classes have 100% unit test coverage, and the full-suite line ratchet reaches 93.59%.

## 2e. Test Plan

Golden: Write a node and property through Warp.as(writer).execute, then read both through Optic(warp.forObserver(observer)) on a fresh repository.

Edges: Empty repository, missing node, denied WarpReadGrant, cancelled observation, and exhausted ReadBudget.

Known failure modes: Invalid ObserverIdentity, Purpose, ReadBudget, WarpReadGrant, or WarpReadRequest throws its dedicated WarpError subclass.

Fuzz and stress: Concurrent multi-writer node updates folded through ConeReadExecutor under Docker memory limits.

## 3. Prerequisites

- [x] `#1049 (merged)`
- [x] `#1050 (merged)`
- [x] `#1062 (merged)`
- [x] `#1067 (merged)`
- [x] `#1051 (merged)`

## 4. Scope

In: ObservedWarp, Optic, OpticQuery, ConeReadExecutor for nodeExists and nodeProperty, six domain error classes, and unit/integration tests in PR #1082.

Out: Edge properties, neighborhood reads, traversal, content streams, entity inventory, strand reads, plurality fields, and completed-read Coordinate retention (#1052-3b).

## 5. Why now

PR #1082 is code-complete, pushed, and unblocks #1052-3b and #1073.

## 6. Risks

Merging before #1080 settles read retention means completed receipts in Slice 3a omit a Coordinate until Slice 3b.

## 7. Definition of Done

- [ ] PR #1082 passes CI and merges into main, and the integration commit is linked on #1052.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#1052](https://github.com/git-stunts/git-warp/issues/1052)
- Directly unlocks: `#1052-3b`, `#1073`
