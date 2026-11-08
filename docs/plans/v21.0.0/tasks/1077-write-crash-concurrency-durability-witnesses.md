---
id: "#1077"
issue: "#1077"
slug: "1077-write-crash-concurrency-durability-witnesses"
title: "Add real multi-process crash, concurrency, and durability witnesses for Warp writes"
type: "Feature"
wave: 1
workstream: "W2"
status: "blocked"
prerequisites: ["#1074", "#1075", "#1078", "#1080"]
unlocks: ["#823"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Feature

```text
Execute task #1077 (#1077: Add real multi-process crash, concurrency, and durability witnesses for Warp writes) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#1074, #1075, #1078, #1080) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (Multi-process integration witness tests, fsync configuration/docs reconciliation, and latency profiling.) and exclude out-of-scope work (Production write state-machine changes (owned by #1074, #1075, #1078).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Found by the Baker Street review on PR #1071 (strikes M-8, M-9, M-11). Current write tests run in one process with simulated port faults.

## 2. Problem Description

No witness tests real SIGKILL process termination after attempt arming, two concurrent OS processes writing simultaneously, 64-record page rotation, execute byte limits, or fsync durability truths.

## 2b. Proposed Solution

Build a Docker multi-process crash and concurrency witness suite exercising real child processes, page rotation, reconcile/sweep under whole-state traps, and core.fsync / durability documentation alignment.

## 2c. Alternatives considered and rejected

- Rely only on in-memory port stubs: rejected because OS process death, lock contention, and ref fsync behavior only manifest across real processes.

## 2d. Acceptance Criteria

- [ ] Real killed child-process witness proves an armed attempt is reconciled accurately on reopen.
- [ ] Two-process concurrent writer witness passes with zero lost commits or corrupt custody pages.
- [ ] 64-record page rotation, execute byte ceiling, and non-empty sweep pass with whole-state traps armed.
- [ ] Durability claims in docs match configured Git fsync settings.

## 2e. Test Plan

Golden: Spawn a worker process that arms a write and receives SIGKILL at defined checkpoints; parent process reopens Warp and verifies deterministic recovery.

Edges: 64th and 65th attempt record rotation, oversized intent payload rejection, and simultaneous sweep contention.

Known failure modes: Any whole-state trap hit or unrecoverable attempt state fails the witness.

Fuzz and stress: Randomized kill-point timing across 50 child-process write iterations inside Docker.

## 3. Prerequisites

- [ ] `#1074`
- [ ] `#1075`
- [ ] `#1078`
- [ ] `#1080`

## 4. Scope

In: Multi-process integration witness tests, fsync configuration/docs reconciliation, and latency profiling.

Out: Production write state-machine changes (owned by #1074, #1075, #1078).

## 5. Why now

Verifies the Wave 0 write-path fixes under real OS process conditions.

## 6. Risks

Keep runtime data and logs within the 4 GiB project test-data budget in Docker.

## 7. Definition of Done

All multi-process witnesses pass in Docker and #1077 closes.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#1077](https://github.com/git-stunts/git-warp/issues/1077)
- Directly unlocks: `#823`
