# BEARING

Updated at cycle boundaries. Not mid-cycle.

## Where are we

v17.0.0 release candidate. Source and tests are 100% TypeScript.
All gates at zero (tsc, lint, tests). `openWarpGraph()` ships as the
new public entry point with 9 capability namespaces organized around
the admission architecture (commitment / folding / revelation /
governance).

WarpRuntime (773 LOC) and _wiredMethods.d.ts (708 LOC) remain as the
last pre-admission-kernel artifacts. They die when consumers migrate
to `openWarpGraph()` capabilities (v18 target).

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

v17.0.0 cycle (Claudius Maximus I → II: DEATHBRINGER → III: WORLDBUILDER THE TRIUMPHANT):

- 100% TypeScript source (374 .ts / 0 .js in src/)
- 100% TypeScript tests (378 .test.ts / 0 .test.js)
- Zero tsc errors, zero lint errors, zero test failures
- `openWarpGraph()` factory with admission architecture surface
- 30+ god objects slain, all source files under 500 LOC
- 4 design cycles opened and closed (0014-0017)
- Migration guide and automated migration scripts

## What feels wrong

- WarpRuntime is a 773-LOC devil that wires 30+ methods via
  defineProperty. It must die (Design 0017 Phase 2+).
- `collapseBraid()` does not exist. The runtime spec (§12) defines
  it, Paper VII (§3) requires it, Graft needs it. Filed as
  `PROTO_strand-collapse-implementation`.
- 42 CLI files remain as JavaScript. Deferred to v17.1 alongside
  the agent-native output pattern (Design 0014).
- The admission kernel (Design 0017) is designed but not implemented.
  The code applies operations; Paper VII says it should admit claims.

## What comes next

- **v17.0.0**: Ship. The fortress is built.
- **v17.1**: CLI TS conversion + agent-native output + missing commands
- **v17.2**: MCP server (`git warp mcp`)
- **v18**: The exorcism (API_kill-warpruntime) + admission kernel Phase 1
