---
id: "#1078"
issue: "#1078"
slug: "1078-warp-open-pre-access-and-write-ref-guard"
title: "Settle Warp.open pre-access behavior and guard clone-local write-attempts refs"
type: "Bug"
wave: 0
workstream: "W2"
status: "open-frontier"
prerequisites: ["#1051 (merged)"]
unlocks: ["#1052-3b", "#1077"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Bug

```text
Execute task #1078 (#1078: Settle Warp.open pre-access behavior and guard clone-local write-attempts refs) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#1051 (merged)) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (src/application/Warp.ts, src/application/WarpWriteComposition.ts, ref layout/guards for write-attempts, and smoke-packed-node-removal.sh.) and exclude out-of-scope work (Crash recovery listing API (#1074).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Found by the Baker Street review on PR #1071 (strikes M-7, M-12; Holmes R8).

## 2. Observed

1) Warp.open always composes writes, fixes retention policy, and sweeps before any access check. 2) A wildcard refs/warp/* fetch copies clone-local refs/warp/<graph>/write-attempts/ without refs/cas. 3) writerHosts passes no logger, silencing warn policy messages.

## 2b. Expected

1) Warp.open performs no write-attempt mutation before an access-checked write or defers write composition until needed. 2) Clone-local write-attempt refs cannot be fetched as valid local attempts across clones. 3) writerHosts wires the configured logger.

## 2c. Reproduction

Open a repository with a deny-all WarpAccessPort and inspect refs/cas mutations; or run a wildcard refs/warp/* fetch as in scripts/smoke-packed-node-removal.sh.

## 2d. Blast radius

Affects all Warp.open callers on read-only clones or deny-all access ports, and any clone using wildcard refs/warp/* refspecs since #1051.

## 2e. Hypothesis

Deferring write-attempt sweep/policy setup until write execution (or gating on access), scoping write-attempt refs outside transferable lane refs (or binding clone identity), and passing logger into writerHosts fixes all three defects.

## 2f. Diagnosis

Confirmed in src/application/Warp.ts and src/application/WarpWriteComposition.ts from PR #1071.

## 3. Prerequisites

- [x] `#1051 (merged)`

## 4. Scope

In: src/application/Warp.ts, src/application/WarpWriteComposition.ts, ref layout/guards for write-attempts, and smoke-packed-node-removal.sh.

Out: Crash recovery listing API (#1074).

## 5. Why now

Recorded prerequisite in #1078 before #1052 Slice 3b builds further on Warp.open.

## 6. Risks

Changing write-attempt ref namespace or lazy initialization must preserve existing #1051 write tests.

## 7. Definition of Done

- [ ] Regression tests prove deny-all openers do not mutate custody/write refs, wildcard lane fetches do not import foreign write attempts, and logger warnings fire.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#1078](https://github.com/git-stunts/git-warp/issues/1078)
- Directly unlocks: `#1052-3b`, `#1077`
