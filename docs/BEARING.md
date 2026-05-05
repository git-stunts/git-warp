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

`git-warp` is executing the v17 release-blocker DAG. The current work is
not a broad RuntimeHost rewrite; it is one bounded release blocker at a
time, with the DAG status and SVG kept current after each completed
cycle.

Current branch state at this boundary:

- Branch: `release/v17.0.0`
- Push state: local branch remains ahead of `origin/release/v17.0.0`;
  push only after explicit approval.
- DAG map:
  [0124-v17-release-blocker-dag.md](design/0124-v17-release-blocker-dag.md)
- Latest closed cycle:
  `0131-checkpoint-schema-upgrade-path`
- Latest full unit gate shape:
  `npm run test:local` is still red with `71` failures across `19`
  files. Focused patch-controller and checkpoint upgrade witnesses are
  green.

The current release ladder remains:

- `v17.0.0`: TypeScript migration, public API honesty,
  materialization-frontdoor deletion, readings/optics direction, and
  query read-model groundwork
- `v18.0.0`: graph substrate convergence
- `v19.0.0`: observation, doctrine, and slice-first runtime convergence
- `v20.0.0`: slice-first read execution
- `v21.0.0`: distributed observer geometry and admission reality

Recent work narrowed v17 honestly, removed public materialization
frontdoor docs, fixed runtime read guidance, made checkpoint schema `5`
the single runtime checkpoint contract, and removed the checkpoint
controller and patch controller private materialization dependencies.
The package upgrade command now has a real checkpoint upgrade path for
retired checkpoint envelopes.

The runtime is still partially state-first in important places. The
important current truth is narrow: checkpoint creation now requires an
available reading basis and patch creation no longer manufactures state
through hidden materialization, but sync, subscription/watch, observer
coordinate pinning, and stale materialize-spy clusters still block the
release gate.

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

Cycles `0130-patch-controller-reading-basis` and
`0131-checkpoint-schema-upgrade-path`:

- Removed `_materializeGraph()` from the `PatchController` host contract.
- Made additive patch creation independent of cached state while keeping
  state-dependent freshness checks fail-closed on missing or dirty cached
  state.
- Deleted the runtime `MigrationService` export and moved retired
  visible-state conversion into `scripts/migrations/v17.0.0/`.
- Implemented `npm run upgrade -- --graph <name>` for checkpoint
  envelope upgrades: dry-run reads safely, successful upgrades verify the
  new checkpoint before moving the checkpoint ref, and already-current
  checkpoints are no-ops.
- Marked `PORT_patch-controller-reading-basis` and
  `SPEC_uniform-git-cas-upgrade-contract-drift` complete in the DAG,
  regenerated the SVG, and recorded closeouts in
  [0130-patch-controller-reading-basis.md](design/0130-patch-controller-reading-basis.md),
  [0130-patch-controller-reading-basis.md](method/retros/0130-patch-controller-reading-basis.md),
  [0131-checkpoint-schema-upgrade-path.md](design/0131-checkpoint-schema-upgrade-path.md),
  and
  [0131-checkpoint-schema-upgrade-path.md](method/retros/0131-checkpoint-schema-upgrade-path.md).

## What feels wrong

- `npm run test:local` is still red. Do not describe v17 as releasable
  until the DAG reaches `REL_full-gate-matrix-green`.
- `SyncController` still calls `_materializeGraph()` before applying
  sync responses without a cached state.
- Subscription/watch tests still assert materialization as the freshness
  mechanism.
- Retired-schema and materializeAt tests still contain stale assumptions
  after the current checkpoint boundary.
- Broader historical version-suffixed substrate names still exist in
  `src/`; the checkpoint upgrade slice removed the touched checkpoint and
  migration names only.
- The branch remains local-only relative to origin; pushing is a separate
  release/coordination decision.

## What comes next

Continue executing the DAG one open node at a time.

Recommended next pull:

- `PORT_subscription-controller-reading-basis`

Why:

- It is open.
- Patch freshness/read-basis behavior is now available as its parent.
- It removes the next direct materialization seam in the public
  watch/subscription workflow.
- It keeps sync security hardening out of the same diff.

Keep the loop strict: write the cycle doc, capture RED, green the slice,
update changelog/DAG/SVG/retro, validate, commit, then pull the next open
node.
