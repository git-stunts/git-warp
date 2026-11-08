---
id: "#1079"
issue: "#1079"
slug: "1079-payload-headroom-and-contract-reconciliation"
title: "Reconcile unpacked payload headroom, pre-permission I/O failures, and v20 trailer compatibility"
type: "Decision"
wave: 0
workstream: "W5"
status: "open-frontier"
prerequisites: ["#1051 (merged)"]
unlocks: ["#1052-3b", "#1054"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Decision

```text
Execute task #1079 (#1079: Reconcile unpacked payload headroom, pre-permission I/O failures, and v20 trailer compatibility) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#1051 (merged)) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (Package payload budget/pruning, pre-permission I/O error handling in Warp/Optic, purpose registry documentation, and v20 trailer reader witness test.) and exclude out-of-scope work (Full legacy surface deletion (#1054).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Found by the Baker Street review on PR #1071 (Holmes K6, K10, P12; Watson M7).

## 2. The choice

How should v21 manage the 3.3 MB unpacked package ceiling during additive slices, should pre-permission I/O errors return a receipt variant or reject, is a dynamic purpose registry required, and does a released v20 reader ignore eg-publication-attempt trailers?

## 2b. Options and consequences

- Option A: Prune dead internal declarations/JS now, return typed failure receipts on pre-permission store I/O errors, keep static validated Purpose.of nouns, and add a v20 trailer compatibility test.
- Option B: Raise the unpacked byte budget until #1054 deletes legacy code, let pre-permission I/O errors reject, and add a runtime purpose registry.

## 2c. Rests on

scripts/package-payload/CheckPackagePayload.ts measurements, Optic contract Section 2, and a Docker witness running v20 against a patch with eg-publication-attempt.

## 2d. Who decides, and by when

James Ross (maintainer).

## 2e. What is blocked until then

#1052 Slice 3b and #1054.

## 2f. Reversible

Payload ceiling adjustments are reversible; receipt rejection vs. variant semantics on I/O failure are part of the public v21 contract.

## 3. Prerequisites

- [x] `#1051 (merged)`

## 4. Scope

In: Package payload budget/pruning, pre-permission I/O error handling in Warp/Optic, purpose registry documentation, and v20 trailer reader witness test.

Out: Full legacy surface deletion (#1054).

## 5. Why now

Prevents additive #1052/#1053 slices from tripping package payload gates or diverging from Section 2 of the Optic contract.

## 6. Risks

Leaving pre-permission I/O behavior ambiguous causes inconsistent behavior between execute() and Optic reads.

## 7. Definition of Done

Decisions are recorded in docs/plans/optic-only-public-api.md, v20 trailer compatibility is proven by an automated test, and check:package-payload passes.

## 8. Stakeholders

James Ross (maintainer and decision owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#1079](https://github.com/git-stunts/git-warp/issues/1079)
- Directly unlocks: `#1052-3b`, `#1054`
