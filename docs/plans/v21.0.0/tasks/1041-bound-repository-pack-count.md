---
id: "#1041"
issue: "#1041"
slug: "1041-bound-repository-pack-count"
title: "Bound Git pack count for WARP repositories so save cost stays flat at 20k threads"
type: "Feature"
wave: 0
workstream: "W2"
status: "open-frontier"
prerequisites: ["#1062 (merged)"]
unlocks: ["#1055"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Feature

```text
Execute task #1041 (#1041: Bound Git pack count for WARP repositories so save cost stays flat at 20k threads) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#1062 (merged)) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (GitConeRecordStoreAdapter / fast-import pack maintenance hook, doctor pack-count check, and showcase witness verification.) and exclude out-of-scope work (Loose object explosion from observation custody refs (#1080).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

In the #1039 cone showcase witness, p50 save time was 33 ms at 200 threads and 48 ms at 2,000 threads, but rose to 168 ms at 20,000 threads because fast-import bulk loads left dozens of uncoalesced packfiles.

## 2. Problem Description

Each git fast-import fold or bulk load can leave an additional packfile; Git object lookup and save latency degrade linearly with pack count.

## 2b. Proposed Solution

Define pack-count ownership between git-warp and git-cas, trigger bounded multi-pack-index / geometric repack maintenance when pack count crosses a threshold, and surface pack count in doctor.

## 2c. Alternatives considered and rejected

- Run full git gc after every fold: rejected because full repack makes single writes O(repository size).

## 2d. Acceptance Criteria

- [ ] Pack count stays bounded below the declared threshold across 20,000 thread imports.
- [ ] p50 save latency at 20,000 threads remains flat relative to 2,000 threads.

## 2e. Test Plan

Golden: Run the 20,000-thread cone showcase witness in Docker and verify pack count and p50 save latency stay within budget.

Edges: Concurrent readers during geometric repack, read-only repositories, and repositories with zero packs.

Known failure modes: Repack failure leaves existing packs intact and surfaces a non-fatal diagnostic warning.

Fuzz and stress: Repeated fast-import fold bursts verifying pack count converges without object loss.

## 3. Prerequisites

- [x] `#1062 (merged)`

## 4. Scope

In: GitConeRecordStoreAdapter / fast-import pack maintenance hook, doctor pack-count check, and showcase witness verification.

Out: Loose object explosion from observation custody refs (#1080).

## 5. Why now

Wave 0 task with no open blockers; required for the #1055 showcase witness to prove flat 20k-thread save cost.

## 6. Risks

Synchronous repack inside a write path could spike tail latency if not geometric/incremental.

## 7. Definition of Done

20k-thread witness records bounded pack count and flat save cost in Docker.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#1041](https://github.com/git-stunts/git-warp/issues/1041)
- Directly unlocks: `#1055`
