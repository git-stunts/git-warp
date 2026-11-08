---
id: "#814"
issue: "#814"
slug: "814-eliminate-production-full-state-contracts"
title: "Delete production full-state materialization contracts and whole-state checkpoint system"
type: "Feature"
wave: 5
workstream: "W3"
status: "blocked"
prerequisites: ["#248", "#822", "#1054", "#1044-S2..S6"]
unlocks: ["#823"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Feature

```text
Execute task #814 (#814: Delete production full-state materialization contracts and whole-state checkpoint system) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#248, #822, #1054, #1044-S2..S6) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (Deletion of production full-state codecs, replay basis ports/adapters, _materializeGraph, and whole-state checkpoint classes; full-state-contract-ratchet.test.ts.) and exclude out-of-scope work (Aggregate memory proof matrix (#823).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Combines Issue #814 (branch origin/agent/eliminate-full-state-contracts commits 82ba46409 and c937c3c64) and Goalpost #1044 Slice 7 (deletion of the 29,409-line whole-state checkpoint/materialization system).

## 2. Problem Description

Nine production escape hatches (encodeWarpFullState, decodeWarpFullState, decodeCanonicalWarpFullState, loadReplayBasis, and _materializeGraph in 5 callers) can still reconstitute a complete WarpState in memory.

## 2b. Proposed Solution

Land test/unit/scripts/full-state-contract-ratchet.test.ts from origin/agent/eliminate-full-state-contracts, delete loadReplayBasis, RetainedMaterializationResumeStrategy, _materializeGraph, and the whole-state checkpoint system in #1044's 7-step dependency order, isolating any legacy decoding strictly inside migration scripts.

## 2c. Alternatives considered and rejected

- Leave encodeWarpFullState / decodeWarpFullState in src/ for convenience: rejected by the #814 source ratchet.

## 2d. Acceptance Criteria

- [ ] test/unit/scripts/full-state-contract-ratchet.test.ts scans all src/**/*.ts files and passes with zero occurrences of the 9 forbidden full-state contracts.
- [ ] Warm reopen, queries, writes, strands, and checkpoints pass with zero full-state codecs in production src/.

## 2e. Test Plan

Golden: Run full-state-contract-ratchet.test.ts and the full unit/integration test suites in Docker.

Edges: Warm reopen after restart using bounded retained roots (#815-#817) and cone records (#1062/#1044).

Known failure modes: Reintroducing any of the 9 full-state method names anywhere under src/ fails the build immediately.

Fuzz and stress: Full oracle suite verifying zero regressions after deleting the 29,409-LOC whole-state system.

## 3. Prerequisites

- [ ] `#248`
- [ ] `#822`
- [ ] `#1054`
- [ ] `#1044-S2..S6`

## 4. Scope

In: Deletion of production full-state codecs, replay basis ports/adapters, _materializeGraph, and whole-state checkpoint classes; full-state-contract-ratchet.test.ts.

Out: Aggregate memory proof matrix (#823).

## 5. Why now

Penultimate Wave 5 gate before the #823 release proof.

## 6. Risks

Delete in #1044's exact 7-step dependency order so every commit compiles and passes tests.

## 7. Definition of Done

- [ ] full-state-contract-ratchet.test.ts is green, all suites pass in Docker, and #814 and #1044 close.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#814](https://github.com/git-stunts/git-warp/issues/814)
- Directly unlocks: `#823`
