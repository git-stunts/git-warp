---
id: "#1072"
issue: "#1072"
slug: "1072-retain-write-races-in-receipt-core"
title: "Retain concurrent write races in WriteAttemptRecord and writeReceiptCore"
type: "Feature"
wave: 0
workstream: "W2"
status: "open-frontier"
prerequisites: ["#1051 (merged)", "#1067 (merged)"]
unlocks: ["#1053"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Feature

```text
Execute task #1072 (#1072: Retain concurrent write races in WriteAttemptRecord and writeReceiptCore) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#1051 (merged), #1067 (merged)) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (WriteAttemptRecord, writeReceiptCore.ts, ObservationCustodyCborCodec, and unit/integration tests.) and exclude out-of-scope work (Public Optic(view).replay(coord) surface (#1053).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Found by the Baker Street review on PR #1071 (strike M-6). Currently, concurrent write races appear only on the outer write receipt and are omitted from the retained receipt core.

## 2. Problem Description

A retained plural write receipt core names no conflicted subject or sibling values, so replaying a write Coordinate in #1053 or rebuilding a receipt after crash recovery loses conflict evidence.

## 2b. Proposed Solution

Persist write races inside WriteAttemptRecord before arming and bind them into writeReceiptCore.ts and its CBOR codec.

## 2c. Alternatives considered and rejected

- Recompute races from the cone during replay: rejected because later folds advance the cone and replay must be byte-identical to the original receipt.

## 2d. Acceptance Criteria

- [ ] WriteAttemptRecord stores the detected write races before the attempt arms.
- [ ] writeReceiptCore includes the canonical race records in both committed and plural outcomes.
- [ ] Reconciled/rebuilt receipts after an interrupted write preserve the exact race set.

## 2e. Test Plan

Golden: Two writers race on the same property; the second writer's retained receipt core and rebuilt receipt both contain the exact race record.

Edges: Empty race list (derived outcome), multiple concurrent sibling values on one register, and node lifecycle vs. property register races.

Known failure modes: Corrupt or malformed race entries in CBOR fail closed with a typed decode error.

Fuzz and stress: Randomized concurrent writer interleavings verifying outer receipt races equal decoded receipt-core races.

## 3. Prerequisites

- [x] `#1051 (merged)`
- [x] `#1067 (merged)`

## 4. Scope

In: WriteAttemptRecord, writeReceiptCore.ts, ObservationCustodyCborCodec, and unit/integration tests.

Out: Public Optic(view).replay(coord) surface (#1053).

## 5. Why now

Explicit prerequisite for #1053 write replay; must land before v21 graphs accumulate version-1 receipt cores.

## 6. Risks

Changes canonical receipt-core CBOR layout; update test vectors and schema guards together.

## 7. Definition of Done

- [ ] 100% test coverage on touched custody/write files, all Docker unit tests pass, and #1072 closes.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#1072](https://github.com/git-stunts/git-warp/issues/1072)
- Directly unlocks: `#1053`
