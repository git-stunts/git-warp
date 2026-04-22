---
id: PROTO_strand-collapse-optic-for-causal-slicing
feature: merge-strands-worldlines
blocked_by: []
blocks:
  - PROTO_local-site-object-for-neighborhoods
  - PROTO_strand-collapse-implementation
---

# Strand Collapse Optic For Causal Slicing

**Effort:** L

## Problem

git-warp has the substrate pieces for speculative work (`Strand`),
canonical admitted lanes (`Worldline`), and a working optic framing,
but it does not yet have a first-class collapse operation that turns a
subset of strand activity into canonical provenance lawfully.

This matters directly for Graft. Graft is using git-warp to extend Git
with a causal layer that tracks meaningful activity between "hard" Git
commits. The product goal is not just to keep speculative session
history around, but to preserve why an eventual staged and committed
change happened.

That gap matters for the "between Git commits" product story. A session
may touch dozens of files, but later stage and commit only one file. If
collapse means "admit the whole strand," canonical history gets noisy
and misleading. If collapse means "drop the speculative history and
keep only the final commit," the system loses the causal explanation for
why the change was made.

The missing feature is a causal-slice collapse:

- keep the full strand as raw between-commit history
- derive the causal cone for the staged artifact set
- project only the relevant strand activity into canonical provenance /
  admitted truth

## Notes

- Treat collapse as a WARP optic `Ω = (π, φ, ρ, ω, σ)`, not as an ad hoc
  copy from strand to worldline.
- The input whole is likely braid-level causal state, not just the live
  worldline, because collapse must see speculative strand history and
  existing admitted history together.
- `π` should project the observer-relative visible causal history for the
  target.
- `φ` should focus on the staged artifact footprint, starting with staged
  path sets and later refining to symbol- or region-level footprints.
- `ρ` should rewrite the focused speculative history into an admitted
  canonical provenance slice.
- `ω` should preserve enough witness information to explain and locally
  reassemble the correspondence between the strand history and the
  admitted result.
- `σ` should reintegrate the admitted slice into canonical truth without
  destroying the original strand history.
- Shared events may legitimately participate in multiple collapse
  projections. Collapse should be projection / inclusion, not destructive
  migration.
- Not every strand event should collapse into canonical structural
  truth. Some events belong in canonical provenance or audit, and some
  may remain strand-local only.
- This likely requires substrate nouns and APIs for:
  - collapse target
  - causal slice
  - collapse record
  - provenance witness
  - strand-to-worldline admission semantics

## Witnesses

- Session touches many files, but only one staged file collapses; the
  resulting canonical provenance contains only the relevant strand slice.
- One speculative event contributes to two later staged files; both
  collapse projections can reference it without duplicating or destroying
  the raw strand history.
- Collapse preserves enough witness information to answer "why did this
  committed file change happen?" using pre-commit activity.

## Release home

Likely release home: `v20` to `v21`.

The causal-slicing optic belongs after the `v19` read/runtime noun cleanup. The
slice-first execution side is `v20`; the fuller strand-collapse and
plurality-preserving semantics likely extend into `v21`.

## Source

- Graft design discussion, 2026-04-09
- `/Users/james/git/aion-paper-07/optics/warp-optic.tex`
