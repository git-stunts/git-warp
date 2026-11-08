---
id: "#1044-S1"
issue: "#1044"
slug: "1044a-retained-readings-design-and-record-digests"
title: "Retained readings Slice 1: canonical record digests, Merkle directory pages, and join laws"
type: "Feature"
wave: 0
workstream: "W3"
status: "open-frontier"
prerequisites: ["#1062 (merged)", "#1067 (merged)"]
unlocks: ["#1044-S2..S6"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Feature

```text
Execute task #1044-S1 (#1044: Retained readings Slice 1: canonical record digests, Merkle directory pages, and join laws) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#1062 (merged), #1067 (merged)) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (docs/plans/retained-readings.md, cone record join methods, canonical digests, and Merkle directory commitment.) and exclude out-of-scope work (Support memos, wormholes, and compaction (#1044 Slices 2-6).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Goalpost #1044 replaces whole-state checkpoints with retained readings (element folds, support memos, and wormholes). Worktree ~/git/git-warp-w-ckpt (branch design/retained-readings, commit d1a02bd2b) contains the 461-line design record.

## 2. Problem Description

Cone records need canonical content digests, Merkle directory pages, per-record commutative/associative/idempotent join operations, and opaque basis commitments in receipts.

## 2b. Proposed Solution

Place the accepted retained-readings design record under docs/plans/retained-readings.md (preserving docs-topology rules) and implement Slice 1: canonical record digests, Merkle directory pages, and join per record kind.

## 2c. Alternatives considered and rejected

- Un-retire docs/design/ directory: rejected unless scripts/check-docs-topology.sh and AGENTS.md are updated, because docs/plans/ is the active home for design records.

## 2d. Acceptance Criteria

- [ ] fold(P . Q) == join(fold(P), fold(Q)) holds across all cone record kinds (node, edge, adjacency, admission).
- [ ] Adjacency pages and record directories produce identical Merkle commitments across arbitrary fold interleavings.
- [ ] Basis commitment appears only as opaque receipt evidence, never as a public frontier dump (#1048 constraint).

## 2e. Test Plan

Golden: Fold a multi-writer patch history in two partitions P and Q, join the resulting cone records, and verify byte-identical digests against a single-pass fold(P . Q).

Edges: Concurrent register siblings, resurrected nodes, empty adjacency pages, and shared-dot boundaries.

Known failure modes: Mismatched record kinds or corrupt digests fail closed with ConeRecordError.

Fuzz and stress: Property oracle testing associativity, commutativity, and idempotence of record join over 200 random histories.

## 3. Prerequisites

- [x] `#1062 (merged)`
- [x] `#1067 (merged)`

## 4. Scope

In: docs/plans/retained-readings.md, cone record join methods, canonical digests, and Merkle directory commitment.

Out: Support memos, wormholes, and compaction (#1044 Slices 2-6).

## 5. Why now

Wave 0 foundation for Goalpost #1044 with all prerequisites (#1062, #1067) already on main.

## 6. Risks

Keep docs/design/ absent so scripts/check-docs-topology.sh stays green.

## 7. Definition of Done

- [ ] Join equivalence oracle and unit tests reach 100% coverage in Docker.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#1044](https://github.com/git-stunts/git-warp/issues/1044)
- Directly unlocks: `#1044-S2..S6`
