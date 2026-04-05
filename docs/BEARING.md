# BEARING

Updated at cycle boundaries. Not mid-cycle.

## Invariants

Compact list here; full derivations with paper grounding, codebase
mapping, and concrete checks live in `docs/invariants/`.

1. **TICK-CONFLUENCE** — same patches, any order, same materialized state
   (Paper II Thm 5.1, OG-4 Thm 10) → `tick-confluence.md`
2. **HOLOGRAPHIC-BOUNDARY** — initial state + patch chains = complete replay,
   no ambient state (Paper III Thm 4.1) → `holographic-boundary.md`
3. **BACKWARD-PROVENANCE** — every value traces to exactly one producing
   patch (Paper III Thm 4.2) → `backward-provenance-completeness.md`
4. **PAYLOAD-MONOID** — checkpoint + remaining patches = full replay
   (Paper III Prop 3.2) → `payload-monoid.md`
5. **STATE-PROVENANCE-SEP** — state convergence does not imply history
   convergence (OG-4 Prop 13, OG-1 Thm 91) → `state-provenance-separation.md`
6. **EXPLICIT-CONFLICT** — conflicts are surfaced, never silently erased
   (OG-4 Thm 15) → `explicit-conflict-surfacing.md`
7. **APPEND-ONLY** — Git history never rewritten
   (Paper III Def 3.6) → `append-only-history.md`
8. **DOMAIN-PURITY** — domain never imports infrastructure or ambient state
   (Paper III Rmk 3.4) → `domain-purity.md`
9. **WRITER-ISOLATION** — each writer owns its own ref, no coordination
   (Paper II Thm 7.1, OG-4 Thm 10) → `writer-isolation.md`
10. **TWO-PLANE-COMMUTATION** — property and topology ops commute
    (Paper II Thm 7.1) → `two-plane-commutation.md`
11. **CAS-ATOMICITY** — writer ref updates are compare-and-swap
    (Paper II Rmk 4.3) → `cas-atomicity.md`
12. **OBSERVER-DETERMINISM** — queries and traversals are deterministic
    functions of state (Paper IV Def 3.1) → `observer-projection-determinism.md`
13. **TRAVERSAL-TRUTH** — streams for traversal, ports for truth
    (OG-1 Def 3, Paper IV Sec 3.3) → `traversal-truth.md`
14. **NO-SCALARIZATION** — observer comparison is multi-dimensional
    (OG-1 Thm 87) → `no-scalarization.md`
15. **SUFFIX-TRANSPORT** — sync at tip, not replay from frontier
    (OG-4 Thm 9) → `suffix-transport-correctness.md`

Legacy shorthand (subsumed by the above):
- HEXAGONAL → DOMAIN-PURITY
- DETERMINISTIC → TICK-CONFLUENCE
- MULTI-WRITER → WRITER-ISOLATION
- RUNTIME-TRUTH → retained as engineering doctrine (SSJS P1)
- BOUNDARY-HONESTY → retained as engineering doctrine (SSJS P2)

## Where are we going?

Structural decomposition of `domain/services/` — 83 files in a flat
directory becoming 10 cohesive subdirectories. 10 extraction backlog
items queued in `up-next/` under the CC legend.

## What just shipped?

Cycle 0004 (domain-services-audit). Design-only cycle — import graph
analysis, 10 cohesive groups identified, no circular dependencies.

## What feels wrong?

- ~~WorldlineSource~~ Shipped as WorldlineSelector hierarchy (cycle 0007).
- 20 domain services do serialization directly (`codec.encode()`/
  `codec.decode()`). The fix is a two-stage boundary: artifact-level
  ports (PatchJournalPort, CheckpointStorePort, etc.) that speak
  domain types, backed by codec-owning adapters over the raw Git
  ports. Strangler refactor, patches first.
  See `NDNM_defaultcodec-to-infrastructure.md`.
- The two legends (CLEAN_CODE, NO_DOGS_NO_MASTERS) overlap
  significantly. May need consolidation or clearer boundaries.
- JoinReducer is imported by 8 of 10 service clusters — it is the
  gravitational center. Any structural change to JoinReducer has
  wide blast radius.
- The shared kernel (~24 files in services/ root after extraction)
  is still a big drawer. Revisit after the 10 extractions stabilize.
