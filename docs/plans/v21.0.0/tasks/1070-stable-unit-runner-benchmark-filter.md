---
id: "#1070"
issue: "#1070"
slug: "1070-stable-unit-runner-benchmark-filter"
title: "Prevent stable unit runner from selecting benchmark files that Vitest ignores"
type: "Bug"
wave: 0
workstream: "W5"
status: "open-frontier"
prerequisites: ["#1063 (merged)"]
unlocks: []
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Bug

```text
Execute task #1070 (#1070: Prevent stable unit runner from selecting benchmark files that Vitest ignores) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#1063 (merged)) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (scripts/run-stable-unit-tests.ts, vitest.config.ts, and test/unit/scripts/run-stable-unit-tests.test.ts.) and exclude out-of-scope work (Benchmark execution suites under test/benchmark/.).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Issue #1070 identifies a mismatch between TEST_FILE_PATTERN in scripts/run-stable-unit-tests.ts and the include globs in vitest.config.ts.

## 2. Observed

scripts/run-stable-unit-tests.ts selects *.benchmark.* files in any directory, but vitest.config.ts only runs *.benchmark.ts inside a benchmark/ directory. Vitest silently ignores the file when paired with a passing test.

## 2b. Expected

The stable unit runner and vitest.config.ts agree on runnable test files, or the runner fails closed when Vitest ignores a selected file.

## 2c. Reproduction

Place a failing test/unit/domain/Bad.benchmark.ts alongside a passing test/unit/domain/Good.test.ts and run vitest run on both paths: Vitest exits 0 without running Bad.benchmark.ts.

## 2d. Blast radius

Latent gap across all unit shards since PR #1065 (f9c81bc90). Zero current files under test/unit trigger it today, but 24 dry-run test fixtures assert the broken rule.

## 2e. Hypothesis

Deriving the selection rule from one shared constant or verifying the partition against vitest list --filesOnly will catch any unexecuted file.

## 2f. Diagnosis

Confirmed in #1070: TEST_FILE_PATTERN in scripts/run-stable-unit-tests.ts permits .benchmark. outside benchmark/ directories.

## 3. Prerequisites

- [x] `#1063 (merged)`

## 4. Scope

In: scripts/run-stable-unit-tests.ts, vitest.config.ts, and test/unit/scripts/run-stable-unit-tests.test.ts.

Out: Benchmark execution suites under test/benchmark/.

## 5. Why now

Zero-prerequisite Wave 0 test-runner integrity fix that guarantees no unit test fails silently.

## 6. Risks

Updating test/unit/scripts/run-stable-unit-tests.test.ts fixtures must preserve full partition accounting.

## 7. Definition of Done

Selecting a file that Vitest ignores fails the runner, and a non-dry-run regression test verifies the failure in Docker.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#1070](https://github.com/git-stunts/git-warp/issues/1070)
- Directly unlocks: none
