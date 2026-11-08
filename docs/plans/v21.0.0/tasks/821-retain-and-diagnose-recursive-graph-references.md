---
id: "#821"
issue: "#821"
slug: "821-retain-and-diagnose-recursive-graph-references"
title: "Retain and diagnose recursive graph references across CAS boundaries"
type: "Feature"
wave: 2
workstream: "W4"
status: "blocked"
prerequisites: ["#819", "#903 (merged)"]
unlocks: ["#822", "#823"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Feature

```text
Execute task #821 (#821: Retain and diagnose recursive graph references across CAS boundaries) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#819, #903 (merged)) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (Recursive reference retention roots and doctor reference diagnostics.) and exclude out-of-scope work (Substrate migration (#822).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Part of Goalpost #905. Consumes #819's GraphReference schema and #903's ownership law.

## 2. Problem Description

CAS garbage collection and doctor must retain structurally owned pinned child graphs while NOT treating unowned external live locators as retention roots.

## 2b. Proposed Solution

Wire structural ownership roots from #819 into git-cas retention manifests and add doctor diagnostics for broken pinned references vs. unreachable external locators.

## 2c. Alternatives considered and rejected

- Retain every reachable graph across live locators: rejected by #903 ('Traversal reachability does not imply owned retention').

## 2d. Acceptance Criteria

- [ ] Owned pinned child coordinates survive git gc --prune=now while their parent is retained.
- [ ] Unreferenced unowned external targets remain collectible when their own retention policy releases them.
- [ ] doctor distinguishes broken owned pinned references (error) from offline external live locators (info/warning).

## 2e. Test Plan

Golden: Create an owned pinned child and an external live child, run GC sweep, and verify the owned child is retained and doctor reports accurate status.

Edges: Shared child owned by two parents (retained until both release), cyclic live locators during GC mark phase.

Known failure modes: Missing owned child root is reported as a retention integrity error by doctor.

Fuzz and stress: Randomized parent/child retention and release lifecycles under GC sweeps.

## 3. Prerequisites

- [ ] `#819`
- [x] `#903 (merged)`

## 4. Scope

In: Recursive reference retention roots and doctor reference diagnostics.

Out: Substrate migration (#822).

## 5. Why now

Wave 2 task unlocked by #819; required for #822 and #823.

## 6. Risks

Keep CAS capacity/sweep execution inside git-cas per the storage ownership boundary.

## 7. Definition of Done

100% coverage on retention/diagnostic wiring and green Docker suite.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#821](https://github.com/git-stunts/git-warp/issues/821)
- Directly unlocks: `#822`, `#823`
