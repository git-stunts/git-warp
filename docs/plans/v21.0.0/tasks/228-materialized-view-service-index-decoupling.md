---
id: "#228"
issue: "#228"
slug: "228-materialized-view-service-index-decoupling"
title: "Remove P5-LEGACY index verification and byte-shard bridge from MaterializedViewService"
type: "Feature"
wave: 1
workstream: "W3"
status: "blocked"
prerequisites: ["#192"]
unlocks: ["#248"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Feature

```text
Execute task #228 (#228: Remove P5-LEGACY index verification and byte-shard bridge from MaterializedViewService) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#192) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (MaterializedViewService and its unit/integration tests.) and exclude out-of-scope work (Removing _materializeGraph from controllers (#248).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Issue #228 removes the obsolete P5-LEGACY encoding bridge and index verification coupling from MaterializedViewService after #192 migrates IncrementalIndexUpdater.

## 2. Problem Description

MaterializedViewService mixes view orchestration with low-level index shard verification and legacy byte-shard bridging.

## 2b. Proposed Solution

Delete the P5-LEGACY bridge and delegate index verification to the typed index store boundary established in #192.

## 2c. Alternatives considered and rejected

- Keep the legacy bridge alongside the new typed port: rejected by the no-sludge / no-transitional-duplication rule.

## 2d. Acceptance Criteria

- [ ] MaterializedViewService contains zero P5-LEGACY byte-shard bridge code.
- [ ] All view build and lookup tests pass through the typed IndexStorePort.

## 2e. Test Plan

Golden: Build and query a materialized view index through MaterializedViewService and verify identical results.

Edges: Missing index root, stale index tree, and empty graph.

Known failure modes: Verification mismatch returns a typed failure outcome.

Fuzz and stress: Randomized view rebuilds under concurrent patch additions.

## 3. Prerequisites

- [ ] `#192`

## 4. Scope

In: MaterializedViewService and its unit/integration tests.

Out: Removing _materializeGraph from controllers (#248).

## 5. Why now

Unlocked in Wave 1 immediately after #192 merges; unblocks #248.

## 6. Risks

Ensure no external caller imports the deleted bridge helper.

## 7. Definition of Done

- [ ] 100% coverage on touched lines in MaterializedViewService and #228 closes.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#228](https://github.com/git-stunts/git-warp/issues/228)
- Directly unlocks: `#248`
