# Cycle 0017 Retro — The Admission Kernel

**Status:** DESIGN COMPLETE — implementation spans v18-v20

## What ground was taken

Audited git-warp against Paper VII's full architectural specification.
Produced a 10-item gap map across 4 layers (structural, semantic,
trust, privacy). Designed the admission kernel as a generic interface
with three scale instantiations. Defined a 6-phase migration path
that wraps existing code rather than replacing it. Identified the
bounded site (`chi`) as the most acutely missing piece.

The user refined the design with:
- `PluralArtifact<R>` with cell-level structure for plurality
- Clarification that `BoundedSite` should absorb existing footprint
  work, not fork it
- Clarification that `Pack(R, W) = theta` produces scale-appropriate
  shell families, not always a BTR
- Clarification that Phase 2 is only honest if site semantics are
  derived from real footprint logic

## Backlog items produced

- `PROTO_strand-collapse-implementation` (up-next) — Phase 1:
  outcome types + `collapseBraid()`. Graft dependency.
- Design 0017 itself as the roadmap for Phases 2-6

## What we learned

1. **git-warp implements the mechanisms but not the architectural
   center.** Frontier-relative materialization, strands, braids,
   BTRs, conflict analysis, trust evaluation — all real. But they
   aren't organized around an explicit admission act. The code
   applies operations; Paper VII says it should admit claims.

2. **The admission kernel wraps, it doesn't replace.** JoinReducer
   is the default local-tick policy. The kernel sits above it,
   adding sites, policies, and witnesses. This is the migration
   insight that makes the change tractable.

3. **Bounded sites are the hardest piece.** Everything else
   (outcome algebra, collapse, witnesses) is additive. Sites
   require understanding the semantic closure of every op — what
   read boundary, write boundary, affected region, and
   reintegration boundary each op implies. This is the piece that
   touches the reducer.

4. **Phase 1 is independently valuable.** The outcome types
   (Derived, Plural, Conflict, Obstruction) and `collapseBraid()`
   can ship without touching JoinReducer. This gives Graft what
   it needs and establishes the vocabulary for later phases.

5. **Observer collapse ≠ canonical collapse.** This distinction
   from Paper VII §4.2 / runtime spec §13 must be preserved in
   code. Observer collapse is a projection fact (lossy, no witness).
   Canonical collapse is an admission fact (full governance). The
   implementation must never conflate them.

6. **The database doesn't go away. It gets a soul.** This is the
   framing that makes the whole design cohere. git-warp remains a
   CRDT graph database. The admission kernel gives it an
   architectural center that explains why all the mechanisms exist.

## Open questions

1. **Site granularity**: Per-op, per-patch, or per-entity? The
   runtime spec says per-op with semantic closure. Performance
   implications unknown.

2. **Policy versioning**: If policies are versioned runtime objects,
   how do older policies interact with newer state?

3. **Witness size**: Full witnesses for every admission could be
   large. Content-addressed storage in git-cas?

4. **Performance**: Site computation overhead. Lazy evaluation?

5. **Backward compatibility**: Pre-kernel graphs retroactively
   admitted with default policy?

6. **The plurality question**: When collapse returns Plural with a
   cell-level `PluralArtifact`, what does the consumer DO with it?
   The paper says plurality is lawful. The runtime and UX of a
   first-class plural carrier still need design.

7. **BoundedSite vs existing footprint work**: The design says absorb,
   not fork. But the existing footprint tracking may not be rich
   enough for the full `(S_subj, R_read, W_write, E_aff, B_re)`
   decomposition. Surveying the gap is Phase 2 prerequisites.
