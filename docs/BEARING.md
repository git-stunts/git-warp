# BEARING

Updated at cycle boundaries. Not mid-cycle.

Scope note:

- `BEARING` says where the repo stands now, what feels wrong now, and what is
  next.
- For canonical noun meanings, use [GLOSSARY.md](GLOSSARY.md).
- For the runtime architecture ladder, use
  [0035-observer-geometry-architecture-ladder.md](design/0035-observer-geometry-architecture-ladder.md).
- For later-major horizon planning, use
  [release-horizon-v20-v21.md](design/release-horizon-v20-v21.md).

## Where are we

`git-warp` is in a transitional but much better-named place.

The current release ladder is now explicit:

- `v17.0.0`: TypeScript migration and bounded-residency ORSet groundwork
- `v18.0.0`: graph substrate convergence
- `v19.0.0`: observation, doctrine, and slice-first runtime convergence
- `v20.0.0`: slice-first read execution
- `v21.0.0`: distributed observer geometry and admission reality

The biggest change this cycle is not runtime behavior yet. It is
architecture truthfulness:

- [GLOSSARY.md](GLOSSARY.md) now names the canonical meaning of the core nouns
- [0035-observer-geometry-architecture-ladder.md](design/0035-observer-geometry-architecture-ladder.md)
  now states the target read/runtime architecture
- [release-horizon-v20-v21.md](design/release-horizon-v20-v21.md) now says
  how later majors likely harden

The runtime is still partially state-first in important places, but the repo no
longer has to guess what “better” means.

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

## What just shipped

Cycle `0035-observer-geometry-architecture-ladder`:

- canonical glossary of core read/runtime nouns
- observer-geometry architecture ladder
- `v20` / `v21` release horizon note
- promoted `v19.0.0` backlog ladder for:
  - bounded support rules
  - causal indexes
  - support-scoped fragments
  - first-class diff/change surfaces
- doc ratchet tests protecting the new glossary and ladder artifacts
- cycle-boundary refresh of `BEARING` and `VISION`

## What feels wrong

- The runtime still teaches older assumptions in too many code paths:
  materialize substantial state, then project/filter/query.
- `Observer` is still thinner than the noun the glossary now defines.
- `Aperture` is still closer to a visibility policy than a full read boundary.
- `Worldline` is still a pinned read handle, not the fuller history/basis noun.
- Strands and sync/admission still lag the stronger WARP line tracked in
  [WARP_DRIFT.md](audits/WARP_DRIFT.md).
- `WarpRuntime` still survives as transitional scaffolding, even though the
  repo now has a much clearer ladder for what should replace its assumptions.

## What comes next

- **Next cycle:** add glossary/ladder crosslinks to
  [WARP_DRIFT.md](audits/WARP_DRIFT.md)
- **Cycle after that:** re-slot the remaining drift against `v19`, `v20`, and
  `v21`
- **v18.0.0:** graph substrate convergence
- **v19.0.0:** observer/doctrine/runtime convergence
- **v20.0.0:** slice-first read execution
- **v21.0.0:** distributed observer geometry and admission reality
