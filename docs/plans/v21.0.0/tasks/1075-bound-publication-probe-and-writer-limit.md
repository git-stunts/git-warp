---
id: "#1075"
issue: "#1075"
slug: "1075-bound-publication-probe-and-writer-limit"
title: "Bound WritePublicationProbe ancestry walk and settle the 4,096 writer limit"
type: "Bug"
wave: 0
workstream: "W2"
status: "open-frontier"
prerequisites: ["#1051 (merged)"]
unlocks: ["#1077"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Bug

```text
Execute task #1075 (#1075: Bound WritePublicationProbe ancestry walk and settle the 4,096 writer limit) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#1051 (merged)) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (WritePublicationProbe, sweep budget enforcement, WARP_SUPPORT_LIMITS.writers, and boundary witness tests.) and exclude out-of-scope work (Membership compaction of retired writers (#1044 Slice 5).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Found by the Baker Street review on PR #1071 (strikes M-4 and M-5).

## 2. Observed

1) WritePublicationProbe walks up to 4,096 commits past the predecessor; if exceeded, the attempt stays Indeterminate forever and every subsequent Warp.open re-walks up to 262,144 git commands for 64 records. 2) WARP_SUPPORT_LIMITS.writers is 4,096 across the frontier, so the 4,097th writer permanently refuses all writes on the graph.

## 2b. Expected

1) Probe uses a single-process ancestry check and a per-sweep read budget, recording a terminal walk-exhausted finding instead of re-walking on every open. 2) Writer count scaling or explicit compaction/repair guidance prevents permanent graph bricking at 4,097 writers.

## 2c. Reproduction

Create an unresolved attempt whose predecessor is >4,096 commits behind the writer tip and call Warp.open repeatedly; or register 4,097 distinct writer IDs.

## 2d. Blast radius

Affects any high-volume writer chain (>4,096 commits between sweeps) and any multi-user application mapping userId -> writerId (>4,096 users).

## 2e. Hypothesis

Replacing per-commit git log walks with a bounded batch ancestry check, persisting terminal walk-exhausted status, and raising or paging the writer frontier limit fixes both bottlenecks.

## 2f. Diagnosis

Confirmed in WritePublicationProbe and WARP_SUPPORT_LIMITS in src/domain/services/write/.

## 3. Prerequisites

- [x] `#1051 (merged)`

## 4. Scope

In: WritePublicationProbe, sweep budget enforcement, WARP_SUPPORT_LIMITS.writers, and boundary witness tests.

Out: Membership compaction of retired writers (#1044 Slice 5).

## 5. Why now

Wave 0 bug with zero open prerequisites; required before #1077 stress witnesses.

## 6. Risks

Raising writer limits must keep custody reservation pages within git-cas 7.2.0 bounds.

## 7. Definition of Done

- [ ] Boundary witness tests verify bounded git command counts on deep chains and safe handling past 4,096 writers.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#1075](https://github.com/git-stunts/git-warp/issues/1075)
- Directly unlocks: `#1077`
