---
id: "#1044-S2..S6"
issue: "#1044"
slug: "1044b-support-memos-wormholes-and-compaction"
title: "Retained readings Slices 2-6: git-cas storage, support memos, wormholes, compaction, and shared-dot folds"
type: "Feature"
wave: 2
workstream: "W3"
status: "blocked"
prerequisites: ["#1044-S1", "#1052-3b"]
unlocks: ["#814"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Feature

```text
Execute task #1044-S2..S6 (#1044: Retained readings Slices 2-6: git-cas storage, support memos, wormholes, compaction, and shared-dot folds) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#1044-S1, #1052-3b) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (#1044 Slices 2, 3, 4, 5, and 6 in src/domain/services/cone/ and git-cas adapters.) and exclude out-of-scope work (Whole-state checkpoint deletion (#1044 Slice 7 / #814).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Implements Slices 2 through 6 of Goalpost #1044 over the canonical record digests from #1044-S1.

## 2. Problem Description

Multi-entity readings (neighborhood, traversal, inventory, settlement) recompute cold when no dependency changed, fresh clones replay long writer histories without wormhole summaries, and shared-dot edge cases obstruct instead of folding.

## 2b. Proposed Solution

Implement git-cas-backed support memos (gated by observer coordinate and dependency set validity), verified writer-segment wormholes, Hot-tier compaction/GC sweep, and exact shared-dot / lazy element folding.

## 2c. Alternatives considered and rejected

- Serve support memos across different observers without revelation gating: rejected by #1044 Law 5 (Revelation law).

## 2d. Acceptance Criteria

- [ ] A support memo hit and a cold recomputation produce byte-identical OpticReceipts (Law 6).
- [ ] No cross-observer or cross-purpose memo leakage occurs; obstructions memoize as obstructions.
- [ ] Wormhole-seeded fresh-clone reads match cold patch-chain reduction byte-for-byte.
- [ ] Shared-dot histories fold to the exact same state as full reduction without obstructing.

## 2e. Test Plan

Golden: Execute a neighborhood Optic read cold, repeat warm (memo hit), advance an unrelated node (memo stays valid), advance a touched edge (memo invalidates and recomputes), and verify byte-identical receipts.

Edges: Corrupt wormhole delta caught by deferred verification, shared-dot concurrent removals, and compaction sweep releasing superseded folds.

Known failure modes: Invalid memo or unverifiable wormhole falls back to patch-chain folding or returns a typed obstruction.

Fuzz and stress: Oracle tests for memo validity, wormhole composition, and shared-dot folding across random multi-writer histories.

## 3. Prerequisites

- [ ] `#1044-S1`
- [ ] `#1052-3b`

## 4. Scope

In: #1044 Slices 2, 3, 4, 5, and 6 in src/domain/services/cone/ and git-cas adapters.

Out: Whole-state checkpoint deletion (#1044 Slice 7 / #814).

## 5. Why now

Completes the retained-reading cache and compaction machinery before #814 deletes legacy checkpoints.

## 6. Risks

CI's check-storage-ownership.ts gate must stay green (git-cas owns cache residency and eviction).

## 7. Definition of Done

All #1044 Slice 2-6 oracle and retention tests pass with 100% coverage on touched files.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#1044](https://github.com/git-stunts/git-warp/issues/1044)
- Directly unlocks: `#814`
