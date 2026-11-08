---
id: "#1057"
issue: "#1057"
slug: "1057-cli-doctor-and-repair-cone-rewrite"
title: "Rewrite git warp doctor and repair as operator tools for the cone, optic-only model"
type: "Feature"
wave: 2
workstream: "W3"
status: "blocked"
prerequisites: ["#1052-3b", "#1049 (merged)", "#1062 (merged)", "#1067 (merged)"]
unlocks: []
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Feature

```text
Execute task #1057 (#1057: Rewrite git warp doctor and repair as operator tools for the cone, optic-only model) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#1052-3b, #1049 (merged), #1062 (merged), #1067 (merged)) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (CLI doctor and repair commands, docs/topics/cli.md, and BATS CLI tests.) and exclude out-of-scope work (Library public API deletions (#1054).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Implements Section 9 of the accepted Optic contract (#1049) and extracts commit 05aa20015 from PR #1040.

## 2. Problem Description

CLI doctor and repair still report checkpoint age and offer --action materialization as user-facing prerequisites for reading.

## 2b. Proposed Solution

Rewrite doctor to report cone ingest lag, #1067/#1044 retention-policy satisfaction, and reading readiness via actual bounded Optic probes; rewrite repair around advancing/verifying the cone basis, rebuilding derived records, and retire-legacy, removing --action materialization as a user path.

## 2c. Alternatives considered and rejected

- Delete doctor and repair completely: rejected by the 2026-10-31 maintainer decision keeping them as operator tools.

## 2d. Acceptance Criteria

- [ ] Newcomer witness (#1045) passes with zero CLI invocations.
- [ ] doctor on a fresh repository after writes reports ready, and a probe read through Optic agrees.
- [ ] No CLI output names a checkpoint or coordinate-as-frontier outside migration and retire-legacy commands.
- [ ] docs/topics/cli.md and BATS suites are updated and green.

## 2e. Test Plan

Golden: Write to a fresh repo, run git warp doctor (reports ready and zero cone lag), advance writer refs externally, run doctor (reports cone lag), and run git warp repair --action basis.

Edges: Empty repository with no writer refs (#1038), corrupted derived cone trie rebuilt from patch chains, and JSON output mode.

Known failure modes: Invalid repair action or unreadable repository exits with a structured CLI error code.

Fuzz and stress: BATS CLI matrix across fresh, lagging, and migrated repositories.

## 3. Prerequisites

- [ ] `#1052-3b`
- [x] `#1049 (merged)`
- [x] `#1062 (merged)`
- [x] `#1067 (merged)`

## 4. Scope

In: CLI doctor and repair commands, docs/topics/cli.md, and BATS CLI tests.

Out: Library public API deletions (#1054).

## 5. Why now

Unlocked in Wave 2 once #1052-3b completes the Optic readiness probe.

## 6. Risks

Do not report #1044 compaction/retire-legacy capabilities ready until their backing slices land.

## 7. Definition of Done

- [ ] BATS and unit suites pass in Docker with 100% coverage on touched CLI files.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#1057](https://github.com/git-stunts/git-warp/issues/1057)
- Directly unlocks: none
