---
id: "#1080"
issue: "#1080"
slug: "1080-retained-observation-loose-object-cost"
title: "Attribute and cut loose-object cost per retained observation and settle read retention"
type: "Decision"
wave: 0
workstream: "W2"
status: "open-frontier"
prerequisites: ["#1051 (merged)", "#1067 (merged)", "PR #1083 (merged)"]
unlocks: ["#1052-3b", "#1077"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Decision

```text
Execute task #1080 (#1080: Attribute and cut loose-object cost per retained observation and settle read retention) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#1051 (merged), #1067 (merged), PR #1083 (merged)) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (Object attribution benchmark in Docker, custody/carrier object reduction, and the contract decision in docs/plans/optic-only-public-api.md.) and exclude out-of-scope work (Historical replay API implementation (#1053).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Issue #1080 measured ~301 loose objects (1.2 MB before GC) per retained write and ~214 loose objects (855 KB) per retained read, plus one permanent ref under refs/cas/reservation-custody in GitStorage.root(). PR #1083 adopted git-cas 7.2.0 compressed reservation index.

## 2. The choice

After git-cas 7.2.0 adoption (PR #1083), how are remaining per-operation loose objects cut, when does GC run, and do Optic reads retain a Coordinate on every completed read or only when the query requests retention?

## 2b. Options and consequences

- Option A: Retain only when the query explicitly requests a Coordinate (or on write admission), and batch carrier/custody objects.
- Option B: Retain every completed read and page unconditionally, and trigger automatic git gc / pack maintenance.

## 2c. Rests on

Measured object attribution across carrier chain, custody pages, ledger, and patch bundle on current main (post-PR #1083), plus maintainer contract decision.

## 2d. Who decides, and by when

James Ross (maintainer), before #1052 Slice 3b wires completed-read Coordinates.

## 2e. What is blocked until then

#1052 Slice 3b (completed-read Coordinate retention) and #1077 (100k-write ref and object growth witness).

## 2f. Reversible

No once public callers rely on unconditional Coordinate presence on every OpticReceipt.

## 3. Prerequisites

- [x] `#1051 (merged)`
- [x] `#1067 (merged)`
- [x] `PR #1083 (merged)`

## 4. Scope

In: Object attribution benchmark in Docker, custody/carrier object reduction, and the contract decision in docs/plans/optic-only-public-api.md.

Out: Historical replay API implementation (#1053).

## 5. Why now

Priority ASAP blocker on the critical path to #1052 Slice 3b and #1053.

## 6. Risks

Unconditional per-read retention without object reduction fills 855 MB per 1,000 reads before GC.

## 7. Definition of Done

- [ ] Object attribution is recorded, avoidable loose objects are eliminated, and docs/plans/optic-only-public-api.md records the settled read-retention rule.

## 8. Stakeholders

James Ross (maintainer and decision owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#1080](https://github.com/git-stunts/git-warp/issues/1080)
- Directly unlocks: `#1052-3b`, `#1077`
