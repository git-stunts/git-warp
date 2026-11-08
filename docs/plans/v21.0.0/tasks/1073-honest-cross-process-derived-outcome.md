---
id: "#1073"
issue: "#1073"
slug: "1073-honest-cross-process-derived-outcome"
title: "Make write derived outcome honest across processes"
type: "Bug"
wave: 1
workstream: "W2"
status: "blocked"
prerequisites: ["PR #1082"]
unlocks: []
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Bug

```text
Execute task #1073 (#1073: Make write derived outcome honest across processes) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (PR #1082) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (ConeWriteBasis initialization, writer frontier tracking, and read-observation feed from #1052.) and exclude out-of-scope work (Outer vs. inner receipt race storage (#1072).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Found by the Baker Street review on PR #1071 (strike M-1). A fresh process currently initializes its write basis from whatever local cone head it finds on disk.

## 2. Observed

When process A writes a property and exits, and process B opens the same clone fresh and overwrites that property without reading, process B inherits the local cone head and reports outcome.kind === 'derived' instead of 'plural'.

## 2b. Expected

Process B's blind overwrite without reading reports 'plural' unless that writer actually observed the prior value via an Optic read or its own last recorded writer frontier.

## 2c. Reproduction

In two processes (or two fresh Warp.open instances) on one clone: writer A sets node property x=1; writer B opens fresh without reading and sets x=2; inspect receipt.outcome.kind.

## 2d. Blast radius

Affects all multi-writer or one-shot CLI/serverless processes sharing a clone since #1051.

## 2e. Hypothesis

Initializing a writer's observed frontier from that writer's own last committed patch frontier plus explicit #1052 Optic read observations (rather than the clone's global cone head) makes derived/plural honest across processes.

## 2f. Diagnosis

Confirmed in ConeWriteBasis / WarpWriteComposition.

## 3. Prerequisites

- [ ] `PR #1082`

## 4. Scope

In: ConeWriteBasis initialization, writer frontier tracking, and read-observation feed from #1052.

Out: Outer vs. inner receipt race storage (#1072).

## 5. Why now

Wave 1 fix immediately unlocked once PR #1082 merges.

## 6. Risks

Ensure a single writer's own sequential writes across process restarts still count its own prior commits as seen.

## 7. Definition of Done

Two-process blind overwrite experiment fails before the fix and reports 'plural' after the fix.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#1073](https://github.com/git-stunts/git-warp/issues/1073)
- Directly unlocks: none
