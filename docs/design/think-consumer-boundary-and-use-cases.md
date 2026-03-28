# RFC: Think Consumer Boundary And Honest Time-Travel Use Cases

**Status:** DESIGN
**Date:** 2026-03-27
**Legend:** Observer Geometry
**Scope:** Clarify how higher-layer apps such as `think` should consume
`git-warp`, and record the few human-facing time-travel / provenance use cases
that currently seem honest

---

## Problem

Once a higher-layer application starts using WARP substrate features, there is a
strong temptation to rebuild graph infrastructure above the substrate:

- a second graph context
- app-local materialization logic
- app-local provenance assembly
- app-local time-travel semantics

That is exactly the wrong move for a consumer such as `think`.

If `think` starts doing graph nonsense itself, the observer/worldline boundary
we just established in `git-warp` will erode immediately.

---

## Core Rule

`think` should ask questions.

`git-warp` should do graph nonsense.

In practice, that means `think` should not think in terms of:

- `materialize()`
- `materializeCoordinate()`
- `materializeStrand()`
- `WarpState` snapshots
- `git-cas` lookups
- replay pipelines
- graph reconstruction
- worldline plumbing

Instead, `think` should issue read requests at the level of user intent:

- give me thoughts like this
- give me tasks matching this filter
- give me the lineage for this thought
- give me this note as of time `T`
- give me the provenance slice for this derived artifact

Everything below that request boundary belongs to `git-warp`.

---

## Consumer Boundary

For a higher-layer consumer like `think`, the intended layering is:

1. app asks a read question
2. `git-warp` chooses the appropriate read handle
3. `git-warp` resolves cache/materialization/replay internally
4. `git-warp` returns shaped read results

So the conceptual API shape should feel closer to:

```ts
await gitWarp.readNodes({
  source: { kind: 'strand', strandId: 'review-auth' },
  match: 'thought:*',
  where: { status: 'open' },
});
```

or:

```ts
await gitWarp.readProvenance({
  source: { kind: 'live' },
  entityId: 'thought:123',
});
```

not:

```ts
const state = await graph.materializeStrand('review-auth');
// app reconstructs read semantics from raw graph state here
```

The app asks for results. The substrate decides whether those results come from:

- an observer
- a worldline
- a cached materialized snapshot
- replay from patches
- a provenance index

---

## Hard Non-Goals For Think

`think` should not:

- build its own graph context
- cache its own materialized graph snapshots
- reproduce observer filtering logic above the substrate
- treat `materialize*()` as the normal read API
- expose substrate nouns like `worldline`, `braid`, or `playback head` in the
  ordinary capture flow

If `think` needs graph answers, it should ask `git-warp` for graph answers.

---

## Honest Human-Facing Use Cases

Most time-travel/forking ideas are easy to romanticize and hard to justify.

The following use cases currently seem real enough to keep:

### 1. Show Source

Given a derived task, summary, or structured note, the user can ask:

- where did this come from?
- which raw captures produced this?
- which edits or agent transforms touched it?

This is a provenance-first feature, not a graph-tour feature.

### 2. As Of

Given one thought, notebook, or project slice, the user can ask:

- show me what this looked like before later edits
- show me what I knew at the time

This is the cleanest time-travel use case because it answers a direct human
question about trust and memory.

### 3. Speculative Draft Lane

The user or agent can branch a thought into a speculative interpretation lane:

- summarize it
- turn it into tasks
- restructure it
- test alternate interpretations

without mutating the original raw capture.

This is the clearest justification for forking in a product like `think`.

### 4. Compare Interpretations

The user can compare:

- raw capture vs cleaned note
- earlier interpretation vs current interpretation
- accepted version vs speculative draft

This is useful when the question is “how did understanding change?” rather than
“what is the graph structure?”

### 5. System Debugging

If `think` grows agentic or automated behavior, provenance and time-travel also
become operational tools:

- why did this reminder appear?
- why did this task get created?
- which automation changed this note?

This is debugger value, not core note-taking value.

---

## What Should Stay Out Of The Capture Moment

Even if the substrate can do very sophisticated things, the ordinary capture
moment should not feel like:

- branching a worldline
- choosing a coordinate
- navigating provenance trees
- stepping a playback head

Those are advanced read/debug/speculation actions.

They are not the core write experience.

---

## Product Reading

The strongest near-term product bets for a `think`-like consumer are:

1. `Show source`
2. `As of...`
3. `Open draft lane`

Those features justify the substrate without forcing the user to learn substrate
nouns.

Everything more exotic should earn its existence from those simpler flows.
