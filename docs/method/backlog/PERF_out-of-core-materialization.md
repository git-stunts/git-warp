---
id: PERF_out-of-core-materialization
blocked_by: []
blocks: []
---

# Out-of-core materialization and streaming reads


## Problem

`git-warp` currently treats whole-state materialization as an in-memory
operation.

That is acceptable for small and medium graphs, but it is not a safe long-term
assumption for the substrate:

- the full visible graph may not fit in process memory
- app authors may keep trying to preload whole graph state if the substrate does
  not provide stronger alternatives
- debugger and provenance tooling may need broad reads without forcing one
  monolithic in-memory `WarpState`

The current implementation does have:

- Git-backed checkpoints for materialized snapshots
- an optional seek cache backed by `@git-stunts/git-cas`

But that is not the same thing as a general out-of-core read architecture.

## Why this matters

This is both a substrate and product concern.

- For builders and agents, we should not encourage read patterns that assume the
  entire graph fits in memory.
- For `WarpCore`, whole-state inspection should remain honest about cost and
  should eventually support broader-than-memory workloads better than it does
  today.
- For `warp-ttd`, replay, slicing, provenance, and playback may need bounded or
  streamed access to state and history without reconstructing one giant object
  graph first.

## Goal

Design a real out-of-core read story for `git-warp` so the substrate can:

1. avoid assuming whole visible state fits in memory
2. expose streamed or bounded read surfaces where appropriate
3. distinguish clearly between:
   - in-memory materialized snapshots
   - Git-backed checkpoints
   - optional CAS-backed seek caches
4. keep the `WarpApp` read story simple while making `WarpCore` more honest and
   scalable

## Questions to answer

- Which current APIs assume a full in-memory `WarpState`?
- Which inspection or query surfaces could become streamed, paged, or
  index-backed first?
- What should "whole-state inspection" mean once graphs outgrow memory?
- How should checkpoints, seek-cache snapshots, and live replay cooperate?
- Which use cases belong to:
  - `WarpApp`
  - `WarpCore`
  - `warp-ttd`
- What can be done incrementally without destabilizing `v15`?

## Likely directions

- streamed node/edge/property enumeration from checkpoint or index-backed state
- more explicit bounded-read helpers in `WarpCore`
- index-backed inspection that does not require hydrating one full adjacency
  universe first
- clearer documentation that current `materialize*()` returns an in-memory
  snapshot, while checkpoints and seek caches are separate persistence layers

## Not this item

This item does **not** assume that:

- every materialized snapshot already streams from Git CAS
- app-facing reads should call `materialize()` directly
- the right answer is to hide materialization entirely

It exists because the current implementation and current documentation should
stay honest about what is and is not solved.
