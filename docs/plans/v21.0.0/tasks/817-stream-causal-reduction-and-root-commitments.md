---
id: "#817"
issue: "#817"
slug: "817-stream-causal-reduction-and-root-commitments"
title: "Stream causal reduction and replace full-state hashes with root commitments"
type: "Feature"
wave: 2
workstream: "W3"
status: "blocked"
prerequisites: ["#816"]
unlocks: ["#248", "#822", "#917"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Feature

```text
Execute task #817 (#817: Stream causal reduction and replace full-state hashes with root commitments) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#816) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (Streamed causal reducer, root commitment calculator, and checkpoint/BTR root pinning.) and exclude out-of-scope work (Controller consumer migration (#248) and substrate migration (#822).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Part of Goalpost #824. Builds on #815's retained manifests and #816's Roaring selection plane.

## 2. Problem Description

Global checkpoints, BTRs, comparisons, and state hashes still reduce into a complete in-memory WarpState.

## 2b. Proposed Solution

Stream causal reduction over bounded ordinal/selection pages and replace full-state hashes with deterministic Merkle root commitments.

## 2c. Alternatives considered and rejected

- Compute state hashes by serializing full state in chunks: rejected if the reducer still holds the full state in memory.

## 2d. Acceptance Criteria

- [ ] Causal reduction updates retained selection and address pages in bounded memory.
- [ ] Root commitments are deterministic and order-independent across equivalent causal frontiers.

## 2e. Test Plan

Golden: Reduce a multi-writer patch stream into retained roots and verify identical root commitments across different merge orders.

Edges: Empty frontier, concurrent tombstones, and cancelled reduction mid-stream.

Known failure modes: Corrupt patch or page fails closed without mutating the prior committed root.

Fuzz and stress: Order-independence property test over randomized multi-writer patch DAGs.

## 3. Prerequisites

- [ ] `#816`

## 4. Scope

In: Streamed causal reducer, root commitment calculator, and checkpoint/BTR root pinning.

Out: Controller consumer migration (#248) and substrate migration (#822).

## 5. Why now

Wave 2 hub unlocking #248, #822, #917, and #814.

## 6. Risks

Must preserve causal semantics across reopen, comparison, and BTR.

## 7. Definition of Done

- [ ] 100% coverage on new reduction/commitment modules and green Docker suite.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#817](https://github.com/git-stunts/git-warp/issues/817)
- Directly unlocks: `#248`, `#822`, `#917`
