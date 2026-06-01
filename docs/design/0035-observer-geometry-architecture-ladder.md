---
title: 'Observer geometry architecture ladder'
cycle: '0035-observer-geometry-architecture-ladder'
---

# Observer Geometry Architecture Ladder

## Why this exists

The repo already has three important facts on the table:

1. The old noun audit (`0006`) proved that several public nouns are
   misaligned with the theory the repo actually wants.
2. The newer Observer Geometry and WARP optics work explains the right
   higher-order shape for read semantics.
3. Runtime work like unified snapshots, receipts, provenance, and slice
   materialization already hints at a better execution model than
   “materialize the whole graph, then filter it.”

What the repo has been missing is the wall-chart:

- one canonical glossary
- one declared target architecture
- one explicit ladder from current runtime to that target

This cycle supplies those artifacts.

## Canonical artifacts

- [docs/GLOSSARY.md](../GLOSSARY.md) is the canonical noun source of truth.
- This design doc is the canonical architecture ladder from current runtime
  behavior to the intended observer/optic runtime.
- [release-horizon-v20-v21.md](./release-horizon-v20-v21.md) sketches how
  the ladder likely hardens into later majors once `v18` and `v19` land.

## Hill

A contributor can read one glossary and one design doc, then answer:

- what the core nouns mean
- which nouns are shipped runtime truth versus target-model doctrine
- how the ideal slice-first observer runtime should work
- which backlog items move the repo toward that runtime

## Design goals

1. Declare the ideal read architecture for `git-warp` in plain repo-facing
   terms.
2. Define the glossary and its status model so future docs and APIs stop
   drifting.
3. State which nouns need new shapes and which nouns are still missing.
4. Define the architectural ladder from today’s full-state-biased runtime to
   an optic/aperture/support/index/fragment runtime.
5. Promote the already-discovered cool ideas into a real future lane so the
   ladder becomes backlog, not folklore.

## Non-goals

- No attempt to ship the whole observer-geometry runtime in one cycle.
- No major public API renames in this cycle.
- No claim that current runtime already satisfies the target noun law.

## Core diagnosis

The current runtime is caught between two models:

- **current operational model**:
  materialize substantial graph state, then project/filter/query
- **target model**:
  interpret the read request, derive bounded support, reuse fragments and
  indexes, and only materialize missing support

This is why so many concepts feel half-right:

- `Observer` exists, but mostly as a projection/filter surface
- `Aperture` exists, but mostly as a visibility policy
- `materializeSlice()` exists, but not as the dominant read execution model
- receipts and provenance exist, but not as a unified change-query surface

## Ideal architecture

### 1. Ask for a read, not a procedure

Applications should ask `git-warp` questions in semantic terms:

- removed edges between two coordinates
- state of entity `X` at coordinate `C`
- neighborhood of `X` under aperture `A`
- diff between coordinates `C0` and `C1`

The caller should not have to script:

- full materialization
- client-side diffing
- candidate discovery by full scan

### 2. Optic expresses the question

The **optic** is the semantic read noun. It says what the caller wants to
know.

Examples:

- `RemovedEdgesInIntervalOptic`
- `EntityStateAtCoordinateOptic`
- `NeighborhoodOptic`
- `GraphDiffOptic`

### 3. Aperture expresses the read boundary

The **aperture** says what read universe is in play:

- which basis / coordinate system
- which visibility or redaction rules
- which lane/worldline mount
- which rights-limited boundary

### 4. Bounded support rule makes the read operationally honest

The runtime derives a **bounded support rule** from the optic and aperture.

This answers:

> what is the smallest causally sufficient support set for this read?

Without this step, the runtime cannot safely answer local questions without
whole-graph fallback.

### 5. Causal indexes make discovery cheap

Once the support rule is known, **causal indexes** help find the relevant
support:

- affected patches/entities for an interval
- nearest reusable support fragment
- namespace/prefix-local change candidates
- touched entities for a tick or patch

### 6. Support fragments make reuse cheap

The runtime should cache **support fragments**, not just one singular global
materialized state.

A support fragment is reusable only if it records:

- the support contract it satisfies
- the coordinate it is complete through
- the fragment state / descriptor
- provenance posture

### 7. Materialization plan fills the gaps

The runtime then chooses a **materialization plan**:

- exact fragment hit
- compatible predecessor fragment
- receipt-only path
- diff/index path
- targeted replay for missing support
- full-state fallback only when the question is truly global

## Missing nouns

These nouns are missing as first-class runtime concepts today:

