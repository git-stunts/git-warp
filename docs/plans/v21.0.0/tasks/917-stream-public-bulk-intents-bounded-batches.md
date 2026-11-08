---
id: "#917"
issue: "#917"
slug: "917-stream-public-bulk-intents-bounded-batches"
title: "Stream public bulk intents through bounded atomic batches with backpressured receipts"
type: "Feature"
wave: 3
workstream: "W4"
status: "blocked"
prerequisites: ["#817", "#916 (merged)"]
unlocks: ["#823"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Feature

```text
Execute task #917 (#917: Stream public bulk intents through bounded atomic batches with backpressured receipts) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#817, #916 (merged)) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (Public bulk batch ingestion API, batch budget validator, and batch stream receipts.) and exclude out-of-scope work (Automatic durable retry of failed bulk streams (explicitly out of scope for v21.0.0).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Issue #917 is a required v21.0.0 card owning the public streamed bulk-ingestion contract over #817's bounded causal reducer and #916's atomic descriptor size guards.

## 2. Problem Description

Ingesting a large stream of write intents either buffers the unbounded stream in memory or lacks clear committed-prefix vs. refused-suffix receipt semantics.

## 2b. Proposed Solution

Add a backpressured bulk-intent ingestion stream on AuthoredWarp where each bounded batch is atomic, pulling at most the configured batch budget and emitting per-batch and terminal summary receipts.

## 2c. Alternatives considered and rejected

- Wrap an unbounded async iterable in a single all-or-nothing transaction: rejected by the v21.0.0 exit invariant ('A bulk batch is atomic, the whole stream is not').

## 2d. Acceptance Criteria

- [ ] Each batch is admitted atomically within declared byte and item budgets.
- [ ] Pull backpressure pauses upstream producer consumption until the current batch settles.
- [ ] Mid-stream refusal or cancellation clearly distinguishes committed batch prefixes from refused/unconsumed suffixes.

## 2e. Test Plan

Golden: Stream 10,000 write intents in 100-intent atomic batches, inject a refusal on batch 50, and verify batches 1-49 are committed with receipts while batch 50+ is unconsumed.

Edges: Empty stream, single oversized batch item rejected by #916 guard, and consumer cancellation between batches.

Known failure modes: Batch budget violation or producer throw halts ingestion cleanly and returns the committed prefix receipt.

Fuzz and stress: Backpressure and heap-ceiling stress test streaming 100k intents under a fixed Docker memory cap.

## 3. Prerequisites

- [ ] `#817`
- [x] `#916 (merged)`

## 4. Scope

In: Public bulk batch ingestion API, batch budget validator, and batch stream receipts.

Out: Automatic durable retry of failed bulk streams (explicitly out of scope for v21.0.0).

## 5. Why now

Wave 3 card unlocked by #817; required for the #823 aggregate memory proof.

## 6. Risks

Ensure each batch updates cone/retained roots incrementally without accumulating cross-batch state in RAM.

## 7. Definition of Done

- [ ] 100% coverage on bulk ingestion modules and #917 closes.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#917](https://github.com/git-stunts/git-warp/issues/917)
- Directly unlocks: `#823`
