# RFC: Observer-First Reads, Working-Set Writes

**Status:** DESIGN
**Date:** 2026-03-25
**Scope:** Public substrate boundary for worldlines, observers, and speculative lanes

---

## Problem

git-warp already has most of the right substrate pieces for worldline-relative
reads and speculative evolution:

- coordinate materialization
- observer projections
- working sets with pinned base observations and overlays
- braid composition
- state readers and visible-state projection helpers
- transfer planning and deterministic substrate facts

But the public mental model is still too centered on `WarpGraph` as the thing an
application uses directly for everything.

That is one layer too low.

When higher layers treat `WarpGraph` as both their read API and their write API,
they are pushed toward:

- rebuilding broad read models above the substrate
- inventing application-local observer semantics
- treating speculative lanes as ad hoc patch sessions instead of durable working
  sets
- mixing low-level graph mechanics with product/governance meaning

git-warp should own the substrate mechanics for worldlines, observers, working
sets, ticking, and transfer. Higher layers should own policy and business
meaning.

---

## Direction

The intended public boundary is:

- **`WarpGraph` is plumbing**
  - substrate/session object
  - owns materialization, query/traversal plumbing, persistence, and reducer
    orchestration
  - should not be the normal application-facing read/write abstraction

- **`Observer` is the read porcelain**
  - read-only
  - worldline-relative
  - access-policy aware
  - seekable within lawful bounds
  - the right abstraction for higher-layer reads

- **`WorkingSet` is the speculative write porcelain**
  - pinned base observation plus overlay
  - durable speculative lane
  - writable through intents/ticks or equivalent working-set mutation paths
  - the right abstraction for higher-layer divergent planning

- **transfer / collapse stays substrate-factual**
  - compare candidate truth against target truth
  - compute deterministic deltas and receipts
  - do not invent approval/governance meaning inside git-warp

This keeps the substrate honest:

- git-warp owns causal mechanics
- higher layers own policy, governance, and domain judgment

---

## Current Reality

Current git-warp behavior is close to this model, but does not yet present it
cleanly enough as the primary story:

- `WarpGraph` already supports coordinate materialization, queries, traversal,
  comparison, and working-set APIs.
- observer views already exist and are read-only.
- working sets already pin a base observation and store a divergent overlay.
- braid support already lets multiple working-set effects be present together at
  one observation surface.
- transfer planning already computes deterministic substrate deltas without
  mutating either side.

The mismatch is mainly one of boundary and emphasis:

- `WarpGraph` still looks like the normal application API.
- observers are documented as a projection feature rather than the preferred
  read abstraction.
- working sets are documented as durable coordinates with overlays, but not yet
  strongly enough as the preferred speculative write abstraction.
- ticking / intent admission / counterfactual recording are not yet the dominant
  public write story.

---

## Desired Semantics

### Reads

Higher layers should think in terms of:

- choose a worldline
- choose an observer/access policy
- optionally seek to a coordinate
- read through the observer

The substrate may still use `WarpGraph`, materialized states, or state readers
under the hood, but higher layers should not need to reinvent that boundary.

### Speculation

Higher layers should think in terms of:

- create a working set from a base observation
- enqueue or apply speculative intent to that working set
- tick or otherwise advance the working set without advancing canonical truth
- compare multiple candidate lanes
- transfer/collapse one chosen lane into a target worldline under higher-layer
  policy

This is a better fit for agentic search and human-supervised planning than
direct raw mutation against one live graph handle.

### Historical Inspection

Materialized state objects and state readers remain valuable, but they are
substrate helpers:

- immutable historical inspection
- deterministic comparison inputs
- portable factual envelopes

They are not a substitute for the higher-level read boundary that observers
should provide.

---

## Non-Goals

This document does **not** say:

- every application must stop using `WarpGraph` immediately
- git-warp should embed application policy or governance
- every speculative lane must collapse automatically
- observer semantics should contain business logic

This is a boundary clarification and API-direction note, not a claim that the
entire migration is already complete.

---

## Implications

Near-term implications for git-warp:

1. Strengthen observer documentation and APIs as the primary read-side story.
2. Strengthen working-set documentation and APIs as the primary speculative
   write-side story.
3. Keep transfer/collapse facts substrate-only.
4. Keep higher-layer governance semantics out of git-warp.
5. Prefer immutable/read-local helpers like state readers over encouraging
   higher layers to rebuild broad graph-shaped projections above the substrate.

Near-term implications for integrators:

1. Prefer observers for reads when building app-facing read surfaces.
2. Prefer working sets for speculative mutation and future search.
3. Treat `WarpGraph` as the lower-level substrate/session object rather than the
   full product API.

---

## Development Standard

Changes in this area should follow the same disciplined loop used in higher
layers:

1. design docs first
2. tests as executable spec second
3. implementation third
4. playback and reconciliation after the slice lands

Local red while iterating is fine. Shared branches and submitted work should be
green.
