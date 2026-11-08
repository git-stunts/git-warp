---
id: "#1081"
issue: "#1081"
slug: "1081-public-surface-package-dist-race"
title: "Fix public-surface-package test losing dist/ during group script runs"
type: "Bug"
wave: 0
workstream: "W5"
status: "open-frontier"
prerequisites: ["#1050 (merged)"]
unlocks: []
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Bug

```text
Execute task #1081 (#1081: Fix public-surface-package test losing dist/ during group script runs) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#1050 (merged)) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (test/unit/scripts/public-surface-package.test.ts and any sibling script test that mutates the shared dist/ directory.) and exclude out-of-scope work (Production src/ code and package export rules.).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Issue #1081 tracks an intermittent failure in test/unit/scripts/public-surface-package.test.ts when Vitest runs test/unit/scripts as a group inside Docker.

## 2. Observed

test/unit/scripts/public-surface-package.test.ts fails with 'Missing or escaping export target: ./dist/index.d.ts' when test/unit/scripts runs as a group.

## 2b. Expected

test/unit/scripts/public-surface-package.test.ts passes deterministically whether it runs alone or in a group.

## 2c. Reproduction

Run scripts/run-in-docker.sh npx vitest run test/unit/scripts repeatedly.

## 2d. Blast radius

Affects all contributors and CI pre-push gates running script unit tests since #1051 (3d3a9094a). Downstream pre-push hooks fail intermittently.

## 2e. Hypothesis

PublicSurfaceScanner reads dist/*.d.ts from the working tree while a sibling test in test/unit/scripts deletes or rebuilds dist/ concurrently. Isolating each test's dist fixture or serializing dist-mutating tests will eliminate the failure.

## 2f. Diagnosis

Empty at filing. Inspect all test/unit/scripts/*.test.ts files that invoke npm run build or rmSync('dist') before applying the fix.

## 3. Prerequisites

- [x] `#1050 (merged)`

## 4. Scope

In: test/unit/scripts/public-surface-package.test.ts and any sibling script test that mutates the shared dist/ directory.

Out: Production src/ code and package export rules.

## 5. Why now

Eliminates a known pre-push and CI test flake in Wave 0.

## 6. Risks

Building dist/ inside every test could slow the shard if not cached or isolated in a temporary directory.

## 7. Definition of Done

A regression test or isolated fixture ensures scripts/run-in-docker.sh npx vitest run test/unit/scripts passes three times in a row.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#1081](https://github.com/git-stunts/git-warp/issues/1081)
- Directly unlocks: none
