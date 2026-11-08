---
id: "#1055"
issue: "#1055"
slug: "1055-optic-only-newcomer-path-and-annotations-showcase"
title: "Optic-only newcomer path, Rust-free annotations scaffold, and cone cost witness migration"
type: "Feature"
wave: 3
workstream: "W1"
status: "blocked"
prerequisites: ["#1051 (merged)", "#1052-3b", "#1053", "#1041"]
unlocks: ["#1054"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Feature

```text
Execute task #1055 (#1055: Optic-only newcomer path, Rust-free annotations scaffold, and cone cost witness migration) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#1051 (merged), #1052-3b, #1053, #1041) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (examples/annotations/, benchmarks/cone-showcase/, test/integration/ newcomer witness (#1045), README.md, and docs/topics/ guides.) and exclude out-of-scope work (Deleting legacy Runtime and Lane source files (#1054).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Implements Sections 3-4 and 8-9 of the Optic contract (#1049), extracts examples/annotations/ and benchmarks/cone-showcase/ from PR #1040 (commits 552111eae, b7eaa2de4, 3fa3e4aa7, 300d8684d, f161bfe0d, 88d891fab), and reconciles #979.

## 2. Problem Description

Getting-started docs, README examples, and the newcomer witness (#1045) still use legacy Runtime/Lane APIs and prescribe CLI repair before reading.

## 2b. Proposed Solution

Migrate examples/annotations/ (with checked-in Rust-free Wesley SDK), benchmarks/cone-showcase/, newcomer witness #1045, README.md, getting-started.md, observers.md, strands.md, and a new WarpAccessPort teaching guide onto Warp.open -> as(writer).execute -> Optic(...).read() -> strand -> settle.

## 2c. Alternatives considered and rejected

- Require a Rust toolchain to run the newcomer example: rejected by #1055.

## 2d. Acceptance Criteria

- [ ] Every documentation code snippet passes npm run lint:md:code and runs as a test.
- [ ] Newcomer witness (#1045) passes the complete journey (init, multi-writer writes, read-own-writes, removals, strand, fork, settlement) with zero pinned gaps.
- [ ] benchmarks/cone-showcase/ witness proves flat per-read and per-save git process and byte counts from 200 to 20,000 annotation threads.
- [ ] WarpAccessPort teaching guide covers working port implementation, receipt handling, cause catalogue, retry rules after crash, and denial shapes.

## 2e. Test Plan

Golden: Run the migrated newcomer witness (#1045) and examples/annotations/ showcase end-to-end in Docker with zero CLI repair steps and zero whole-state trap hits.

Edges: Crash retry during execute, denied access shapes, and 20,000-thread cold open.

Known failure modes: Any remaining reference to Runtime.open or 'repair before you read' in newcomer docs fails the docs gate.

Fuzz and stress: Multi-writer annotation corpus benchmark across 200, 2,000, and 20,000 threads in Docker.

## 3. Prerequisites

- [x] `#1051 (merged)`
- [ ] `#1052-3b`
- [ ] `#1053`
- [ ] `#1041`

## 4. Scope

In: examples/annotations/, benchmarks/cone-showcase/, test/integration/ newcomer witness (#1045), README.md, and docs/topics/ guides.

Out: Deleting legacy Runtime and Lane source files (#1054).

## 5. Why now

Wave 3 prerequisite that migrates all consumers and examples before #1054 deletes the legacy surface.

## 6. Risks

Keep tracked benchmark results and .d.ts files within repository size and payload budgets.

## 7. Definition of Done

All docs gates, newcomer witness cases, and showcase benchmarks pass in Docker, closing #1055 and #979.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#1055](https://github.com/git-stunts/git-warp/issues/1055)
- Directly unlocks: `#1054`