- `Optic`
- `bounded support rule`
- `causal index` as one explicit runtime family
- `support fragment`
- `materialization plan`
- `GraphDiff`
- `Witness`

## Nouns that need new shapes

These nouns already exist, but their shipped shape is too thin for the
target architecture:

- `Observer`
  - current shape: projection/filter over materialized state
  - target shape: realized read surface for an optic through an aperture
- `Aperture`
  - current shape: `match/expose/redact`
  - target shape: read boundary rich enough to participate in support
    derivation
- `Worldline`
  - current shape: pinned read handle
  - target shape: durable history/basis noun, not just a facade
- `TickReceipt`
  - current shape: operational receipt
  - target shape: still valid, but explicitly larger than a witness

## Internal mechanisms the runtime still lacks

To make the ideal flow real, `git-warp` still needs:

1. **slice-first public read surfaces**
   APIs that ask local questions directly instead of forcing whole-graph
   materialization plus client-side processing.

2. **support derivation**
   A runtime mechanism that turns optic + aperture into a bounded support
   rule.

3. **causal index families**
   Materialized, rebuildable structures for interval diffs, affected entities,
   fragment predecessor lookup, and similar discovery work.

4. **fragment-aware caches**
   Support-scoped fragment descriptors and reuse paths instead of one implicit
   full-state cache.

5. **change-first read surfaces**
   Especially a first-class `GraphDiff` / interval change API so apps stop
   abusing query scans for change detection.

6. **noun-driven documentation discipline**
   Public docs and APIs must point back to the glossary when teaching these
   terms.

## Architectural ladder

### Rung 1 — Canonical nouns

Ship and teach one canonical glossary.

Success criteria:

- docs stop freelancing core terms
- new design docs reference the glossary instead of redefining nouns ad hoc

### Rung 2 — Slice-first read surfaces

Start exposing explicit local reads:

- entity-at-coordinate
- interval-diff
- bounded neighborhood
- receipt-readable observers

Success criteria:

- callers can ask local questions without orchestrating whole-graph reads

### Rung 3 — Support rules

Attach or derive bounded support rules for those read surfaces.

Success criteria:

- each local read API has an honest support contract
- runtime can tell when a partial fragment is sufficient

### Rung 4 — Causal indexes

Build rebuildable accelerators for support discovery.

Success criteria:

- interval and entity-local reads stop paying graph-size discovery costs

### Rung 5 — Support fragments

Replace the “one full cached state” bias with support-scoped fragment reuse.

Success criteria:

- exact or predecessor fragment reuse becomes standard for local reads
- full-state materialization becomes fallback, not default

### Rung 6 — Public noun alignment

After the runtime truly supports the new model, narrow the remaining noun
drift in public APIs and teaching docs.

Success criteria:

- public docs teach what the runtime really does
- public nouns no longer force old whole-state mental models

## Backlog ladder

The immediate ladder items are:

