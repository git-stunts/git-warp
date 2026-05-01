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

`git-warp` is in a v17 deslugging checkpoint after closing cycle
`0105-runtimehost-query-materialization-port-seam`.

Current branch state at handoff:

- Branch: `release/v17.0.0`
- Local state: clean working tree at closeout
- Local commits: ahead of `origin/release/v17.0.0` by 35 commits
- Push state: not pushed
- Last closed cycle:
  `0105-runtimehost-query-materialization-port-seam`
- Latest closeout commit:
  `5068468c docs: close query read model seam cycle`
- Latest implementation commit:
  `70ddb2bd refactor: introduce query read model seam`

The current release ladder remains:

- `v17.0.0`: TypeScript migration and bounded-residency ORSet groundwork
- `v18.0.0`: graph substrate convergence
- `v19.0.0`: observation, doctrine, and slice-first runtime convergence
- `v20.0.0`: slice-first read execution
- `v21.0.0`: distributed observer geometry and admission reality

Recent work shifted from release-speed card churn to explicit
deslugging. Cycles `0102` through `0105` repaired the public snapshot
value model, restored the consumer typecheck gate, surveyed structural
sludge, and cut the first RuntimeHost/query seam.

The runtime is still partially state-first in important places. The
important current truth is narrower: `QueryRunner` no longer owns a
full-materialization contract, but other traversal, observer/worldline,
storage, and RuntimeHost seams still do.

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

Cycle `0105-runtimehost-query-materialization-port-seam`:

- Added a query-owned `QueryReadModelProvider` / `QueryReadModel` seam.
- Replaced `QueryRunner`'s RuntimeHost-shaped dependency with the narrow
  read-model provider.
- Removed `_materializeGraph`, full adjacency, full node-list, and
  `getEdges()` as `QueryRunner` contract requirements.
- Preserved `graph.query()`, `observer.query()`, and `worldline.query()`
  as public ergonomic paths.
- Kept Observer/read perspective as the semantic query owner.
- Added behavioral RED coverage proving bounded exact-match id-only
  queries do not drain a fake lazy node stream.
- Closed the cycle with Playback, Drift Check, Retrospective, and Cycle
  End in
  [0105-runtimehost-query-materialization-port-seam.md](design/0105-runtimehost-query-materialization-port-seam.md)
  and
  [0105-runtimehost-query-materialization-port-seam.md](method/retros/0105-runtimehost-query-materialization-port-seam.md).

## What feels wrong

- The branch has 35 local commits and is not pushed. That is a safety
  risk until a push-readiness checkpoint and validation run happen.
- 0105 fixed one seam only. It did not fix all query, traversal,
  observer/worldline, storage, or RuntimeHost materialization seams.
- `LogicalTraversal` remains a likely next seam because it still has
  broad materialization and `unknown` / `Record<string, unknown>`
  residue.
- `TraversalContext.ts` and `traversalHelpers.ts` still contain existing
  traversal boundary/modeling sludge.
- Legacy query-builder tests still contain pre-existing `any` / `as any`
  scaffolding.
- v17 release readiness is not established. Recent focused validation is
  green, but full branch validation has not been run after the closeout.

## What comes next

Do not start code next. Start with a branch safety checkpoint only.

Required next-session checkpoint:

1. Current branch and clean/dirty status.
2. Commits ahead of origin.
3. Latest 20 commits grouped by cycle.
4. Current design cycle statuses from `0102` through `0105`.
5. Whether all recent cycles are closed / hill met.
6. Last known green validation for:
   - `npm run typecheck`
   - `npm run lint:sludge`
   - `npm run typecheck:consumer`
   - 0105 query seam conformance
   - targeted query/controller tests
7. Whether a full validation run is needed before push.
8. Whether the branch is safe to push after validation.
9. Recommended next action.

Likely next action after checkpoint:

- Run full validation before any push.
- Push only after explicit approval.
- If continuing deslugging after the branch is anchored, pull exactly one
  narrow seam. Do not resume broad RuntimeHost cleanup or broad 0096 by
  reflex.
