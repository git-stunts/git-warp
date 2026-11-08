---
id: "#1052-3b"
issue: "#1052"
slug: "1052b-optic-edges-inventory-strands-plurality"
title: "Observer-bound Optic reads Slice 3b: edges, neighborhood, traversal, content, inventory, strands, and plurality"
type: "Feature"
wave: 1
workstream: "W1"
status: "blocked"
prerequisites: ["PR #1082", "#1080", "#1078", "#1079"]
unlocks: ["#1053", "#1057", "#1055", "#248", "#1054"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Feature

```text
Execute task #1052-3b (#1052: Observer-bound Optic reads Slice 3b: edges, neighborhood, traversal, content, inventory, strands, and plurality) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (PR #1082, #1080, #1078, #1079) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (All remaining #1052 read kinds, ObservedStrand read handle, plurality surfacing, Wesley observer binding, read-to-write knowledge feed, and #1045 read witness cases.) and exclude out-of-scope work (Historical Coordinate replay, re-ask, and fork (#1053) and deleting Lane.observe (#1054).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Completes Issue #1052 after PR #1082 (Slice 3a) lands node existence and property reads.

## 2. Problem Description

Public Optic reads do not yet cover edge properties, neighborhood (edgesAround), bounded traversal, content attachments, paged entity admission inventory, ObservedStrand reads, plurality reporting, Wesley observer plug-ins, or completed-read Coordinate retention.

## 2b. Proposed Solution

Extract the remaining read operations from PR #1040 (commits c55b7f8b7, a2d11717d, 7785ebb70, bdcfef932, f43587613, b23968ee3) into ConeReadExecutor, OpticQuery, and ObservedStrand, wire read retention per #1080, and feed observed reads into ConeWriteKnowledge.

## 2c. Alternatives considered and rejected

- Materialize full state for neighborhood or inventory queries: rejected by #1039/#1048 zero-whole-state-trap law.

## 2d. Acceptance Criteria

- [ ] Optic(observedWarp) and Optic(observedStrand) execute edgeProperty, edgesAround, traversal, content, and paged entity inventory queries with zero whole-state trap hits.
- [ ] Readings report RegisterPlurality and LifecyclePlurality when concurrent siblings exist.
- [ ] Reading a raced register feeds ConeWriteKnowledge so a subsequent write is derived rather than blind-overwrite plural.
- [ ] Newcomer witness (#1045) passes its read-own-writes, empty-graph, 64-writes, and strand-inventory cases through Optic.

## 2e. Test Plan

Golden: Write nodes, edges, content attachments, and concurrent edits across two writers and a strand, then read all of them through Optic with all whole-state traps armed.

Edges: Inventory cursor pagination boundaries, empty neighborhood, budget exhaustion mid-traversal, and lazy sibling decoding when plurality is absent.

Known failure modes: Budget exhaustion or revoked access returns a typed OpticReceipt refusal/exhaustion without throwing 'no checkpoint'.

Fuzz and stress: Multi-writer equivalence oracle comparing Optic cone reads against full reduction across all query kinds.

## 3. Prerequisites

- [ ] `PR #1082`
- [ ] `#1080`
- [ ] `#1078`
- [ ] `#1079`

## 4. Scope

In: All remaining #1052 read kinds, ObservedStrand read handle, plurality surfacing, Wesley observer binding, read-to-write knowledge feed, and #1045 read witness cases.

Out: Historical Coordinate replay, re-ask, and fork (#1053) and deleting Lane.observe (#1054).

## 5. Why now

Primary Wave 1 deliverable on the critical path to #1053, #1055, #1057, and #1054.

## 6. Risks

Keep unpacked package size within the #1079 ceiling.

## 7. Definition of Done

All #1052 acceptance criteria pass with 100% coverage on touched files and #1052 closes.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#1052](https://github.com/git-stunts/git-warp/issues/1052)
- Directly unlocks: `#1053`, `#1057`, `#1055`, `#248`, `#1054`