- [HYGIENE_warp-doctrine-runtime-alignment](https://github.com/git-stunts/git-warp/issues/556)
- [PROTO_bounded-support-rules-for-query-surfaces](https://github.com/git-stunts/git-warp/issues/558)
- [PROTO_causal-indexes-for-sliced-queries](https://github.com/git-stunts/git-warp/issues/559)
- [PROTO_support-scoped-fragment-materialization](https://github.com/git-stunts/git-warp/issues/562)
- [PROTO_tick-range-graph-diff-api](https://github.com/git-stunts/git-warp/issues/563)

These should be read as a ladder, not as disconnected ideas.

## Playback questions

### Agent

- Can I explain how a read should flow from optic to observer without
  appealing to whole-graph default materialization?
- Can I name which nouns are shipped, transitional, and target-only?
- Can I point to the specific backlog items that implement the ladder?

### Human

- Does the glossary feel like the right wall-chart for future design work?
- Does the architecture ladder feel like repo reality, not theory cosplay?
- Do the promoted backlog items look like the right path toward the ideal
  runtime?

## Test plan

This is a documentation/architecture cycle, so the red/green work for later
implementation cycles should verify the ladder, not this doc alone.

### Golden path

- future slice-first read APIs answer local questions without whole-graph
  materialization
- interval diff surfaces return structural and property deltas directly
- support fragments can be reused for exact and predecessor-compatible reads

### Edge cases

- incomparable frontiers must not reuse the wrong fragment
- degraded provenance fragments must not satisfy provenance-rich reads by
  accident
- discovery queries without an index must still surface honest cost or full
  fallback

### Known failure modes

- `query().match("sym:*")` style full scans disguised as local APIs
- fragment caches keyed only by time instead of support + coordinate
- indexes that cannot be rebuilt from repo truth
- docs teaching target nouns as if they are already shipped runtime law

## Immediate doc rule

From this cycle forward:

- new design docs that introduce or refine a core noun should reference
  [docs/GLOSSARY.md](../GLOSSARY.md)
- public-facing docs should point readers there when they teach the core read
  model

## Playback

### Witness

The cycle witness is concrete and repo-local:

- the canonical glossary now exists at `docs/GLOSSARY.md`
- the architecture ladder exists at `docs/design/0035-observer-geometry-architecture-ladder.md`
- the release horizon exists at `docs/design/release-horizon-v20-v21.md`
- the promoted runtime-ladder notes now live in `docs/method/backlog/v19.0.0/`
- `docs/GUIDE.md` and `docs/CONCEPTUAL_OVERVIEW.md` point readers to the
  glossary
- the doc-shape contract is ratcheted by:
  - `test/unit/scripts/glossary-shape.test.ts`
  - `test/unit/scripts/observer-geometry-ladder-shape.test.ts`

Verification command:

```sh
npm exec vitest run \
  test/unit/scripts/glossary-shape.test.ts \
  test/unit/scripts/observer-geometry-ladder-shape.test.ts
```

### Agent playback

Question:

> Can I explain how a read should flow from optic to observer without
> appealing to whole-graph default materialization?

Answer:

Yes. The glossary and ladder now make the flow explicit:

1. an app asks an `Observer` to answer an `Optic`
2. the read is bounded by an `Aperture` at a `Coordinate`
3. the runtime derives a `bounded support rule`
4. `causal indexes` and `support fragments` help find and reuse support
5. a `materialization plan` fills the remaining gap
6. the observer returns the read, optionally with `TickReceipt`,
   `Witness`, or `GraphDiff`

Question:

> Can I name which nouns are shipped, transitional, and target-only?

Answer:

Yes. `docs/GLOSSARY.md` now marks each noun with exactly that status model.

Question:

> Can I point to the specific backlog items that implement the ladder?

Answer:

Yes. The ladder now points directly at:

- `HYGIENE_warp-doctrine-runtime-alignment`
- `PROTO_bounded-support-rules-for-query-surfaces`
- `PROTO_causal-indexes-for-sliced-queries`
- `PROTO_support-scoped-fragment-materialization`
- `PROTO_tick-range-graph-diff-api`

Verdict: pass.

### Human playback

Question:

> Does the glossary feel like the right wall-chart for future design work?

Answer:

Yes. It gives one canonical answer for what the core nouns mean and whether
they are shipped, transitional, or target-only.

Question:

> Does the architecture ladder feel like repo reality, not theory cosplay?

Answer:

Yes, with one important limit: it is a planning and noun-discipline success,
not a runtime implementation success. The ladder is honest because it names the
missing runtime machinery instead of pretending it already exists.

Question:

> Do the promoted backlog items look like the right path toward the ideal
> runtime?

Answer:

Yes. They form a coherent read-side ladder: support rules, indexes, fragments,
and diff surfaces.

Verdict: pass.

## Drift check

### Core hill drift

No negative drift on the main hill.

The cycle promised:

- one canonical glossary
- one architecture ladder
- one promoted backlog ladder for the read-side/runtime follow-through

Those all landed as designed.

### Additive drift

Two useful things were added beyond the original narrow design statement:

1. A separate release-horizon note:
   - `docs/design/release-horizon-v20-v21.md`

   This is additive drift, not contradiction. It gave the ladder a clearer
   place in the longer major-version story without muddying the glossary.

2. Two `up-next/` follow-through notes:
   - `DX_warp-drift-ledger-crosslinks`
   - `PROTO_remaining-warp-drift-release-slotting`

   These were not part of the initial hill, but they are coherent cycle-end
   consequences of the design work and help prevent the new docs from becoming
   a dead end.

### Test-plan drift

The original test plan said later implementation cycles should verify the
ladder, not this doc alone.

What actually happened:

- this cycle added immediate doc-shape ratchet tests for the glossary and
  architecture ladder

That is a helpful tightening, not a violation. It means the new doc surfaces
are now protected by an explicit contract instead of relying only on prose.

### Verdict

Acceptable drift only.

The cycle expanded slightly in scope, but it expanded in the direction of
making the glossary/ladder work more durable and more connected to repo
planning. No part of the implementation undercut the design claim.
