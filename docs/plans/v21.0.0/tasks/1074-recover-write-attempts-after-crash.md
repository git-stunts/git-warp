---
id: "#1074"
issue: "#1074"
slug: "1074-recover-write-attempts-after-crash"
title: "Recover unresolved write attempts after a process crash and allow re-asking"
type: "Feature"
wave: 0
workstream: "W2"
status: "open-frontier"
prerequisites: ["#1051 (merged)", "#1067 (merged)"]
unlocks: ["#1077"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Feature

```text
Execute task #1074 (#1074: Recover unresolved write attempts after a process crash and allow re-asking) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#1051 (merged), #1067 (merged)) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (Write attempt lifecycle, reconcile/recovery methods on AuthoredWarp, and custody resume fallback.) and exclude out-of-scope work (Real multi-process SIGKILL test harness (#1077).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Found by the Baker Street review on PR #1071 (strikes M-3 and M-7). A process crash during execute() leaves no receipt or attempt handle for the caller.

## 2. Problem Description

1) A caller cannot list its unresolved write attempts after a crash. 2) Marking a record 'reported' before delivery strands it if the process dies before return. 3) reconcile deletes the record on first read so it answers at most once. 4) A transient resume failure reports Indeterminate even when the commit SHA is known.

## 2b. Proposed Solution

Allow a writer to list its unresolved attempts and re-ask for their receipts idempotently, persist known commit SHAs on unretained reconciled receipts, and always trust a verified commit over a transient resume error.

## 2c. Alternatives considered and rejected

- Delete attempt records immediately on first reconcile: rejected because a crash between delete and caller receipt handling permanently loses the outcome.

## 2d. Acceptance Criteria

- [ ] A writer can enumerate its unresolved attempts and re-query the receipt idempotently.
- [ ] A known published commit is never downgraded to Indeterminate by a transient custody resume failure.
- [ ] Reconcile retains the attempt record until explicit acknowledgement or bounded retention sweep.

## 2e. Test Plan

Golden: Simulate a crash after commit publication but before receipt return; reopen Warp as the writer, list unresolved attempts, and recover the committed receipt twice in a row.

Edges: Crash before commit publication (aborted/unarmed), crash after commit but before custody settlement, and transient CAS read failure when commit exists.

Known failure modes: Unauthorized observer or mismatched writer attempting to recover another writer's attempt is refused.

Fuzz and stress: Fault-injection across every step of the write attempt state machine.

## 3. Prerequisites

- [x] `#1051 (merged)`
- [x] `#1067 (merged)`

## 4. Scope

In: Write attempt lifecycle, reconcile/recovery methods on AuthoredWarp, and custody resume fallback.

Out: Real multi-process SIGKILL test harness (#1077).

## 5. Why now

Unblocks #1077 real crash witnesses and completes the retry safety contract for #1055.

## 6. Risks

Retaining reported attempt records longer requires bounded page rotation so the 64-record page does not wedge.

## 7. Definition of Done

All four M-3/M-7 failure modes have deterministic RED-to-GREEN unit and integration tests in Docker.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#1074](https://github.com/git-stunts/git-warp/issues/1074)
- Directly unlocks: `#1077`
