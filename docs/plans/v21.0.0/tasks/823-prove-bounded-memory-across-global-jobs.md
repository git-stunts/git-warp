---
id: "#823"
issue: "#823"
slug: "823-prove-bounded-memory-across-global-jobs"
title: "Prove bounded process memory across global jobs, attachments, migration, and recursion, and run v21.0.0 release preflight"
type: "Feature"
wave: 6
workstream: "W4"
status: "blocked"
prerequisites: ["#814", "#817", "#818 (merged)", "#820", "#821", "#822", "#916 (merged)", "#917", "#1032", "#1077"]
unlocks: []
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Feature

```text
Execute task #823 (#823: Prove bounded process memory across global jobs, attachments, migration, and recursion, and run v21.0.0 release preflight) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#814, #817, #818 (merged), #820, #821, #822, #916 (merged), #917, #1032, #1077) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (#823 memory proof suite, closure verification for #1034-#1038, version bump to 21.0.0, CHANGELOG/README release notes, and release preflight.) and exclude out-of-scope work (Post-v21.0.0 features (v21.1.0 / v22.0.0).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Issue #823 is the aggregate proof owner for Milestone v21.0.0, followed by the final release closure gates in .github/RELEASE.md.

## 2. Problem Description

Before cutting v21.0.0, git-warp must prove with reproducible Docker witnesses that no supported production path (cone reads/writes, global selection/reduction, multi-gigabyte attachment streaming, recursive traversal, bulk ingestion, or v20-to-v21 migration) scales heap/RSS with total graph or asset size.

## 2b. Proposed Solution

Execute the #823 fixed heap/RSS and correctness matrix in Docker (including an armed eager negative control that proves the memory ceiling trips when violated), verify closure of #1034-#1038, synchronize version 21.0.0 across package.json, package-lock.json, and jsr.json, and run scripts/release-preflight.sh and scripts/release-guard.sh.

## 2c. Alternatives considered and rejected

- Infer bounded memory from unit tests alone without a fixed Docker heap ceiling and negative control: rejected by #823.

## 2d. Acceptance Criteria

- [ ] Every claimed production path passes under a fixed Docker V8 heap and container RSS ceiling across scaling graph/asset sizes.
- [ ] The eager-collector negative control reliably trips the memory gate, proving the harness is non-vacuous.
- [ ] Issues #1034, #1035, #1036, #1037, and #1038 are verified closed by production witnesses.
- [ ] scripts/release-preflight.sh and scripts/release-guard.sh pass with zero errors.

## 2e. Test Plan

Golden: Run the complete #823 bounded-memory witness matrix and npm run release:preflight in Docker.

Edges: Multi-gigabyte attachment stream, cyclic recursive graph under slow consumer backpressure, and 20,000-thread repository migration.

Known failure modes: Any heap/RSS budget breach or whole-state trap hit fails the release gate.

Fuzz and stress: Sustained mixed read/write/bulk/traversal workload under bounded container memory.

## 3. Prerequisites

- [ ] `#814`
- [ ] `#817`
- [x] `#818 (merged)`
- [ ] `#820`
- [ ] `#821`
- [ ] `#822`
- [x] `#916 (merged)`
- [ ] `#917`
- [ ] `#1032`
- [ ] `#1077`

## 4. Scope

In: #823 memory proof suite, closure verification for #1034-#1038, version bump to 21.0.0, CHANGELOG/README release notes, and release preflight.

Out: Post-v21.0.0 features (v21.1.0 / v22.0.0).

## 5. Why now

Final Wave 6 gate that completes Milestone v21.0.0.

## 6. Risks

All Docker resource budgets (<=20 GiB build cache, <=4 GiB runtime test data, >=50 GiB host free space) must be enforced throughout the campaign.

## 7. Definition of Done

All #823 witnesses and release:preflight gates pass in Docker, and v21.0.0 is ready to tag.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#823](https://github.com/git-stunts/git-warp/issues/823)
- Directly unlocks: none
