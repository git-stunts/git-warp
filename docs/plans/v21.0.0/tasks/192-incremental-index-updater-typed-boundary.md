---
id: "#192"
issue: "#192"
slug: "192-incremental-index-updater-typed-boundary"
title: "Replace Record<string, unknown> and WarpStateLike in IncrementalIndexUpdater"
type: "Feature"
wave: 0
workstream: "W3"
status: "open-frontier"
prerequisites: []
unlocks: ["#228", "#816"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Feature

```text
Execute task #192 (#192: Replace Record<string, unknown> and WarpStateLike in IncrementalIndexUpdater) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (none) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (IncrementalIndexUpdater, IndexStorePort semantic boundary, CborIndexStoreAdapter, and quarantine manifest graduation.) and exclude out-of-scope work (Deleting MaterializedViewService's index verification concern (#228) and Roaring selection plane (#816).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Issue #192 is a required v21.0.0 card owning the semantic indexed-property boundary and removal of duck-typed WarpStateLike and Record<string, unknown> in IncrementalIndexUpdater.

## 2. Problem Description

IncrementalIndexUpdater relies on quarantined Record<string, unknown> bags, duck-typed WarpStateLike placeholders, and raw byte-shard encoding in domain code.

## 2b. Proposed Solution

Introduce validated runtime-backed domain models for index updates and semantic shards, move raw encoding behind IndexStorePort adapters, and graduate IncrementalIndexUpdater from anti-sludge quarantines.

## 2c. Alternatives considered and rejected

- Keep inline quarantine suppressions on IncrementalIndexUpdater: rejected because #816 and #228 require a typed semantic index boundary.

## 2d. Acceptance Criteria

- [ ] Zero Record<string, unknown>, unknown, or *Like types remain in IncrementalIndexUpdater.
- [ ] IndexStorePort accepts typed semantic shard models rather than raw byte buffers from domain callers.
- [ ] IncrementalIndexUpdater is removed from policy/quarantines/ manifests.

## 2e. Test Plan

Golden: Apply incremental node, edge, and property mutations through IncrementalIndexUpdater and verify identical index trees before and after the refactor.

Edges: Empty shards, deleted nodes with surviving properties, and concurrent register updates.

Known failure modes: Invalid shard OID or malformed property reader input fails closed at the boundary.

Fuzz and stress: Randomized patch sequences comparing incremental index updates against full index rebuilds.

## 3. Prerequisites

- [x] None (root contract front)

## 4. Scope

In: IncrementalIndexUpdater, IndexStorePort semantic boundary, CborIndexStoreAdapter, and quarantine manifest graduation.

Out: Deleting MaterializedViewService's index verification concern (#228) and Roaring selection plane (#816).

## 5. Why now

Wave 0 root card that unblocks both #228 and #816.

## 6. Risks

Touching quarantined files triggers quarantine-graduate-check; all sludge in touched files must be eliminated.

## 7. Definition of Done

- [ ] 100% test coverage on touched files, quarantine-graduate-check passes, and #192 closes.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#192](https://github.com/git-stunts/git-warp/issues/192)
- Directly unlocks: `#228`, `#816`
