---
id: "#1076"
issue: "#1076"
slug: "1076-typed-write-causes-and-unforgeable-receipts"
title: "Replace string write causes with typed nouns and make write receipts unforgeable"
type: "Feature"
wave: 0
workstream: "W2"
status: "open-frontier"
prerequisites: ["#1051 (merged)"]
unlocks: ["#1054"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Feature

```text
Execute task #1076 (#1076: Replace string write causes with typed nouns and make write receipts unforgeable) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#1051 (merged)) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (Write receipt classes, write cause/requirement/retention domain nouns, WritePublication, and public-surface ratchet updates.) and exclude out-of-scope work (Deleting legacy WriteReceipt name collision (#1054 renames AuthoredWriteReceipt to WriteReceipt).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Found by the Baker Street review on PR #1071 (Holmes K3, K8, K9; strike M-12).

## 2. Problem Description

1) Write refusal/obstruction causes, requirements, and retention statuses use bare strings ('access-denied: ...', 'retention-refused-*') that leak git-cas vocabulary and invite message parsing. 2) The four write receipt classes have public constructors, allowing callers to forge receipts. 3) A repair hint instructs callers to delete a clone-local ref. 4) WritePublication claims to be opaque while exposing commitSha.

## 2b. Proposed Solution

Introduce runtime-backed typed cause/requirement/retention classes, guard receipt constructors with the private issued-occurrence capability pattern (from EntityOccurrenceRuntime), remove the topology-leaking repair hint, and reconcile WritePublication opacity.

## 2c. Alternatives considered and rejected

- Keep string union causes: rejected by SSTS Rule ('no message parsing for behaviorally significant branching') and Optic contract.

## 2d. Acceptance Criteria

- [ ] Direct new CommittedWriteReceipt(...) (and sibling receipts) outside the runtime throws a TypeError.
- [ ] All write causes, requirements, and retention states are frozen domain objects or strict contract enums without embedded git-cas strings.
- [ ] No repair hint names a clone-local ref path.

## 2e. Test Plan

Golden: Execute committed, plural, obstructed, and refused writes and dispatch on their typed cause/retention objects via instanceof.

Edges: Forged receipt construction attempt by external consumer fails both typecheck (private symbol/token) and runtime check.

Known failure modes: Invalid cause or unissued construction token throws a dedicated WarpError subclass.

Fuzz and stress: Property test over all refusal/obstruction cause variants verifying zero raw git-cas substrings leak.

## 3. Prerequisites

- [x] `#1051 (merged)`

## 4. Scope

In: Write receipt classes, write cause/requirement/retention domain nouns, WritePublication, and public-surface ratchet updates.

Out: Deleting legacy WriteReceipt name collision (#1054 renames AuthoredWriteReceipt to WriteReceipt).

## 5. Why now

Recorded in #1076: 'Decide these before #1054 fixes the surface.'

## 6. Risks

Updating public receipt properties touches test/type-check/ consumer tests and policy/public-surface-ratchet.txt.

## 7. Definition of Done

100% coverage on touched receipt/cause classes, consumer typecheck passes, and #1076 closes.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#1076](https://github.com/git-stunts/git-warp/issues/1076)
- Directly unlocks: `#1054`
