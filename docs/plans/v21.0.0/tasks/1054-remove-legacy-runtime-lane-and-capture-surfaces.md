---
id: "#1054"
issue: "#1054"
slug: "1054-remove-legacy-runtime-lane-and-capture-surfaces"
title: "Direct breaking cutover: remove legacy Runtime, Lane, captureCoordinate, and checkpoint surfaces"
type: "Feature"
wave: 4
workstream: "W1"
status: "blocked"
prerequisites: ["#1050 (merged)", "#1051 (merged)", "#1052-3b", "#1053", "#1055", "#1076"]
unlocks: ["#814"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Feature

```text
Execute task #1054 (#1054: Direct breaking cutover: remove legacy Runtime, Lane, captureCoordinate, and checkpoint surfaces) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#1050 (merged), #1051 (merged), #1052-3b, #1053, #1055, #1076) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (index.ts, advanced.ts, diagnostics.ts, src/application/Runtime.ts, Lane.ts, policy/public-surface-ratchet.txt, CHANGELOG.md, docs/migrations/v21/README.md, and closing prototype PR #1040.) and exclude out-of-scope work (Internal full-state CBOR codec deletion (#814).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Executes the final public surface removal of Goalpost #1048 and integrates the 3 iterator surface cleanup commits from worktree ~/git/git-warp-w-1050 (2e43c1526, 171ef5744, 0facc4c3a).

## 2. Problem Description

Legacy v20 public nouns (Runtime, Lane, captureCoordinate, legacy Optic class, raw createObserver/reading builders, missing_bounded_basis causes, public GitStorage.open, overrideWarpComposition test seam, and AuthoredWriteReceipt temporary name) remain exported until all replacements and docs land.

## 2b. Proposed Solution

Delete the legacy public exports and unreachable internal implementations, rename AuthoredWriteReceipt to WriteReceipt, apply the 3 iterator contract commits from git-warp-w-1050, empty policy/public-surface-ratchet.txt to zero, lower the package entry ceiling from 1,300, and publish the v20-to-v21 API migration table.

## 2c. Alternatives considered and rejected

- Keep deprecated Runtime/Lane aliases in v21.0.0: rejected by the maintainer's direct breaking cutover decision on #1048.

## 2d. Acceptance Criteria

- [ ] policy/public-surface-ratchet.txt is completely empty (0 legacy allowances).
- [ ] Every surviving source file under src/ is reachable from a supported entry point or deleted (enforced by a dead-file reachability gate).
- [ ] AuthoredWriteReceipt is renamed to WriteReceipt, overrideWarpComposition is moved out of production code, and the package entry ceiling is lowered back below 1,050.
- [ ] docs/migrations/v21/README.md maps every removed v20 noun to its v21 Warp/Optic replacement, and its examples run as tests.

## 2e. Test Plan

Golden: Run npm run typecheck, npm run typecheck:surface, npm run check:package-payload, and the public-surface-ratchet test with an empty ratchet file.

Edges: Subpath exports (./advanced, ./diagnostics, ./charts, ./testing) verified free of legacy Runtime/Lane nouns.

Known failure modes: Any unreferenced dead file left in src/ or any re-exported legacy noun fails the reachability and surface gates.

Fuzz and stress: AST reachability scanner across all package entry points.

## 3. Prerequisites

- [x] `#1050 (merged)`
- [x] `#1051 (merged)`
- [ ] `#1052-3b`
- [ ] `#1053`
- [ ] `#1055`
- [ ] `#1076`

## 4. Scope

In: index.ts, advanced.ts, diagnostics.ts, src/application/Runtime.ts, Lane.ts, policy/public-surface-ratchet.txt, CHANGELOG.md, docs/migrations/v21/README.md, and closing prototype PR #1040.

Out: Internal full-state CBOR codec deletion (#814).

## 5. Why now

Wave 4 breaking cutover once #1051-#1053, #1055, and #1076 are all integrated.

## 6. Risks

Coordinate carefully with CLI/MCP/SDK internal imports so no supported binary breaks.

## 7. Definition of Done

Zero entries in policy/public-surface-ratchet.txt, all gates green in Docker, prototype PR #1040 closed, and #1054 closes.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#1054](https://github.com/git-stunts/git-warp/issues/1054)
- Directly unlocks: `#814`
